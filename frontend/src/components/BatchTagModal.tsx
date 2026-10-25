import { useState } from "react";
import type { TagCount } from "../types";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import CloseIcon from "@mui/icons-material/Close";

interface BatchTagModalProps {
  contactCount: number;
  allTags: TagCount[];
  onCancel: () => void;
  onSubmit: (tags: string[]) => Promise<void>;
}

export function BatchTagModal({ contactCount, allTags, onCancel, onSubmit }: BatchTagModalProps) {
  const [pendingTags, setPendingTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const countByTag = new Map(allTags.map(({ tag, count }) => [tag, count]));

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
    <Dialog id="batch-tag-modal" open onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>
        Add tags to {contactCount} contact{contactCount === 1 ? "" : "s"}
        <IconButton
          aria-label="Close"
          onClick={onCancel}
          sx={{ position: "absolute", right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Autocomplete
          multiple
          freeSolo
          id="batch-tag-input"
          options={allTags.map(({ tag }) => tag)}
          value={pendingTags}
          onChange={(_event, newValue) => {
            const unique = Array.from(new Set(newValue.map((v) => v.trim()).filter(Boolean)));
            setPendingTags(unique);
          }}
          filterOptions={(options, state) => {
            const query = state.inputValue.trim().toLowerCase();
            return options.filter(
              (option) => !pendingTags.includes(option) && (!query || option.toLowerCase().includes(query))
            );
          }}
          renderOption={(props, option) => (
            <Box
              component="li"
              {...props}
              key={option}
              sx={{ display: "flex", justifyContent: "space-between", width: "100%" }}
            >
              <span>{option}</span>
              <Chip label={countByTag.get(option) ?? 0} size="small" variant="outlined" />
            </Box>
          )}
          renderInput={(params) => (
            <TextField {...params} placeholder="Type a tag and press Enter…" aria-label="New tag" autoFocus />
          )}
        />
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
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={pendingTags.length === 0 || isSubmitting}
        >
          {isSubmitting ? "Adding…" : `Add tag${pendingTags.length === 1 ? "" : "s"}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
