import { useEffect, useState } from "react";
import type { ListObject } from "../types";
import { isTypingTarget } from "../hooks";
import { refreshList, ApiError } from "../api";
import { DetailSection, fieldRow } from "./DetailSection";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";

function formatTimestamp(seconds: number | undefined): string {
  if (!seconds) return "—";
  return new Date(seconds * 1000).toLocaleString();
}

interface ListDetailProps {
  list: ListObject;
  memberCount: number;
  onEdit: () => void;
  onRefreshed: (list: ListObject) => void;
}

export function ListDetail({ list, memberCount, onEdit, onRefreshed }: ListDetailProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function handleRefresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setError(null);
    try {
      onRefreshed(await refreshList(list.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to refresh list");
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 4 }}>
        <Box>
          <Typography variant="h5" sx={{ mb: 1 }}>
            {list.name}
          </Typography>
          {list.sync ? (
            <Chip size="small" color="success" label="Syncing to iCloud" />
          ) : (
            <Chip size="small" variant="outlined" label="Local only" />
          )}
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          {list.query ? (
            <Button
              id="refresh-list-button"
              variant="outlined"
              size="small"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? "Refreshing…" : "Refresh"}
            </Button>
          ) : null}
          <Button id="edit-list-button" variant="outlined" size="small" onClick={onEdit}>
            Edit
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <DetailSection
        title="Query"
        rows={[
          fieldRow(
            "SQL",
            list.query ? (
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
                {list.query}
              </Box>
            ) : (
              "No query — membership is maintained by hand."
            )
          ),
        ]}
      />

      <DetailSection
        title="Membership"
        rows={[
          fieldRow("Member type", list.member_type),
          fieldRow("Members", String(memberCount)),
        ]}
      />

      <DetailSection
        title="iCloud"
        rows={
          list.icloud
            ? [fieldRow("UUID", list.icloud.uuid), fieldRow("Etag", list.icloud.etag ?? "—")]
            : [fieldRow("Status", "Not yet synced")]
        }
      />

      <DetailSection
        title="Timestamps"
        rows={[fieldRow("Created", formatTimestamp(list.ctime)), fieldRow("Updated", formatTimestamp(list.mtime))]}
      />
    </>
  );
}
