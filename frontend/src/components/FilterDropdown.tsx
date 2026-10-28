import { useMemo, useState } from "react";
import type { Contact } from "../types";
import {
  FILTER_FIELDS,
  FILTER_FIELDS_BY_ID,
  countAllFilterValues,
  sameFilter,
  type FilterValueCount,
  type SelectedFilter,
} from "../filters";
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
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

interface FilterDropdownProps {
  contacts: Contact[];
  selectedFilters: SelectedFilter[];
  onToggleFilter: (filter: SelectedFilter) => void;
  onClear: () => void;
}

// Fixed row height for the virtualized value list below — some fields (e.g.
// Tag) can have hundreds of distinct values, and mounting every row's
// ListItemButton/Checkbox/Chip at once (even though only ~6 are visible in
// the 280px viewport) is what was actually making field switches feel slow,
// not the value-counting itself.
const ROW_HEIGHT = 46;
const VIEWPORT_HEIGHT = 280;
const OVERSCAN = 4;

interface VirtualValueListProps {
  values: FilterValueCount[];
  selectedFilters: SelectedFilter[];
  fieldId: string;
  onToggleFilter: (filter: SelectedFilter) => void;
  emptyMessage: string;
}

// Renders only the rows currently scrolled into view (plus a small overscan
// buffer), so opening a field with many values mounts a handful of rows
// instead of all of them.
function VirtualValueList({ values, selectedFilters, fieldId, onToggleFilter, emptyMessage }: VirtualValueListProps) {
  const [scrollTop, setScrollTop] = useState(0);

  if (values.length === 0) {
    return (
      <Typography color="text.secondary" variant="body2" sx={{ px: 2, py: 1 }}>
        {emptyMessage}
      </Typography>
    );
  }

  const visibleRowCount = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT);
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(values.length, startIndex + visibleRowCount + OVERSCAN * 2);

  return (
    <Box
      id="filter-values"
      sx={{ maxHeight: VIEWPORT_HEIGHT, overflowY: "auto", position: "relative" }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <Box sx={{ height: values.length * ROW_HEIGHT, position: "relative" }}>
        <List dense disablePadding sx={{ position: "absolute", top: startIndex * ROW_HEIGHT, left: 0, right: 0 }}>
          {values.slice(startIndex, endIndex).map(({ value, count }) => {
            const filter: SelectedFilter = { field: fieldId, value };
            const checked = selectedFilters.some((selected) => sameFilter(selected, filter));
            return (
              <ListItemButton key={value} onClick={() => onToggleFilter(filter)} dense sx={{ height: ROW_HEIGHT }}>
                <ListItemIcon sx={{ minWidth: 0, mr: 1 }}>
                  <Checkbox edge="start" checked={checked} size="small" disableRipple tabIndex={-1} />
                </ListItemIcon>
                <ListItemText primary={value} slotProps={{ primary: { noWrap: true } }} />
                <Chip label={count} size="small" variant="outlined" />
              </ListItemButton>
            );
          })}
        </List>
      </Box>
    </Box>
  );
}

// A two-level filter menu: pick a field (Tag, High School, City, …) then
// pick one of its values. Selections across any combination of fields
// narrow the contact list together (AND), mirroring the old tag-only facet.
export function FilterDropdown({ contacts, selectedFilters, onToggleFilter, onClear }: FilterDropdownProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [openFieldId, setOpenFieldId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");

  const isOpen = Boolean(anchorEl);
  const activeField = openFieldId ? FILTER_FIELDS_BY_ID.get(openFieldId) ?? null : null;

  function handleClose() {
    setAnchorEl(null);
    setOpenFieldId(null);
    setSearchText("");
  }

  function openField(fieldId: string) {
    setOpenFieldId(fieldId);
    setSearchText("");
  }

  function goBack() {
    setOpenFieldId(null);
    setSearchText("");
  }

  const query = searchText.trim().toLowerCase();

  const visibleFields = query
    ? FILTER_FIELDS.filter((field) => field.label.toLowerCase().includes(query))
    : FILTER_FIELDS;

  // Computed once per `contacts` change for every field at once, so opening
  // a field's value picker is a plain map lookup — no scan over `contacts`
  // happens on click.
  const valuesByField = useMemo(() => countAllFilterValues(contacts), [contacts]);
  const fieldValues = activeField ? valuesByField.get(activeField.id) ?? [] : [];
  const visibleValues = query ? fieldValues.filter(({ value }) => value.toLowerCase().includes(query)) : fieldValues;

  return (
    <>
      <IconButton
        id="filter-toggle"
        size="small"
        aria-label="Filter contacts"
        title="Filter contacts"
        onClick={(event) => setAnchorEl(event.currentTarget)}
      >
        <Badge
          id="filter-count"
          badgeContent={selectedFilters.length}
          color="primary"
          invisible={selectedFilters.length === 0}
        >
          <FilterListIcon fontSize="small" />
        </Badge>
      </IconButton>
      <Popover
        id="filter-menu"
        open={isOpen}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <Box sx={{ width: 300 }}>
          <Box sx={{ p: 1, borderBottom: 1, borderColor: "divider", display: "flex", alignItems: "center", gap: 0.5 }}>
            {activeField && (
              <IconButton id="filter-back" size="small" aria-label="Back to fields" onClick={goBack}>
                <ArrowBackIcon fontSize="small" />
              </IconButton>
            )}
            <TextField
              id="filter-search"
              size="small"
              fullWidth
              placeholder={activeField ? `Search ${activeField.label.toLowerCase()}…` : "Search fields…"}
              aria-label={activeField ? `Search ${activeField.label}` : "Search fields"}
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </Box>

          {!activeField && selectedFilters.length > 0 && (
            <>
              <List id="filter-selected" dense disablePadding>
                {selectedFilters.map((filter) => (
                  <ListItemButton key={`${filter.field}:${filter.value}`} onClick={() => onToggleFilter(filter)} dense>
                    <ListItemIcon sx={{ minWidth: 0, mr: 1 }}>
                      <Checkbox edge="start" checked size="small" disableRipple tabIndex={-1} />
                    </ListItemIcon>
                    <ListItemText primary={filter.value} secondary={FILTER_FIELDS_BY_ID.get(filter.field)?.label} />
                  </ListItemButton>
                ))}
              </List>
              <Divider />
            </>
          )}

          {activeField ? (
            <VirtualValueList
              key={`${activeField.id}::${query}`}
              values={visibleValues}
              selectedFilters={selectedFilters}
              fieldId={activeField.id}
              onToggleFilter={onToggleFilter}
              emptyMessage={query ? "No matching values" : "No values"}
            />
          ) : (
            <List id="filter-fields" dense disablePadding sx={{ maxHeight: 280, overflowY: "auto" }}>
              {visibleFields.length === 0 ? (
                <Typography color="text.secondary" variant="body2" sx={{ px: 2, py: 1 }}>
                  No matching fields
                </Typography>
              ) : (
                visibleFields.map((field) => (
                  <ListItemButton key={field.id} onClick={() => openField(field.id)} dense>
                    <ListItemText primary={field.label} />
                    <ChevronRightIcon fontSize="small" color="action" />
                  </ListItemButton>
                ))
              )}
            </List>
          )}

          <Divider />
          <ListItemButton id="filter-clear" onClick={onClear} dense>
            <Typography color="text.secondary" variant="body2">
              Clear filters
            </Typography>
          </ListItemButton>
        </Box>
      </Popover>
    </>
  );
}
