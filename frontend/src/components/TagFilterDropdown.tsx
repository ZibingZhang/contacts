import { useState } from "react";
import type { TagCount } from "../types";
import IconButton from "@mui/material/IconButton";
import Badge from "@mui/material/Badge";
import Popover from "@mui/material/Popover";
import TextField from "@mui/material/TextField";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import FilterListIcon from "@mui/icons-material/FilterList";

interface TagFilterDropdownProps {
  tags: TagCount[];
  selectedTags: Set<string>;
  onToggleTag: (tag: string) => void;
  onClear: () => void;
}

export function TagFilterDropdown({ tags, selectedTags, onToggleTag, onClear }: TagFilterDropdownProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [tagQuery, setTagQuery] = useState("");

  const isOpen = Boolean(anchorEl);

  function handleClose() {
    setAnchorEl(null);
  }

  const query = tagQuery.trim().toLowerCase();
  const visibleTags = query ? tags.filter(({ tag }) => tag.toLowerCase().includes(query)) : tags;
  const emptyMessage = query ? "No matching tags" : "No tags";

  const countByTag = new Map(tags.map(({ tag, count }) => [tag, count]));
  const selectedTagItems = [...selectedTags].map((tag) => ({ tag, count: countByTag.get(tag) ?? 0 }));

  return (
    <>
      <IconButton
        id="tag-filter-toggle"
        size="small"
        aria-label="Filter by tag"
        title="Filter by tag"
        onClick={(event) => setAnchorEl(event.currentTarget)}
      >
        <Badge id="tag-filter-count" badgeContent={selectedTags.size} color="primary" invisible={selectedTags.size === 0}>
          <FilterListIcon fontSize="small" />
        </Badge>
      </IconButton>
      <Popover
        id="tag-filter-menu"
        open={isOpen}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <Box sx={{ width: 280 }}>
          <Box sx={{ p: 1, borderBottom: 1, borderColor: "divider" }}>
            <TextField
              id="tag-filter-search"
              size="small"
              fullWidth
              placeholder="Search tags…"
              aria-label="Search tags"
              value={tagQuery}
              onChange={(event) => setTagQuery(event.target.value)}
            />
          </Box>
          {selectedTagItems.length > 0 && (
            <>
              <List id="tag-filter-selected" dense disablePadding>
                {selectedTagItems.map(({ tag, count }) => (
                  <ListItemButton key={`selected-${tag}`} onClick={() => onToggleTag(tag)} dense>
                    <ListItemIcon sx={{ minWidth: 0, mr: 1 }}>
                      <Checkbox edge="start" checked size="small" disableRipple tabIndex={-1} />
                    </ListItemIcon>
                    <ListItemText primary={tag} />
                    <Chip label={count} size="small" variant="outlined" />
                  </ListItemButton>
                ))}
              </List>
              <Divider />
            </>
          )}
          <List id="tag-filter-options" dense disablePadding sx={{ maxHeight: 280, overflowY: "auto" }}>
            {visibleTags.length === 0 ? (
              <Typography color="text.secondary" variant="body2" sx={{ px: 2, py: 1 }}>
                {emptyMessage}
              </Typography>
            ) : (
              visibleTags.map(({ tag, count }) => (
                <ListItemButton key={tag} onClick={() => onToggleTag(tag)} dense>
                  <ListItemIcon sx={{ minWidth: 0, mr: 1 }}>
                    <Checkbox
                      edge="start"
                      checked={selectedTags.has(tag)}
                      size="small"
                      disableRipple
                      tabIndex={-1}
                    />
                  </ListItemIcon>
                  <ListItemText primary={tag} />
                  <Chip label={count} size="small" variant="outlined" />
                </ListItemButton>
              ))
            )}
          </List>
          <Divider />
          <ListItemButton id="tag-filter-clear" onClick={onClear} dense>
            <Typography color="text.secondary" variant="body2">
              Clear tag filters
            </Typography>
          </ListItemButton>
        </Box>
      </Popover>
    </>
  );
}
