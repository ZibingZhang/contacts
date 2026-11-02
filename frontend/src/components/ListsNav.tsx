import type { ListObject } from "../types";
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

interface ListsNavProps {
  lists: ListObject[];
  memberIds: Record<number, number[]>;
  selectedListId: number | null;
  onSelectList: (listId: number | null) => void;
  totalContactCount: number;
  refreshing: boolean;
  onRefresh: () => void;
}

export function ListsNav({
  lists,
  memberIds,
  selectedListId,
  onSelectList,
  totalContactCount,
  refreshing,
  onRefresh,
}: ListsNavProps) {
  return (
    <Box
      component="nav"
      id="lists-nav"
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
          id="lists-nav-all-contacts"
          selected={selectedListId === null}
          onClick={() => onSelectList(null)}
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
            <Box sx={{ flexGrow: 1 }}>Lists</Box>
            <Tooltip title="Re-run each list's query to refresh its membership">
              <span>
                <IconButton
                  id="lists-nav-refresh-button"
                  size="small"
                  aria-label="Refresh lists"
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
        {lists.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1 }}>
            No lists yet.
          </Typography>
        )}
        {lists.map((list) => (
          <ListItemButton
            key={list.id}
            data-list-id={list.id}
            selected={selectedListId === list.id}
            onClick={() => onSelectList(list.id)}
          >
            <ListItemText primary={list.name} slotProps={{ primary: { noWrap: true, title: list.name } }} />
            <Typography variant="caption" color="text.secondary">
              {memberIds[list.id]?.length ?? 0}
            </Typography>
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
}
