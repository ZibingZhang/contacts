import type { Contact } from "./types";

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

// Scores arbitrary text against a query, or returns null if any query token
// fails to match at all (including as a subsequence).
function scoreText(text: string, query: string, tokens: string[]): number | null {
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

// Filters and ranks arbitrary items by the same tiered subsequence matching
// as `rankAndSort`, via a caller-supplied `textOf` -- used for the
// (non-controlled-search) object sidebars, where "name" is whatever the
// schema's display label resolves to rather than a fixed field.
export function filterByRelevance<T>(items: T[], query: string, textOf: (item: T) => string): T[] {
  const normalizedQuery = normalizeForSearch(query.trim());
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  if (!tokens.length) {
    return items;
  }

  const scored: { item: T; score: number; text: string }[] = [];
  for (const item of items) {
    const text = normalizeForSearch(textOf(item));
    const score = scoreText(text, normalizedQuery, tokens);
    if (score !== null) {
      scored.push({ item, score, text });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.text.localeCompare(b.text));
  return scored.map((entry) => entry.item);
}

// Filters and ranks `items` by relevance to `query`, same as
// `filterByRelevance`, but alphabetizes by `sortKeyOf` (defaulting to
// `textOf`) instead of leaving them in input order when there's no query to
// rank against -- for callers (the filter worker, its fallback hook) that
// need a stable, groupable order even with an empty search box. Taking a
// separate `sortKeyOf` lets a caller rank against one text (e.g. every
// searchable field) while alphabetizing by another (e.g. a display title)
// when the two shouldn't be the same.
export function rankAndSort<T>(
  items: T[],
  query: string,
  textOf: (item: T) => string,
  sortKeyOf: (item: T) => string = textOf
): T[] {
  if (!query.trim()) {
    return [...items].sort((a, b) => normalizeForSearch(sortKeyOf(a)).localeCompare(normalizeForSearch(sortKeyOf(b))));
  }
  return filterByRelevance(items, query, textOf);
}

// Filters and ranks a plain list of strings (e.g. autocomplete options) by
// the same tiered subsequence matching as `rankAndSort`, so a query's
// letters just need to appear in order somewhere in the option.
export function filterBySubsequence(options: string[], query: string): string[] {
  const normalizedQuery = normalizeForSearch(query.trim());
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  if (!tokens.length) {
    return options;
  }

  const scored: { option: string; score: number }[] = [];
  for (const option of options) {
    const score = scoreText(normalizeForSearch(option), normalizedQuery, tokens);
    if (score !== null) {
      scored.push({ option, score });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.option.localeCompare(b.option));
  return scored.map((entry) => entry.option);
}

// The letter a piece of display text is grouped/indexed under. Falls back
// to "#" for text that doesn't start with a letter.
export function letterOf(text: string): string {
  const ch = text.trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : "#";
}

// The letter a contact is grouped/indexed under, matching the field the
// contact search strategy leads with (first name, then last) so
// same-letter contacts stay contiguous.
export function contactLetter(contact: Contact): string {
  const first = contact.name?.first_name ?? "";
  const last = contact.name?.last_name ?? "";
  return letterOf(first || last);
}
