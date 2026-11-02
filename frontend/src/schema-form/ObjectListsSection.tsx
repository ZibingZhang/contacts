import { useCallback, useEffect, useState } from "react";
import type { Association, ListObject } from "../types";
import { fetchAssociations, fetchLists, addListMembers, removeListMembers, ApiError } from "../api";
import { useNavigateToObject } from "./navigation";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";

// List membership associations are always written with the list on side 1
// and the member on side 2 (`list_service._reconcile`). That positional
// convention -- not "whichever side is type list" -- is what distinguishes
// "this object is a member of that list" from "that list is a member of
// this object", which matters once a list's own member_type is "list" and
// both sides of the association are type "list".
function listIdsContaining(associations: Association[], objectType: string, objectId: number): number[] {
  return associations
    .filter(
      (association) =>
        association.object_type_1 === "list" &&
        association.object_type_2 === objectType &&
        association.object_id_2 === objectId
    )
    .map((association) => association.object_id_1);
}

interface ObjectListsSectionProps {
  objectType: string;
  objectId: number;
  // Notified after a successful add/remove, since membership changed here
  // can affect state this component doesn't own (e.g. a nav sidebar's
  // member-count badges).
  onChanged?: () => void;
}

/**
 * Mounted on every type's detail view: which lists this object belongs to,
 * with controls to add/remove it. A list gets this section too (a list can
 * belong to another list).
 */
export function ObjectListsSection({ objectType, objectId, onChanged }: ObjectListsSectionProps) {
  const [allLists, setAllLists] = useState<ListObject[]>([]);
  const [memberListIds, setMemberListIds] = useState<number[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigateToObject();

  const reload = useCallback(() => {
    return Promise.all([fetchAssociations(objectType, objectId), fetchLists()])
      .then(([associationsData, listsData]) => {
        setAllLists(listsData.objects);
        setMemberListIds(listIdsContaining(associationsData.objects, objectType, objectId));
        setLoaded(true);
      })
      .catch(() => {
        setAllLists([]);
        setMemberListIds([]);
        setLoaded(true);
      });
  }, [objectType, objectId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleAdd(listId: number) {
    setError(null);
    try {
      await addListMembers(listId, [objectId]);
      await reload();
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add to list");
    }
  }

  async function handleRemove(listId: number) {
    setError(null);
    try {
      await removeListMembers(listId, [objectId]);
      await reload();
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove from list");
    }
  }

  if (!loaded) {
    return null;
  }

  const memberLists = allLists.filter((list) => memberListIds.includes(list.id));
  const candidateLists = allLists.filter(
    (list) =>
      list.member_type === objectType &&
      !memberListIds.includes(list.id) &&
      !(objectType === "list" && list.id === objectId)
  );

  return (
    <Box component="section" sx={{ "& + &": { mt: 3 } }}>
      <Typography
        variant="subtitle2"
        color="text.secondary"
        sx={{ textTransform: "uppercase", fontWeight: 700, mb: 1 }}
      >
        Lists
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 1 }}>
        {memberLists.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            Not a member of any list.
          </Typography>
        )}
        {memberLists.map((list) => (
          <Chip key={list.id} label={list.name} onClick={() => navigate("list", list.id)} onDelete={() => handleRemove(list.id)} />
        ))}
      </Box>

      {candidateLists.length > 0 && (
        <Autocomplete
          options={candidateLists}
          getOptionLabel={(list) => list.name}
          value={null}
          onChange={(_event, newValue) => {
            if (newValue) handleAdd(newValue.id);
          }}
          renderInput={(params) => <TextField {...params} size="small" placeholder="Add to list…" />}
          sx={{ maxWidth: 280 }}
        />
      )}
    </Box>
  );
}
