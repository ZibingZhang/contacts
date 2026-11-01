import type { Group } from "../types";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListSubheader from "@mui/material/ListSubheader";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import CircularProgress from "@mui/material/CircularProgress";
import SyncIcon from "@mui/icons-material/Sync";

const WIDTH = 190;

interface GroupsNavProps {
  groups: Group[];
  selectedGroupId: number | null;
  onSelectGroup: (groupId: number | null) => void;
  totalContactCount: number;
  refreshing: boolean;
  onRefresh: () => void;
}

export function GroupsNav({
  groups,
  selectedGroupId,
  onSelectGroup,
  totalContactCount,
  refreshing,
  onRefresh,
}: GroupsNavProps) {
  return (
    <Box
      component="nav"
      id="groups-nav"
      sx={{
        width: WIDTH,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderRight: 1,
        borderColor: "divider",
        overflow: "auto",
      }}
    >
      <List dense sx={{ py: 0 }}>
        <ListItemButton
          id="groups-nav-all-contacts"
          selected={selectedGroupId === null}
          onClick={() => onSelectGroup(null)}
        >
          <ListItemText primary="All Contacts" />
          <Typography variant="caption" color="text.secondary">
            {totalContactCount}
          </Typography>
        </ListItemButton>
      </List>

      <List
        dense
        sx={{ py: 0, flexGrow: 1, overflow: "auto" }}
        subheader={
          <ListSubheader
            component="div"
            sx={{ display: "flex", alignItems: "center", lineHeight: "normal", py: 0.5 }}
          >
            <Box sx={{ flexGrow: 1 }}>Groups</Box>
            <Tooltip title="Re-run each group's query to refresh its membership">
              <span>
                <IconButton
                  id="groups-nav-refresh-button"
                  size="small"
                  aria-label="Refresh groups"
                  onClick={onRefresh}
                  disabled={refreshing}
                >
                  {refreshing ? <CircularProgress size={14} /> : <SyncIcon fontSize="inherit" />}
                </IconButton>
              </span>
            </Tooltip>
          </ListSubheader>
        }
      >
        {groups.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1 }}>
            No groups yet.
          </Typography>
        )}
        {groups.map((group) => (
          <ListItemButton
            key={group.id}
            data-group-id={group.id}
            selected={selectedGroupId === group.id}
            onClick={() => onSelectGroup(group.id)}
          >
            <ListItemText primary={group.name} slotProps={{ primary: { noWrap: true, title: group.name } }} />
            <Typography variant="caption" color="text.secondary">
              {group.ids?.length ?? 0}
            </Typography>
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
}
