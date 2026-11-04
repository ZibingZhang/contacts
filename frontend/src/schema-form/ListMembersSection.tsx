import { useEffect, useState } from "react";
import type { ListObject, SchemaObject } from "../types";
import { fetchListMembers, fetchSchema } from "../api";
import { SCHEMA_META_SCHEMA } from "../schemaMeta";
import { displayLabel } from "./displayLabel";
import { useNavigateToObject } from "./navigation";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";

interface Member {
  id: number;
  label: string;
}

/**
 * A list's own members, resolved generically regardless of member_type --
 * including "list", so lists-of-lists are visible and navigable here, not
 * just counted.
 */
export function ListMembersSection({ list }: { list: ListObject }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const navigate = useNavigateToObject();

  useEffect(() => {
    let cancelled = false;
    // "schema" has no schema-object literally named "schema" to fetch (see
    // schemaMeta.ts) -- use the same client-side stand-in TypeObjectList uses.
    const schemaPromise: Promise<SchemaObject> =
      list.member_type === SCHEMA_META_SCHEMA.name ? Promise.resolve(SCHEMA_META_SCHEMA) : fetchSchema(list.member_type);
    Promise.all([fetchListMembers<Record<string, unknown>>(list.id), schemaPromise])
      .then(([membersData, schema]) => {
        if (cancelled) return;
        setMembers(
          membersData.objects.map((obj) => ({
            id: obj.id as number,
            label: displayLabel(schema, obj, obj.id as number),
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [list.id, list.member_type]);

  return (
    <Box component="section" sx={{ "& + &": { mt: 3 } }}>
      <Typography
        variant="subtitle2"
        color="text.secondary"
        sx={{ textTransform: "uppercase", fontWeight: 700, mb: 1 }}
      >
        Members{members ? ` (${members.length})` : ""}
      </Typography>
      {list.member_type === "contact" ? (
        <Typography variant="body2" color="text.secondary">
          View this list's contacts from the Contacts view.
        </Typography>
      ) : (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          {members !== null && members.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No members yet.
            </Typography>
          )}
          {(members ?? []).map((member) => (
            <Chip key={member.id} label={member.label} onClick={() => navigate(list.member_type, member.id)} />
          ))}
        </Box>
      )}
    </Box>
  );
}
