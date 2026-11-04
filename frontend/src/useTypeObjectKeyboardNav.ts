import { useEffect, useRef, type RefObject } from "react";
import type { LetterGroupedListHandle } from "./components/useLetterGroupedVirtualList";
import { isTypingTarget } from "./hooks";

export interface TypeObjectKeyboardNavOptions<T extends { id: number }> {
  // The visible, ordered items (e.g. a type's currently displayed rows).
  items: T[];
  selectedId: number | null;
  editingId: number | "new" | null;
  // Kept separate from `items.find(...)` on purpose: the globally-selected
  // object may have been filtered out of `items` by the current
  // search/filter state, and "c" should still act on it.
  selectedItem: T | null;
  onSelect: (id: number) => void;
  // "c" to copy -- optional; a no-op if omitted.
  onCopy?: (item: T) => void;
  // Element to scroll on Cmd/Ctrl+Up/Down while editing, instead of jumping
  // the (hidden) list selection out from under the object being edited.
  detailContainerId: string;
}

// Arrow-key navigation through `items`, Cmd/Ctrl+Up/Down to jump to the
// first/last item (or, while editing, to scroll the detail/edit form
// instead), "/" to focus search, and "c" to invoke `onCopy` on the selected
// item. Returns a ref to pass to the list component (e.g. TypeObjectList)
// so this can drive its scrollToId/scrollToLetter.
export function useTypeObjectKeyboardNav<T extends { id: number }>({
  items,
  selectedId,
  editingId,
  selectedItem,
  onSelect,
  onCopy,
  detailContainerId,
}: TypeObjectKeyboardNavOptions<T>): RefObject<LetterGroupedListHandle | null> {
  const listRef = useRef<LetterGroupedListHandle>(null);

  // Moves the selection by `delta` positions within the currently displayed
  // list, wrapping to the first/last item if nothing is selected yet.
  function moveSelection(delta: number) {
    if (!items.length) {
      return;
    }
    const currentIndex = items.findIndex((item) => item.id === selectedId);
    const nextIndex = currentIndex === -1 ? (delta > 0 ? 0 : items.length - 1) : currentIndex + delta;
    if (nextIndex < 0 || nextIndex >= items.length) {
      return;
    }
    const nextItem = items[nextIndex];
    onSelect(nextItem.id);
    listRef.current?.scrollToId(nextItem.id, "auto");
  }

  // Jumps the selection straight to the first or last item in the currently
  // displayed list.
  function selectBoundaryItem(position: "first" | "last") {
    if (!items.length) {
      return;
    }
    const item = position === "first" ? items[0] : items[items.length - 1];
    onSelect(item.id);
    listRef.current?.scrollToId(item.id, position === "first" ? "start" : "end");
  }

  // Scrolls the edit/detail container all the way to its top or bottom.
  function scrollDetailToBoundary(position: "top" | "bottom") {
    const container = document.getElementById(detailContainerId);
    if (!container) {
      return;
    }
    container.scrollTo({ top: position === "top" ? 0 : container.scrollHeight });
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const jumpToBoundary = event.metaKey || event.ctrlKey;
      // While editing, Cmd/Ctrl+Up/Down scrolls the form instead of jumping
      // the (hidden) list selection out from under the object being edited.
      if (editingId !== null && jumpToBoundary && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        scrollDetailToBoundary(event.key === "ArrowDown" ? "bottom" : "top");
        return;
      }
      if (editingId !== null) {
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        jumpToBoundary ? selectBoundaryItem("last") : moveSelection(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        jumpToBoundary ? selectBoundaryItem("first") : moveSelection(-1);
      } else if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !isTypingTarget(event.target)) {
        event.preventDefault();
        document.getElementById("search-input")?.focus();
      } else if (
        (event.key === "c" || event.key === "C") &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isTypingTarget(event.target) &&
        selectedItem &&
        onCopy
      ) {
        event.preventDefault();
        onCopy(selectedItem);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [items, selectedId, editingId, selectedItem, onCopy]);

  return listRef;
}
