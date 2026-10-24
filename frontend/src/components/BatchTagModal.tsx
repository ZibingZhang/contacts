import { useState } from "react";
import type { TagCount } from "../types";

interface BatchTagModalProps {
  contactCount: number;
  allTags: TagCount[];
  onCancel: () => void;
  onSubmit: (tags: string[]) => Promise<void>;
}

export function BatchTagModal({ contactCount, allTags, onCancel, onSubmit }: BatchTagModalProps) {
  const [pendingTags, setPendingTags] = useState<string[]>([]);
  const [tagQuery, setTagQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addTag(tag: string) {
    const trimmed = tag.trim();
    if (!trimmed) return;
    setPendingTags((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    setTagQuery("");
  }

  function removeTag(tag: string) {
    setPendingTags((prev) => prev.filter((t) => t !== tag));
  }

  function handleQueryKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(tagQuery);
    } else if (event.key === "Backspace" && !tagQuery && pendingTags.length > 0) {
      removeTag(pendingTags[pendingTags.length - 1]);
    }
  }

  const query = tagQuery.trim().toLowerCase();
  const suggestions = allTags.filter(
    ({ tag }) => !pendingTags.includes(tag) && (!query || tag.toLowerCase().includes(query))
  );

  async function handleSubmit() {
    if (pendingTags.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit(pendingTags);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add tags");
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <div className="modal-backdrop show" />
      <div
        id="batch-tag-modal"
        className="modal d-block"
        tabIndex={-1}
        role="dialog"
        onClick={onCancel}
      >
        <div
          className="modal-dialog modal-dialog-centered"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">
                Add tags to {contactCount} contact{contactCount === 1 ? "" : "s"}
              </h5>
              <button type="button" className="btn-close" aria-label="Close" onClick={onCancel} />
            </div>
            <div className="modal-body">
              {pendingTags.length > 0 && (
                <div id="batch-tag-pending" className="d-flex flex-wrap gap-1 mb-2">
                  {pendingTags.map((tag) => (
                    <span className="badge text-bg-primary d-inline-flex align-items-center gap-1" key={tag}>
                      {tag}
                      <button
                        type="button"
                        className="btn-close btn-close-white"
                        aria-label={`Remove ${tag}`}
                        style={{ fontSize: "0.55rem" }}
                        onClick={() => removeTag(tag)}
                      />
                    </span>
                  ))}
                </div>
              )}
              <input
                id="batch-tag-input"
                type="text"
                className="form-control"
                placeholder="Type a tag and press Enter…"
                aria-label="New tag"
                autoFocus
                value={tagQuery}
                onChange={(event) => setTagQuery(event.target.value)}
                onKeyDown={handleQueryKeyDown}
              />
              {suggestions.length > 0 && (
                <div id="batch-tag-suggestions" className="list-group mt-2" style={{ maxHeight: 200, overflowY: "auto" }}>
                  {suggestions.map(({ tag, count }) => (
                    <button
                      type="button"
                      key={tag}
                      className="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-1"
                      onClick={() => addTag(tag)}
                    >
                      <span>{tag}</span>
                      <span className="badge text-bg-light border text-secondary">{count}</span>
                    </button>
                  ))}
                </div>
              )}
              {error && (
                <div className="alert alert-danger mt-2 mb-0 py-1 px-2 small" role="alert">
                  {error}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={isSubmitting}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={pendingTags.length === 0 || isSubmitting}
              >
                {isSubmitting ? "Adding…" : `Add tag${pendingTags.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
