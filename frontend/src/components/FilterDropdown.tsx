import { useMemo, useState } from "react";
import type { SchemaObject } from "../types";
import {
  NONE_FILTER_VALUE,
  buildFilterCatalog,
  countAllFilterValues,
  isFilterFieldGroup,
  isNoneFilterValue,
  sameFilter,
  type FilterFieldGroup,
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
import SortByAlphaIcon from "@mui/icons-material/SortByAlpha";

// Display label for a filter value — the "no value" sentinel reads as
// "(None)" rather than its internal placeholder string.
function filterValueLabel(value: string): string {
  return isNoneFilterValue(value) ? "(None)" : value;
}

interface FilterDropdownProps {
  schema: SchemaObject;
  // The unfiltered (but list-scoped) object set to count values against --
  // same role as `scopedContacts` used to play, generalized to any type.
  objects: unknown[];
  selectedFilters: SelectedFilter[];
  onToggleFilter: (filter: SelectedFilter) => void;
  onClear: () => void;
}

// Fixed row height for the virtualized value list below — some fields (e.g.
// Tag) can have hundreds of distinct values, and mounting every row's
// ListItemButton/Checkbox/Chip at once (even though only ~6 are visible in
// the 280px viewport) is what was actually making field switches feel slow,
// not the value-counting itself.
// Matches the small Checkbox's actual rendered height (MUI's SwitchBase applies a
// fixed 9px padding top and bottom around the 20px icon) so it fits with no overflow.
const ROW_HEIGHT = 38;
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
              <ListItemButton
                key={value}
                onClick={() => onToggleFilter(filter)}
                dense
                sx={{ height: ROW_HEIGHT, py: 0 }}
              >
                <ListItemIcon sx={{ minWidth: 0, mr: 0.5 }}>
                  <Checkbox edge="start" checked={checked} size="small" disableRipple tabIndex={-1} />
                </ListItemIcon>
                <ListItemText primary={filterValueLabel(value)} slotProps={{ primary: { noWrap: true } }} />
                <Chip label={count} size="small" variant="outlined" />
              </ListItemButton>
            );
          })}
        </List>
      </Box>
    </Box>
  );
}

// A three-level filter menu: pick a group (Education, Social Profile, …) or
// standalone field (Tag, City, …), then — for a group — pick one of its
// fields, then pick one of that field's values. Selections across any
// combination of fields narrow the object list together (AND), mirroring
// the old contact-only tag facet. Schema-driven via `buildFilterCatalog`, so
// this works for any object type's schema, not just contacts.
export function FilterDropdown({ schema, objects, selectedFilters, onToggleFilter, onClear }: FilterDropdownProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [openFieldId, setOpenFieldId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [sortAlpha, setSortAlpha] = useState(false);

  const catalog = useMemo(() => buildFilterCatalog(schema), [schema]);
  // Maps each group's "None" field id to that group's label, so a selected
  // group-none filter can read as "None" / "Education" rather than the
  // confusing default of "(None)" / "None" (the none-field's own label).
  const groupLabelByNoneFieldId = useMemo(
    () => new Map(catalog.menu.filter(isFilterFieldGroup).map((group) => [group.noneField.id, group.label])),
    [catalog]
  );

  const isOpen = Boolean(anchorEl);
  const activeGroup: FilterFieldGroup | null = openGroupId
    ? (catalog.menu.find((entry) => entry.id === openGroupId) as FilterFieldGroup | undefined) ?? null
    : null;
  const activeField = openFieldId ? catalog.fieldsById.get(openFieldId) ?? null : null;

  function handleClose() {
    setAnchorEl(null);
    setOpenGroupId(null);
    setOpenFieldId(null);
    setSearchText("");
    setSortAlpha(false);
  }

  function openGroup(groupId: string) {
    setOpenGroupId(groupId);
    setSearchText("");
  }

  function openField(fieldId: string) {
    setOpenFieldId(fieldId);
    setSearchText("");
  }

  // Steps back one level: value picker -> field list (group's, if any, else
  // top-level) -> top-level.
  function goBack() {
    if (openFieldId !== null) {
      setOpenFieldId(null);
    } else {
      setOpenGroupId(null);
    }
    setSearchText("");
  }

  const query = searchText.trim().toLowerCase();

  // At the top level, a search also reaches into group fields (e.g. typing
  // "facebook" finds it without first opening Social Profile) and jumps
  // straight to the field entry; otherwise show the top-level menu as-is.
  const visibleMenuEntries =
    query && !activeGroup
      ? catalog.fields.filter((field) => !field.hidden && field.label.toLowerCase().includes(query))
      : !activeGroup
        ? catalog.menu
        : [];

  const visibleGroupFields =
    activeGroup && query
      ? activeGroup.fields.filter((field) => field.label.toLowerCase().includes(query))
      : activeGroup?.fields ?? [];

  // The group's "None" sub-option participates in the same search as its
  // fields, so typing "none" surfaces it and typing anything else hides it
  // if it doesn't match.
  const showGroupNoneOption = Boolean(activeGroup) && (!query || "none".includes(query));

  // Computed once per `objects` change for every field at once, so opening
  // a field's value picker is a plain map lookup — no scan over `objects`
  // happens on click.
  const valuesByField = useMemo(() => countAllFilterValues(objects, catalog.fields), [objects, catalog]);
  const groupNoneCount = activeGroup
    ? valuesByField.get(activeGroup.noneField.id)?.find(({ value }) => isNoneFilterValue(value))?.count ?? 0
    : 0;
  const fieldValues = activeField ? valuesByField.get(activeField.id) ?? [] : [];
  const matchingValues = query
    ? fieldValues.filter(({ value }) => filterValueLabel(value).toLowerCase().includes(query))
    : fieldValues;
  // `fieldValues` already carries the default (most-common-first) order;
  // only re-sort alphabetically when the user has asked for it.
  const visibleValues = sortAlpha
    ? [...matchingValues].sort((a, b) => filterValueLabel(a.value).localeCompare(filterValueLabel(b.value)))
    : matchingValues;

  return (
    <>
      <IconButton
        id="filter-toggle"
        size="small"
        aria-label={`Filter ${schema.label.plural}`}
        title={`Filter ${schema.label.plural}`}
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
            {(activeField || activeGroup) && (
              <IconButton id="filter-back" size="small" aria-label="Back" onClick={goBack}>
                <ArrowBackIcon fontSize="small" />
              </IconButton>
            )}
            <TextField
              id="filter-search"
              size="small"
              fullWidth
              placeholder={
                activeField
                  ? `Search ${activeField.label.toLowerCase()}…`
                  : activeGroup
                    ? `Search ${activeGroup.label.toLowerCase()} fields…`
                    : "Search fields…"
              }
              aria-label={activeField ? `Search ${activeField.label}` : activeGroup ? `Search ${activeGroup.label}` : "Search fields"}
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            {activeField && (
              <IconButton
                id="filter-sort-alpha"
                size="small"
                aria-label={sortAlpha ? "Sort by count" : "Sort alphabetically"}
                title={sortAlpha ? "Sort by count" : "Sort alphabetically"}
                color={sortAlpha ? "primary" : "default"}
                onClick={() => setSortAlpha((current) => !current)}
              >
                <SortByAlphaIcon fontSize="small" />
              </IconButton>
            )}
          </Box>

          {!activeField && !activeGroup && selectedFilters.length > 0 && (
            <>
              <List id="filter-selected" dense disablePadding>
                {selectedFilters.map((filter) => (
                  <ListItemButton
                    key={`${filter.field}:${filter.value}`}
                    onClick={() => onToggleFilter(filter)}
                    dense
                    sx={{ py: 0.25 }}
                  >
                    <ListItemIcon sx={{ minWidth: 0, mr: 0.5 }}>
                      <Checkbox edge="start" checked size="small" disableRipple tabIndex={-1} />
                    </ListItemIcon>
                    <ListItemText
                      primary={groupLabelByNoneFieldId.has(filter.field) ? "None" : filterValueLabel(filter.value)}
                      secondary={groupLabelByNoneFieldId.get(filter.field) ?? catalog.fieldsById.get(filter.field)?.label}
                    />
                  </ListItemButton>
                ))}
              </List>
              <Divider />
            </>
          )}

          {activeField ? (
            <VirtualValueList
              key={`${activeField.id}::${query}::${sortAlpha}`}
              values={visibleValues}
              selectedFilters={selectedFilters}
              fieldId={activeField.id}
              onToggleFilter={onToggleFilter}
              emptyMessage={query ? "No matching values" : "No values"}
            />
          ) : activeGroup ? (
            <List id="filter-group-fields" dense disablePadding sx={{ maxHeight: VIEWPORT_HEIGHT, overflowY: "auto" }}>
              {showGroupNoneOption && (
                <>
                  <ListItemButton
                    onClick={() => onToggleFilter({ field: activeGroup.noneField.id, value: NONE_FILTER_VALUE })}
                    dense
                    sx={{ py: 0.25 }}
                  >
                    <ListItemIcon sx={{ minWidth: 0, mr: 0.5 }}>
                      <Checkbox
                        edge="start"
                        checked={selectedFilters.some((selected) =>
                          sameFilter(selected, { field: activeGroup.noneField.id, value: NONE_FILTER_VALUE }),
                        )}
                        size="small"
                        disableRipple
                        tabIndex={-1}
                      />
                    </ListItemIcon>
                    <ListItemText primary="None" />
                    <Chip label={groupNoneCount} size="small" variant="outlined" />
                  </ListItemButton>
                  <Divider />
                </>
              )}
              {visibleGroupFields.length === 0 ? (
                <Typography color="text.secondary" variant="body2" sx={{ px: 2, py: 1 }}>
                  No matching fields
                </Typography>
              ) : (
                visibleGroupFields.map((field) => (
                  <ListItemButton key={field.id} onClick={() => openField(field.id)} dense sx={{ py: 0.25 }}>
                    <ListItemText primary={field.label} />
                    <ChevronRightIcon fontSize="small" color="action" />
                  </ListItemButton>
                ))
              )}
            </List>
          ) : (
            <List id="filter-fields" dense disablePadding sx={{ maxHeight: VIEWPORT_HEIGHT, overflowY: "auto" }}>
              {visibleMenuEntries.length === 0 ? (
                <Typography color="text.secondary" variant="body2" sx={{ px: 2, py: 1 }}>
                  No matching fields
                </Typography>
              ) : (
                visibleMenuEntries.map((entry) => (
                  <ListItemButton
                    key={entry.id}
                    onClick={() => (isFilterFieldGroup(entry) ? openGroup(entry.id) : openField(entry.id))}
                    dense
                    sx={{ py: 0.25 }}
                  >
                    <ListItemText primary={entry.label} />
                    <ChevronRightIcon fontSize="small" color="action" />
                  </ListItemButton>
                ))
              )}
            </List>
          )}

          <Divider />
          <ListItemButton id="filter-clear" onClick={onClear} dense sx={{ py: 0.25 }}>
            <Typography color="text.secondary" variant="body2">
              Clear filters
            </Typography>
          </ListItemButton>
        </Box>
      </Popover>
    </>
  );
}
