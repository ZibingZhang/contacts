import { useEffect, useRef, useState } from "react";
import type { TagCount } from "../types";

interface TagFilterDropdownProps {
  tags: TagCount[];
  selectedTags: Set<string>;
  onToggleTag: (tag: string) => void;
  onClear: () => void;
}

export function TagFilterDropdown({ tags, selectedTags, onToggleTag, onClear }: TagFilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const query = tagQuery.trim().toLowerCase();
  const visibleTags = query ? tags.filter(({ tag }) => tag.toLowerCase().includes(query)) : tags;
  const emptyMessage = query ? "No matching tags" : "No tags";

  const countByTag = new Map(tags.map(({ tag, count }) => [tag, count]));
  const selectedTagItems = [...selectedTags].map((tag) => ({ tag, count: countByTag.get(tag) ?? 0 }));

  return (
    <div className="dropdown" ref={containerRef}>
      <button
        id="tag-filter-toggle"
        className="btn btn-outline-secondary btn-sm dropdown-toggle d-inline-flex align-items-center"
        type="button"
        aria-expanded={isOpen}
        aria-label="Filter by tag"
        title="Filter by tag"
        onClick={() => setIsOpen((open) => !open)}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M1.5 1.5A.5.5 0 0 1 2 1h12a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.128.334L10 8.692V13.5a.5.5 0 0 1-.342.474l-3 1A.5.5 0 0 1 6 14.5V8.692L1.628 3.834A.5.5 0 0 1 1.5 3.5zm1 .5v1.308l4.372 4.858A.5.5 0 0 1 7 8.5v5.306l2-.666V8.5a.5.5 0 0 1 .128-.334L13.5 3.308V2z" />
        </svg>
        {selectedTags.size > 0 && <span id="tag-filter-count" className="badge text-bg-primary ms-1">{selectedTags.size}</span>}
      </button>
      <div id="tag-filter-menu" className={`dropdown-menu p-0${isOpen ? " show" : ""}`} aria-labelledby="tag-filter-toggle">
        <div className="p-2 border-bottom">
          <input
            id="tag-filter-search"
            type="text"
            className="form-control form-control-sm"
            placeholder="Search tags…"
            aria-label="Search tags"
            value={tagQuery}
            onChange={(event) => setTagQuery(event.target.value)}
          />
        </div>
        {selectedTagItems.length > 0 && (
          <>
            <div id="tag-filter-selected" className="px-1 py-1">
              {selectedTagItems.map(({ tag, count }) => (
                <label className="tag-filter-item dropdown-item" key={`selected-${tag}`}>
                  <input
                    type="checkbox"
                    className="form-check-input mt-0"
                    checked
                    onChange={() => onToggleTag(tag)}
                  />
                  <span className="tag-filter-label">{tag}</span>
                  <span className="badge text-bg-light border text-secondary">{count}</span>
                </label>
              ))}
            </div>
            <div className="dropdown-divider" />
          </>
        )}
        <div id="tag-filter-options" className="px-1 py-1">
          {visibleTags.length === 0 ? (
            <div className="text-secondary small px-2 py-1">{emptyMessage}</div>
          ) : (
            visibleTags.map(({ tag, count }) => (
              <label className="tag-filter-item dropdown-item" key={tag}>
                <input
                  type="checkbox"
                  className="form-check-input mt-0"
                  checked={selectedTags.has(tag)}
                  onChange={() => onToggleTag(tag)}
                />
                <span className="tag-filter-label">{tag}</span>
                <span className="badge text-bg-light border text-secondary">{count}</span>
              </label>
            ))
          )}
        </div>
        <div className="dropdown-divider" />
        <button id="tag-filter-clear" type="button" className="dropdown-item text-secondary small" onClick={onClear}>
          Clear tag filters
        </button>
      </div>
    </div>
  );
}
