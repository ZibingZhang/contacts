import type { Group } from "../types";
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

interface GroupListProps {
  groups: Group[];
  selectedGroupId: number | null;
  onSelectGroup: (groupId: number) => void;
  refreshing: boolean;
  onRefresh: () => void;
}

export function GroupList({ groups, selectedGroupId, onSelectGroup, refreshing, onRefresh }: GroupListProps) {
  return (
    <Box
      component="nav"
      id="group-nav"
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
          Groups
        </Typography>
        <Tooltip title="Re-run each group's query to refresh its membership">
          <span>
            <IconButton
              id="group-list-refresh-button"
              size="small"
              aria-label="Refresh groups"
              onClick={onRefresh}
              disabled={refreshing}
            >
              {refreshing ? <CircularProgress size={18} /> : <SyncIcon fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      <Box sx={{ flexGrow: 1, overflow: "auto" }}>
        {groups.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            No groups yet.
          </Typography>
        ) : (
          <List dense>
            {groups.map((group) => (
              <ListItemButton
                key={group.id}
                data-group-id={group.id}
                selected={selectedGroupId === group.id}
                onClick={() => onSelectGroup(group.id)}
              >
                <ListItemText primary={group.name} />
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    {group.ids?.length ?? 0}
                  </Typography>
                  {group.sync ? (
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
          {groups.length} group{groups.length === 1 ? "" : "s"}
        </Typography>
      </Box>
    </Box>
  );
}
