import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { Contact } from "./types";
import type { ContactListHandle } from "./components/ContactList";
import { isTypingTarget } from "./hooks";

export interface ContactKeyboardNav {
  listRef: RefObject<ContactListHandle | null>;
  jumpToLetter: (letter: string) => void;
}

// Arrow-key contact navigation, Cmd/Ctrl+Up/Down to jump to the first/last
// contact (or, while editing, to scroll the form instead), "/" to focus
// search, and "c" to copy the selected contact. Owns the list ref since
// it's the one driving scrollToLetter/scrollToId.
export function useContactKeyboardNav(
  visibleContacts: Contact[],
  selectedContactId: number | null,
  editingContactId: number | "new" | null,
  selectedContact: Contact | null,
  handleSelectContact: (id: number) => void,
  handleCopyContact: (contact: Contact) => void
): ContactKeyboardNav {
  const listRef = useRef<ContactListHandle>(null);

  // Stable identity (it only ever touches the ref) so it doesn't defeat
  // AlphaIndex's memoization on every keystroke.
  const jumpToLetter = useCallback((letter: string) => {
    listRef.current?.scrollToLetter(letter);
  }, []);

  // Moves the selection by `delta` positions within the currently displayed
  // list, wrapping to the first/last contact if nothing is selected yet.
  function moveSelection(delta: number) {
    if (!visibleContacts.length) {
      return;
    }
    const currentIndex = visibleContacts.findIndex((c) => c.id === selectedContactId);
    const nextIndex = currentIndex === -1 ? (delta > 0 ? 0 : visibleContacts.length - 1) : currentIndex + delta;
    if (nextIndex < 0 || nextIndex >= visibleContacts.length) {
      return;
    }
    const nextContact = visibleContacts[nextIndex];
    handleSelectContact(nextContact.id);
    listRef.current?.scrollToId(nextContact.id, "auto");
  }

  // Jumps the selection straight to the first or last contact in the
  // currently displayed list.
  function selectBoundaryContact(position: "first" | "last") {
    if (!visibleContacts.length) {
      return;
    }
    const contact = position === "first" ? visibleContacts[0] : visibleContacts[visibleContacts.length - 1];
    handleSelectContact(contact.id);
    listRef.current?.scrollToId(contact.id, position === "first" ? "start" : "end");
  }

  // Scrolls the edit form's container all the way to its top or bottom.
  function scrollEditFormToBoundary(position: "top" | "bottom") {
    const container = document.getElementById("contact-detail");
    if (!container) {
      return;
    }
    container.scrollTo({ top: position === "top" ? 0 : container.scrollHeight });
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const jumpToBoundary = event.metaKey || event.ctrlKey;
      // While editing, Cmd/Ctrl+Up/Down scrolls the form instead of jumping
      // the (hidden) list selection out from under the contact being edited.
      if (editingContactId !== null && jumpToBoundary && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        scrollEditFormToBoundary(event.key === "ArrowDown" ? "bottom" : "top");
        return;
      }
      if (editingContactId !== null) {
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        jumpToBoundary ? selectBoundaryContact("last") : moveSelection(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        jumpToBoundary ? selectBoundaryContact("first") : moveSelection(-1);
      } else if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !isTypingTarget(event.target)) {
        event.preventDefault();
        document.getElementById("search-input")?.focus();
      } else if (
        (event.key === "c" || event.key === "C") &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isTypingTarget(event.target) &&
        selectedContact
      ) {
        event.preventDefault();
        handleCopyContact(selectedContact);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [visibleContacts, selectedContactId, editingContactId, selectedContact]);

  return { listRef, jumpToLetter };
}
