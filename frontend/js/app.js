import { fetchContacts, fetchTags, ApiError } from "./api.js";
import { API_BASE_URL } from "./config.js";
import {
  buildDisplayName,
  renderContactList,
  renderTagFilterOptions,
  renderContactDetail,
  renderEmptyState,
  renderLoading,
  renderErrorBanner,
} from "./render.js";

const listEl = document.getElementById("contact-list");
const listStatusEl = document.getElementById("list-status");
const detailEl = document.getElementById("contact-detail");
const searchInput = document.getElementById("search-input");
const searchClearBtn = document.getElementById("search-clear");
const tagFilterCountEl = document.getElementById("tag-filter-count");
const tagFilterSearchInput = document.getElementById("tag-filter-search");
const tagFilterOptionsEl = document.getElementById("tag-filter-options");
const tagFilterClearBtn = document.getElementById("tag-filter-clear");
const alphaIndexEl = document.getElementById("alpha-index");
const contactListFooterEl = document.getElementById("contact-list-footer");
const contactListScrollEl = document.getElementById("contact-list-scroll");

const ALPHA_INDEX_LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""), "#"];

let allContacts = [];
let allTags = [];
let selectedTags = new Set();
let currentContacts = [];
let selectedContactId = null;

// Folds a string for accent-insensitive matching: NFKD unifies compatibility
// variants (fullwidth forms, ligatures, etc.) and splits accented letters
// into base + combining marks, which are then stripped, e.g. "Jöran" ->
// "joran" so it matches a plain "Joran" query.
function normalizeForSearch(text) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function contactSearchText(contact) {
  const parts = [buildDisplayName(contact.name)];
  if (contact.name && contact.name.chinese_name) {
    parts.push(contact.name.chinese_name);
  }
  return normalizeForSearch(parts.join(" "));
}

// Score tiers, spaced far enough apart that a higher tier always outranks
// every possible score in the tier below it.
const SCORE_FULL_EXACT = 1e9; // query matches the whole name text exactly
const SCORE_WORD_EXACT = 40000; // token equals one whole word
const SCORE_WORD_PREFIX = 30000; // token matches the start of a word
const SCORE_SUBSTRING = 20000; // token appears contiguously, mid-word
const SCORE_SUBSEQUENCE = 10000; // token's letters appear in order, with gaps

const SUBSEQUENCE_MATCH = 10;
const SUBSEQUENCE_BOUNDARY_BONUS = 8;
const SUBSEQUENCE_CONSECUTIVE_BONUS = 12;
const SUBSEQUENCE_GAP_PENALTY = 1;

function isWordBoundaryChar(char) {
  return char === undefined || !/[a-z0-9]/i.test(char);
}

function wordsOf(text) {
  return text
    .split(/\s+/)
    .map((word) => word.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, ""))
    .filter(Boolean);
}

// Best-alignment score for `token` as a (possibly non-contiguous) subsequence
// of `text`, rewarding runs of consecutive characters and matches that start
// at a word boundary. Returns -Infinity if `token` isn't a subsequence at all.
function subsequenceScore(text, token) {
  const n = text.length;
  const m = token.length;
  if (m === 0) return 0;
  if (m > n) return -Infinity;

  const NEG = -Infinity;
  let prevRow = new Array(m + 1).fill(NEG);
  const prefixBest = new Array(m + 1).fill(NEG);
  prefixBest[0] = 0;

  for (let i = 1; i <= n; i++) {
    const currRow = new Array(m + 1).fill(NEG);
    const atBoundary = isWordBoundaryChar(i >= 2 ? text[i - 2] : undefined);
    for (let j = 1; j <= m; j++) {
      if (text[i - 1] !== token[j - 1]) {
        continue;
      }
      const base = SUBSEQUENCE_MATCH + (atBoundary ? SUBSEQUENCE_BOUNDARY_BONUS : 0);
      let best = NEG;
      if (j === 1) {
        best = base;
      } else {
        if (prevRow[j - 1] > NEG) {
          best = Math.max(best, prevRow[j - 1] + base + SUBSEQUENCE_CONSECUTIVE_BONUS);
        }
        if (prefixBest[j - 1] > NEG) {
          best = Math.max(best, prefixBest[j - 1] + base - SUBSEQUENCE_GAP_PENALTY);
        }
      }
      currRow[j] = best;
    }
    for (let j = 1; j <= m; j++) {
      if (currRow[j] > prefixBest[j]) {
        prefixBest[j] = currRow[j];
      }
    }
    prevRow = currRow;
  }

  return prefixBest[m];
}

// Scores one query token against a contact's search text, tiered so that an
// exact word match beats a prefix match, which beats a plain substring match,
// which beats a scattered (but in-order) subsequence match. Returns null if
// the token doesn't even match as a subsequence, meaning the contact should
// be excluded entirely.
function scoreToken(text, words, token) {
  if (words.includes(token)) {
    return SCORE_WORD_EXACT + token.length;
  }
  if (words.some((word) => word.startsWith(token))) {
    return SCORE_WORD_PREFIX + token.length;
  }
  if (text.includes(token)) {
    return SCORE_SUBSTRING + token.length;
  }
  const seqScore = subsequenceScore(text, token);
  if (seqScore === -Infinity) {
    return null;
  }
  return SCORE_SUBSEQUENCE + seqScore;
}

// Scores a contact against a query, or returns null if any query token fails
// to match at all (including as a subsequence).
function scoreContact(contact, query, tokens) {
  const text = contactSearchText(contact);
  if (text === query) {
    return SCORE_FULL_EXACT;
  }

  const words = wordsOf(text);
  let total = 0;
  for (const token of tokens) {
    const tokenScore = scoreToken(text, words, token);
    if (tokenScore === null) {
      return null;
    }
    total += tokenScore;
  }
  return total;
}

// Ranks contacts by how well they match the query, using subsequence
// matching so every token just needs its letters in order somewhere in the
// contact's name text; order-independent across tokens so "wong audrey" and
// "audrey wong" both match. Exact and word-boundary matches are scored above
// loose subsequence matches, and non-matching contacts are filtered out.
function filterContacts(contacts, query) {
  const normalizedQuery = normalizeForSearch(query.trim());
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  if (!tokens.length) {
    return [...contacts].sort(compareByName);
  }

  const scored = [];
  for (const contact of contacts) {
    const score = scoreContact(contact, normalizedQuery, tokens);
    if (score !== null) {
      scored.push({ contact, score });
    }
  }
  scored.sort((a, b) => b.score - a.score || compareByName(a.contact, b.contact));
  return scored.map((entry) => entry.contact);
}

// The letter a contact is grouped/indexed under, matching the field
// `compareByName` sorts on first so that same-letter contacts stay
// contiguous. Falls back to "#" for names that don't start with a letter.
function contactLetter(contact) {
  const first = (contact.name && contact.name.first_name) || "";
  const last = (contact.name && contact.name.last_name) || "";
  const ch = (first || last).trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : "#";
}

// Alphabetical fallback ordering: first name, then last name, case-insensitive.
function compareByName(a, b) {
  const firstA = ((a.name && a.name.first_name) || "").toLowerCase();
  const firstB = ((b.name && b.name.first_name) || "").toLowerCase();
  if (firstA !== firstB) {
    return firstA < firstB ? -1 : 1;
  }
  const lastA = ((a.name && a.name.last_name) || "").toLowerCase();
  const lastB = ((b.name && b.name.last_name) || "").toLowerCase();
  if (lastA !== lastB) {
    return lastA < lastB ? -1 : 1;
  }
  return 0;
}

// A contact matches the tag filter if it has all of the selected tags
// (AND across the facet), or if no tags are selected at all.
function contactMatchesTags(contact, tags) {
  if (tags.size === 0) {
    return true;
  }
  if (!contact.tags) {
    return false;
  }
  const contactTags = new Set(contact.tags);
  return Array.from(tags).every((tag) => contactTags.has(tag));
}

function applyFilters() {
  const tagFiltered = allContacts.filter((contact) => contactMatchesTags(contact, selectedTags));
  return filterContacts(tagFiltered, searchInput.value);
}

function updateTagFilterCount() {
  const count = selectedTags.size;
  tagFilterCountEl.hidden = count === 0;
  tagFilterCountEl.textContent = String(count);
}

function renderTagFilterMenu() {
  const query = tagFilterSearchInput.value.trim().toLowerCase();
  const visibleTags = query
    ? allTags.filter(({ tag }) => tag.toLowerCase().includes(query))
    : allTags;
  const emptyMessage = query ? "No matching tags" : "No tags";
  tagFilterOptionsEl.replaceChildren(renderTagFilterOptions(visibleTags, selectedTags, emptyMessage));
  updateTagFilterCount();
}

async function loadTags() {
  try {
    const data = await fetchTags();
    allTags = data.tags;
  } catch {
    allTags = [];
  }
  renderTagFilterMenu();
}

function networkErrorMessage(error) {
  if (error instanceof ApiError) {
    return error.message;
  }
  return `Could not reach the contacts API at ${API_BASE_URL} — is \`python -m contacts serve\` running?`;
}

function highlightSelectedListItem() {
  for (const item of listEl.querySelectorAll("[data-contact-id]")) {
    item.classList.toggle(
      "active",
      item.dataset.contactId === String(selectedContactId)
    );
  }
}

// Letter sections and the alphabet index only make sense when contacts are
// in alphabetical order; an active search re-ranks by relevance instead.
function isAlphabetical() {
  return !searchInput.value.trim();
}

function renderList(contacts) {
  currentContacts = contacts;
  listStatusEl.replaceChildren();
  const grouped = isAlphabetical();
  listEl.replaceChildren(renderContactList(contacts, grouped ? contactLetter : null));
  highlightSelectedListItem();
  renderAlphaIndex(grouped);
  renderListFooter(contacts.length);
}

function renderAlphaIndex(grouped) {
  alphaIndexEl.hidden = !grouped;
  if (!grouped) {
    return;
  }

  const lettersPresent = new Set(currentContacts.map(contactLetter));
  alphaIndexEl.replaceChildren();
  for (const letter of ALPHA_INDEX_LETTERS) {
    const el = document.createElement("div");
    el.className = "alpha-index-letter";
    el.textContent = letter;
    el.dataset.letter = letter;
    if (!lettersPresent.has(letter)) {
      el.classList.add("disabled");
    }
    alphaIndexEl.appendChild(el);
  }
}

function renderListFooter(count) {
  contactListFooterEl.textContent = `${count} contact${count === 1 ? "" : "s"}`;
}

// Scrolls `item` to the top of the list, then nudges past any sticky letter
// header immediately above it so the header doesn't end up pinned on top of
// (and hiding) the item itself.
function scrollListItemToTop(item) {
  item.scrollIntoView({ block: "start" });
  const prev = item.previousElementSibling;
  if (prev && prev.classList.contains("contact-letter-header")) {
    contactListScrollEl.scrollTop -= prev.offsetHeight;
  }
}

// Scrolls via the header's first contact item rather than the header itself.
// The header is `position: sticky`, so once it's been scrolled past, browsers
// report its position/rect as wherever it's currently pinned rather than its
// true document position — scrollIntoView on it is then a no-op, which is
// why jumping to an earlier letter (up) silently failed while jumping to a
// later one (down) worked. Contact items aren't sticky, so their position is
// always reported accurately.
function jumpToLetter(letter) {
  const header = document.getElementById(`contact-letter-${letter}`);
  if (!header) {
    return;
  }
  const firstItem = header.nextElementSibling;
  if (firstItem) {
    scrollListItemToTop(firstItem);
  } else {
    header.scrollIntoView({ block: "start" });
  }
}

async function loadContacts() {
  listStatusEl.replaceChildren(renderLoading());

  let data;
  try {
    data = await fetchContacts();
  } catch (error) {
    listStatusEl.replaceChildren(renderErrorBanner(networkErrorMessage(error)));
    return;
  }

  allContacts = data.contacts;
  renderList(applyFilters());
}

function selectContact(id) {
  selectedContactId = id;
  highlightSelectedListItem();

  const contact = allContacts.find((c) => c.id === id);
  if (!contact) {
    detailEl.replaceChildren(renderErrorBanner("Contact not found."));
    return;
  }

  detailEl.replaceChildren(renderContactDetail(contact));
}

// Moves the selection by `delta` positions within the currently displayed
// list, wrapping to the first/last contact if nothing is selected yet.
function moveSelection(delta) {
  if (!currentContacts.length) {
    return;
  }

  const currentIndex = currentContacts.findIndex((c) => c.id === selectedContactId);
  const nextIndex =
    currentIndex === -1 ? (delta > 0 ? 0 : currentContacts.length - 1) : currentIndex + delta;
  if (nextIndex < 0 || nextIndex >= currentContacts.length) {
    return;
  }

  const nextContact = currentContacts[nextIndex];
  selectContact(nextContact.id);

  const item = listEl.querySelector(`[data-contact-id="${nextContact.id}"]`);
  if (item) {
    item.scrollIntoView({ block: "nearest" });
  }
}

// Jumps the selection straight to the first or last contact in the
// currently displayed list.
function selectBoundaryContact(position) {
  if (!currentContacts.length) {
    return;
  }

  const contact = position === "first" ? currentContacts[0] : currentContacts[currentContacts.length - 1];
  selectContact(contact.id);

  const item = listEl.querySelector(`[data-contact-id="${contact.id}"]`);
  if (!item) {
    return;
  }
  if (position === "first") {
    scrollListItemToTop(item);
  } else {
    item.scrollIntoView({ block: "end" });
  }
}

function updateSearchClearVisibility() {
  searchClearBtn.hidden = !searchInput.value;
}

function init() {
  detailEl.replaceChildren(renderEmptyState());
  loadContacts();
  loadTags();
  updateSearchClearVisibility();

  searchInput.addEventListener("input", () => {
    updateSearchClearVisibility();
    renderList(applyFilters());
  });

  searchClearBtn.addEventListener("click", () => {
    searchInput.value = "";
    updateSearchClearVisibility();
    searchInput.focus();
    renderList(applyFilters());
  });

  tagFilterSearchInput.addEventListener("input", () => {
    renderTagFilterMenu();
  });

  tagFilterOptionsEl.addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-tag-checkbox]");
    if (!checkbox) {
      return;
    }
    if (checkbox.checked) {
      selectedTags.add(checkbox.value);
    } else {
      selectedTags.delete(checkbox.value);
    }
    updateTagFilterCount();
    renderList(applyFilters());
  });

  tagFilterClearBtn.addEventListener("click", () => {
    if (selectedTags.size === 0) {
      return;
    }
    selectedTags.clear();
    renderTagFilterMenu();
    renderList(applyFilters());
  });

  let isDraggingAlphaIndex = false;

  function letterFromPoint(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    return el && el.dataset && el.dataset.letter && !el.classList.contains("disabled")
      ? el.dataset.letter
      : null;
  }

  function handleAlphaIndexPointer(event) {
    const letter = letterFromPoint(event.clientX, event.clientY);
    if (letter) {
      jumpToLetter(letter);
    }
  }

  alphaIndexEl.addEventListener("pointerdown", (event) => {
    isDraggingAlphaIndex = true;
    alphaIndexEl.setPointerCapture(event.pointerId);
    handleAlphaIndexPointer(event);
  });

  alphaIndexEl.addEventListener("pointermove", (event) => {
    if (isDraggingAlphaIndex) {
      handleAlphaIndexPointer(event);
    }
  });

  alphaIndexEl.addEventListener("pointerup", () => {
    isDraggingAlphaIndex = false;
  });

  alphaIndexEl.addEventListener("pointercancel", () => {
    isDraggingAlphaIndex = false;
  });

  listEl.addEventListener("click", (event) => {
    const item = event.target.closest("[data-contact-id]");
    if (!item) {
      return;
    }
    event.preventDefault();
    selectContact(Number(item.dataset.contactId));
  });

  document.addEventListener("keydown", (event) => {
    const jumpToBoundary = event.metaKey || event.ctrlKey;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      jumpToBoundary ? selectBoundaryContact("last") : moveSelection(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      jumpToBoundary ? selectBoundaryContact("first") : moveSelection(-1);
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
