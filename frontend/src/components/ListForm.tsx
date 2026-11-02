import { useEffect, useState } from "react";
import type { ListObject } from "../types";
import { createList, updateList, ApiError } from "../api";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Alert from "@mui/material/Alert";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";

interface ListFormProps {
  list: ListObject | null;
  memberTypes: string[];
  onCancel: () => void;
  onSaved: (list: ListObject) => void;
}

export function ListForm({ list, memberTypes, onCancel, onSaved }: ListFormProps) {
  const [name, setName] = useState(list?.name ?? "");
  const [query, setQuery] = useState(list?.query ?? "");
  const [memberType, setMemberType] = useState(list?.member_type ?? "contact");
  const [sync, setSync] = useState(list?.sync ?? false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty =
    list === null ||
    name !== list.name ||
    query !== (list.query ?? "") ||
    memberType !== list.member_type ||
    sync !== list.sync;
  const isValid = name.trim() !== "";

  async function handleSubmit() {
    if (isSubmitting || !isValid) return;
    setIsSubmitting(true);
    setError(null);
    try {
      // An empty query means "maintained by hand", so omit it rather than
      // storing a blank string.
      const payload: Record<string, unknown> = {
        name: name.trim(),
        member_type: memberType,
        sync,
      };
      if (query.trim() !== "") payload.query = query.trim();

      const saved = list ? await updateList(list.id, payload) : await createList(payload);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${list ? "save" : "create"} list`);
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
    <Box id="list-form">
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
        <Typography variant="h5">{list ? "Edit List" : "New List"}</Typography>
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
        id="list-form-name"
        label="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        size="small"
        fullWidth
        autoFocus
        sx={{ mb: 2 }}
      />

      <TextField
        id="list-form-member-type"
        label="Member type"
        value={memberType}
        onChange={(event) => setMemberType(event.target.value)}
        size="small"
        fullWidth
        select
        slotProps={{ select: { native: true } }}
        disabled={list !== null}
        helperText={
          list !== null
            ? "A list's member type can't change once it has been created."
            : "The type of object this list holds."
        }
        sx={{ mb: 2 }}
      >
        {memberTypes.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </TextField>

      <TextField
        id="list-form-query"
        label="Query"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        size="small"
        fullWidth
        multiline
        minRows={5}
        placeholder={`SELECT id FROM ${memberType} WHERE ...`}
        helperText={
          "A SQL statement whose first result column is an object id. Leave " +
          "empty to maintain membership by hand."
        }
        sx={{ mb: 2, "& textarea": { fontFamily: "monospace", fontSize: "0.85rem" } }}
      />

      <FormControlLabel
        control={<Checkbox checked={sync} onChange={(event) => setSync(event.target.checked)} />}
        label="Sync to iCloud"
      />
    </Box>
  );
}
