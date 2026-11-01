import { useEffect } from "react";
import type { Group } from "../types";
import { isTypingTarget } from "../hooks";
import { DetailSection, fieldRow } from "./DetailSection";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";

function formatTimestamp(seconds: number | undefined): string {
  if (!seconds) return "—";
  return new Date(seconds * 1000).toLocaleString();
}

export function GroupDetail({ group, onEdit }: { group: Group; onEdit: () => void }) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      if (event.key === "e" || event.key === "E") {
        event.preventDefault();
        onEdit();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onEdit]);

  return (
    <>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 4 }}>
        <Box>
          <Typography variant="h5" sx={{ mb: 1 }}>
            {group.name}
          </Typography>
          {group.sync ? (
            <Chip size="small" color="success" label="Syncing to iCloud" />
          ) : (
            <Chip size="small" variant="outlined" label="Local only" />
          )}
        </Box>
        <Button id="edit-group-button" variant="outlined" size="small" onClick={onEdit}>
          Edit
        </Button>
      </Box>

      <DetailSection
        title="Query"
        rows={[
          fieldRow(
            "SQL",
            <Box
              component="pre"
              sx={{
                m: 0,
                fontFamily: "monospace",
                fontSize: "0.85rem",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {group.query}
            </Box>
          ),
        ]}
      />

      <DetailSection title="Membership" rows={[fieldRow("Contacts", String(group.ids?.length ?? 0))]} />

      <DetailSection
        title="iCloud"
        rows={
          group.icloud
            ? [fieldRow("UUID", group.icloud.uuid), fieldRow("Etag", group.icloud.etag ?? "—")]
            : [fieldRow("Status", "Not yet synced")]
        }
      />

      <DetailSection
        title="Timestamps"
        rows={[fieldRow("Created", formatTimestamp(group.ctime)), fieldRow("Updated", formatTimestamp(group.mtime))]}
      />
    </>
  );
}
