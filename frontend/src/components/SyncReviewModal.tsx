import { useState } from "react";
import type { SyncReview } from "../types";
import { buildDisplayName } from "../format";
import { diffFields, diffPushFields, formatDiffValue, prettifyFieldPath } from "../diff";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Checkbox from "@mui/material/Checkbox";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";
import CloseIcon from "@mui/icons-material/Close";

export type SyncDirection = "pull" | "push";

interface SyncReviewModalProps {
  review: SyncReview;
  direction: SyncDirection;
  onCancel: () => void;
  onApply: (createIcloudIds: string[], updateIcloudIds: string[]) => Promise<void>;
}

function toggleId(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

const DIRECTION_COPY: Record<SyncDirection, { title: string; createdLabel: string; updatedLabel: string }> = {
  pull: {
    title: "Review changes from iCloud",
    createdLabel: "New contacts",
    updatedLabel: "Updated contacts",
  },
  push: {
    title: "Review changes to push to iCloud",
    createdLabel: "New contacts to create on iCloud",
    updatedLabel: "Contacts to update on iCloud",
  },
};

export function SyncReviewModal({ review, direction, onCancel, onApply }: SyncReviewModalProps) {
  const copy = DIRECTION_COPY[direction];
  const [acceptedCreates, setAcceptedCreates] = useState<Set<string>>(
    () => new Set(review.created.map((item) => item.icloud_id))
  );
  const [acceptedUpdates, setAcceptedUpdates] = useState<Set<string>>(
    () => new Set(review.updated.map((item) => item.icloud_id))
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalAccepted = acceptedCreates.size + acceptedUpdates.size;

  function setAll(accept: boolean) {
    setAcceptedCreates(accept ? new Set(review.created.map((item) => item.icloud_id)) : new Set());
    setAcceptedUpdates(accept ? new Set(review.updated.map((item) => item.icloud_id)) : new Set());
  }

  async function handleApply() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onApply([...acceptedCreates], [...acceptedUpdates]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply changes");
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog id="sync-review-modal" open onClose={onCancel} maxWidth="md" fullWidth>
      <DialogTitle>
        {copy.title}
        <IconButton
          aria-label="Close"
          onClick={onCancel}
          sx={{ position: "absolute", right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ maxHeight: "60vh" }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {review.created.length} new · {review.updated.length} updated
          </Typography>
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button size="small" onClick={() => setAll(true)}>
              Accept all
            </Button>
            <Button size="small" onClick={() => setAll(false)}>
              Decline all
            </Button>
          </Box>
        </Box>

        {review.created.length > 0 && (
          <>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {copy.createdLabel}
            </Typography>
            {review.created.map((item) => (
              <Box key={item.icloud_id} sx={{ display: "flex", alignItems: "flex-start", gap: 1, py: 0.5 }}>
                <Checkbox
                  checked={acceptedCreates.has(item.icloud_id)}
                  onChange={() => setAcceptedCreates((prev) => toggleId(prev, item.icloud_id))}
                  size="small"
                />
                <Typography sx={{ pt: 0.75 }}>{buildDisplayName(item.contact.name) || "(no name)"}</Typography>
              </Box>
            ))}
            {review.updated.length > 0 && <Divider sx={{ my: 2 }} />}
          </>
        )}

        {review.updated.length > 0 && (
          <>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {copy.updatedLabel}
            </Typography>
            {review.updated.map((item) => {
              const fieldDiffs =
                direction === "push"
                  ? diffPushFields(item.before, item.after)
                  : diffFields(item.before, item.after);
              return (
                <Box key={item.icloud_id} sx={{ display: "flex", alignItems: "flex-start", gap: 1, py: 0.5 }}>
                  <Checkbox
                    checked={acceptedUpdates.has(item.icloud_id)}
                    onChange={() => setAcceptedUpdates((prev) => toggleId(prev, item.icloud_id))}
                    size="small"
                  />
                  <Box sx={{ pt: 0.5 }}>
                    <Typography>{buildDisplayName(item.after.name) || "(no name)"}</Typography>
                    {fieldDiffs.map((d) => (
                      <Typography key={d.path} variant="body2" color="text.secondary">
                        {prettifyFieldPath(d.path)}: {formatDiffValue(d.before)} → {formatDiffValue(d.after)}
                      </Typography>
                    ))}
                  </Box>
                </Box>
              );
            })}
          </>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleApply} disabled={isSubmitting || totalAccepted === 0}>
          {isSubmitting ? "Applying…" : `Apply ${totalAccepted} change${totalAccepted === 1 ? "" : "s"}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
