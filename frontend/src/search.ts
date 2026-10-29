import type { Contact } from "./types";
import { buildDisplayName } from "./format";

// Folds a string for accent-insensitive matching: NFKD unifies compatibility
// variants (fullwidth forms, ligatures, etc.) and splits accented letters
// into base + combining marks, which are then stripped, e.g. "Jöran" ->
// "joran" so it matches a plain "Joran" query.
export function normalizeForSearch(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function contactSearchText(contact: Contact): string {
  const parts = [buildDisplayName(contact.name)];
  if (contact.name?.chinese_name) {
    parts.push(contact.name.chinese_name);
  }
  if (contact.name?.maiden_name) {
    parts.push(contact.name.maiden_name);
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

function isWordBoundaryChar(char: string | undefined): boolean {
  return char === undefined || !/[a-z0-9]/i.test(char);
}

function wordsOf(text: string): string[] {
  return text
    .split(/\s+/)
    .map((word) => word.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, ""))
    .filter(Boolean);
}

// Best-alignment score for `token` as a (possibly non-contiguous) subsequence
// of `text`, rewarding runs of consecutive characters and matches that start
// at a word boundary. Returns -Infinity if `token` isn't a subsequence at all.
function subsequenceScore(text: string, token: string): number {
  const n = text.length;
  const m = token.length;
  if (m === 0) return 0;
  if (m > n) return -Infinity;

  const NEG = -Infinity;
  let prevRow = new Array<number>(m + 1).fill(NEG);
  const prefixBest = new Array<number>(m + 1).fill(NEG);
  prefixBest[0] = 0;

  for (let i = 1; i <= n; i++) {
    const currRow = new Array<number>(m + 1).fill(NEG);
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
function scoreToken(text: string, words: string[], token: string): number | null {
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
function scoreContact(contact: Contact, query: string, tokens: string[]): number | null {
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

// Alphabetical fallback ordering: first name, then last name, case-insensitive.
export function compareByName(a: Contact, b: Contact): number {
  const firstA = (a.name?.first_name ?? "").toLowerCase();
  const firstB = (b.name?.first_name ?? "").toLowerCase();
  if (firstA !== firstB) {
    return firstA < firstB ? -1 : 1;
  }
  const lastA = (a.name?.last_name ?? "").toLowerCase();
  const lastB = (b.name?.last_name ?? "").toLowerCase();
  if (lastA !== lastB) {
    return lastA < lastB ? -1 : 1;
  }
  return 0;
}

// Ranks contacts by how well they match the query, using subsequence
// matching so every token just needs its letters in order somewhere in the
// contact's name text; order-independent across tokens so "wong audrey" and
// "audrey wong" both match. Exact and word-boundary matches are scored above
// loose subsequence matches, and non-matching contacts are filtered out.
export function filterContacts(contacts: Contact[], query: string): Contact[] {
  const normalizedQuery = normalizeForSearch(query.trim());
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  if (!tokens.length) {
    return [...contacts].sort(compareByName);
  }

  const scored: { contact: Contact; score: number }[] = [];
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
export function contactLetter(contact: Contact): string {
  const first = contact.name?.first_name ?? "";
  const last = contact.name?.last_name ?? "";
  const ch = (first || last).trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : "#";
}
