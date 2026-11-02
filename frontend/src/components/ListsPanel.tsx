import type { ListObject } from "../types";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import CircularProgress from "@mui/material/CircularProgress";
import SyncIcon from "@mui/icons-material/Sync";

const WIDTH = 320;

interface ListsPanelProps {
  lists: ListObject[];
  memberIds: Record<number, number[]>;
  selectedListId: number | null;
  onSelectList: (listId: number) => void;
  refreshing: boolean;
  onRefresh: () => void;
}

export function ListsPanel({
  lists,
  memberIds,
  selectedListId,
  onSelectList,
  refreshing,
  onRefresh,
}: ListsPanelProps) {
  return (
    <Box
      component="nav"
      id="list-nav"
      sx={{
        width: WIDTH,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderRight: 1,
        borderColor: "divider",
      }}
    >
      <Box
        sx={{
          p: 1,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          gap: 0.5,
        }}
      >
        <Typography variant="subtitle1" sx={{ flexGrow: 1, px: 1 }}>
          Lists
        </Typography>
        <Tooltip title="Re-run each list's query to refresh its membership">
          <span>
            <IconButton
              id="lists-panel-refresh-button"
              size="small"
              aria-label="Refresh lists"
              onClick={onRefresh}
              disabled={refreshing}
            >
              {refreshing ? <CircularProgress size={18} /> : <SyncIcon fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      <Box sx={{ flexGrow: 1, overflow: "auto" }}>
        {lists.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            No lists yet.
          </Typography>
        ) : (
          <List dense>
            {lists.map((list) => (
              <ListItemButton
                key={list.id}
                data-list-id={list.id}
                selected={selectedListId === list.id}
                onClick={() => onSelectList(list.id)}
              >
                <ListItemText primary={list.name} />
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    {memberIds[list.id]?.length ?? 0}
                  </Typography>
                  {list.sync ? (
                    <Chip size="small" color="success" label="Syncing" />
                  ) : (
                    <Chip size="small" variant="outlined" label="Local" />
                  )}
                </Box>
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>

      <Box
        sx={{
          flexShrink: 0,
          borderTop: 1,
          borderColor: "divider",
          px: 1,
          py: 0.5,
          textAlign: "center",
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {lists.length} list{lists.length === 1 ? "" : "s"}
        </Typography>
      </Box>
    </Box>
  );
}
