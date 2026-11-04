import { useImperativeHandle, useMemo, type Ref, type RefObject } from "react";
import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual";

// Shared virtualization core behind ContactList and TypeObjectList: both
// render a list of thousands of rows grouped under per-letter headers, with
// a quick-jump A-Z index, and both need the same answer to "mounting every
// row as a real DOM node blocks the main thread for hundreds of ms on every
// load/type switch" -- render only what's on screen, via `@tanstack/react-
// virtual`. The two components still differ in their surrounding chrome
// (a search bar and "All X" row for TypeObjectList, a subtitle slot, a
// scroll container that TypeObjectList owns but ContactList's caller does
// not, ...) so this stays headless: it returns row/position data for the
// caller to render, rather than owning any JSX itself.
//
// Virtualizing breaks plain `position: sticky` per-letter headers (each
// header is translated into place inside an absolutely-positioned virtual
// row, which defeats native sticky positioning) -- `activeLetter` is the
// replacement: whichever letter's group is currently topmost, for the
// caller to render as one persistent header above the virtualized rows.

export type LetterGroupedRow<T> = { kind: "header"; letter: string } | { kind: "item"; item: T };

export interface LetterGroupedListHandle {
  // Returns whether `id` was found (and thus actually scrolled to) -- false
  // when the item doesn't exist yet, e.g. a debounced filter pass hasn't
  // resolved. Callers that need to land on a specific item once it exists
  // check this instead of re-querying the DOM for it.
  scrollToId: (id: number | string, align?: "start" | "center" | "end" | "auto") => boolean;
  scrollToLetter: (letter: string) => void;
}

interface UseLetterGroupedVirtualListOptions<T> {
  items: T[];
  // Alphabetical sticky-letter grouping. While false (e.g. mid-search, where
  // results are ranked by relevance instead), rows are flat items with no
  // headers and no floating letter bar.
  grouped: boolean;
  getId: (item: T) => number | string;
  getLetter: (item: T) => string;
  itemHeight: number;
  headerHeight?: number;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  // Height of any static content the caller renders above the virtualized
  // rows, in normal document flow (e.g. TypeObjectList's "All X" row) -- so
  // the virtualizer's offset math still lines up. 0 if there's none.
  leadingHeight?: number;
  overscan?: number;
  handleRef?: Ref<LetterGroupedListHandle>;
}

interface UseLetterGroupedVirtualListResult<T> {
  rows: LetterGroupedRow<T>[];
  virtualRows: VirtualItem[];
  totalSize: number;
  scrollMargin: number;
  // The letter whose group is at the top of the current viewport ("" when
  // not `grouped`, or before any row has scrolled into view) -- render as
  // the floating header's content.
  activeLetter: string;
}

export function useLetterGroupedVirtualList<T>({
  items,
  grouped,
  getId,
  getLetter,
  itemHeight,
  headerHeight = 26,
  scrollContainerRef,
  leadingHeight = 0,
  overscan = 12,
  handleRef,
}: UseLetterGroupedVirtualListOptions<T>): UseLetterGroupedVirtualListResult<T> {
  const rows = useMemo(() => {
    const result: LetterGroupedRow<T>[] = [];
    let currentLetter: string | null = null;
    for (const item of items) {
      if (grouped) {
        const letter = getLetter(item);
        if (letter !== currentLetter) {
          currentLetter = letter;
          result.push({ kind: "header", letter });
        }
      }
      result.push({ kind: "item", item });
    }
    return result;
  }, [items, grouped, getLetter]);

  // Which letter group each row belongs to, so the floating header can look
  // up "what letter is the topmost visible row under" in O(1).
  const letterForRowIndex = useMemo(() => {
    const result: string[] = [];
    let current = "";
    for (const row of rows) {
      if (row.kind === "header") current = row.letter;
      result.push(current);
    }
    return result;
  }, [rows]);

  // Note: this does *not* add headerHeight for the floating sticky header --
  // that header's own layout space is collapsed via a negative margin (see
  // stickyLetterHeaderSx) so it overlays the first real header rather than
  // pushing the virtualized rows down, so no extra scroll margin is needed
  // for it.
  const scrollMargin = leadingHeight;

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) => (rows[index].kind === "header" ? headerHeight : itemHeight),
    getItemKey: (index) => {
      const row = rows[index];
      return row.kind === "header" ? `header-${row.letter}` : `item-${getId(row.item)}`;
    },
    scrollMargin,
    overscan,
  });

  useImperativeHandle(
    handleRef,
    () => ({
      scrollToId(id, align = "auto") {
        const index = rows.findIndex((row) => row.kind === "item" && getId(row.item) === id);
        if (index === -1) return false;
        rowVirtualizer.scrollToIndex(index, { align });
        return true;
      },
      scrollToLetter(letter) {
        const index = rows.findIndex((row) => row.kind === "header" && row.letter === letter);
        if (index !== -1) rowVirtualizer.scrollToIndex(index, { align: "start" });
      },
    }),
    [rows, rowVirtualizer, getId]
  );

  const virtualRows = rowVirtualizer.getVirtualItems();
  // `virtualRows[0]` is the topmost *rendered* row, which includes the
  // overscan buffer above the viewport -- using it here would attribute the
  // header to whatever letter group that overscanned row happens to fall
  // under (typically the previous letter), not the one actually at the top
  // of the visible viewport. `range` is the unpadded, actually-visible index
  // range.
  const topVisibleIndex = rowVirtualizer.range?.startIndex;
  const activeLetter = grouped && topVisibleIndex !== undefined ? letterForRowIndex[topVisibleIndex] : "";

  return {
    rows,
    virtualRows,
    totalSize: rowVirtualizer.getTotalSize(),
    scrollMargin,
    activeLetter,
  };
}

// Shared visual style for both the floating header and each inline
// per-letter divider row.
const LETTER_HEADER_LINE_HEIGHT = "1.6rem";

export const letterHeaderSx = {
  lineHeight: LETTER_HEADER_LINE_HEIGHT,
  fontSize: "0.75rem",
  fontWeight: 700,
  color: "text.secondary",
  bgcolor: "background.default",
} as const;

// The persistent floating header rendered above the virtualized rows.
// `position: sticky` requires staying in normal document flow, so a plain
// sticky header would reserve its own height and push the first real
// (inline) header down below it -- producing two stacked headers for the
// same letter whenever scrolled to the very top of a group. The negative
// margin collapses that reserved space so this header overlays the first
// inline header instead of sitting above it; its higher zIndex then just
// paints over the (letter-identical) row beneath it.
export const stickyLetterHeaderSx = {
  ...letterHeaderSx,
  position: "sticky",
  top: 0,
  zIndex: 2,
  marginBottom: `-${LETTER_HEADER_LINE_HEIGHT}`,
} as const;
