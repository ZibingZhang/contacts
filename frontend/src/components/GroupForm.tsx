import { useEffect, useState } from "react";
import type { Group } from "../types";
import { createGroup, updateGroup, ApiError } from "../api";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Alert from "@mui/material/Alert";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";

interface GroupFormProps {
  group: Group | null;
  onCancel: () => void;
  onSaved: (group: Group) => void;
}

export function GroupForm({ group, onCancel, onSaved }: GroupFormProps) {
  const [name, setName] = useState(group?.name ?? "");
  const [query, setQuery] = useState(group?.query ?? "");
  const [sync, setSync] = useState(group?.sync ?? false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty = group === null || name !== group.name || query !== group.query || sync !== group.sync;
  const isValid = name.trim() !== "" && query.trim() !== "";

  async function handleSubmit() {
    if (isSubmitting || !isValid) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const payload = { name: name.trim(), query: query.trim(), sync };
      const saved = group ? await updateGroup(group.id, payload) : await createGroup(payload);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${group ? "save" : "create"} group`);
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (isDirty && isValid && !isSubmitting) handleSubmit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        if (!isSubmitting) onCancel();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  return (
    <Box id="group-form">
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 2,
          pt: 4,
          mb: 4,
          backgroundColor: "background.paper",
        }}
      >
        <Typography variant="h5">{group ? "Edit Group" : "New Group"}</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSubmit} disabled={isSubmitting || !isDirty || !isValid}>
            {isSubmitting ? "Saving…" : "Save"}
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <TextField
        id="group-form-name"
        label="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        size="small"
        fullWidth
        autoFocus
        sx={{ mb: 2 }}
      />

      <TextField
        id="group-form-query"
        label="Query"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        size="small"
        fullWidth
        multiline
        minRows={5}
        placeholder="SELECT id FROM contact WHERE ..."
        helperText="A SQL statement whose first result column is a contact id -- re-run to refresh membership."
        sx={{ mb: 2, "& textarea": { fontFamily: "monospace", fontSize: "0.85rem" } }}
      />

      <FormControlLabel
        control={<Checkbox checked={sync} onChange={(event) => setSync(event.target.checked)} />}
        label="Sync to iCloud"
      />
    </Box>
  );
}
