import { useMemo, type Dispatch, type SetStateAction } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import type { NavigateFunction } from "react-router-dom";
import type { ListObject, SchemaObject } from "../types";
import { ListsNav } from "./ListsNav";
import { TypeObjectList } from "./TypeObjectList";
import { FilterDropdown } from "./FilterDropdown";
import { buildFilterCatalog, matchesFilters, type SelectedFilter } from "../filters";
import { SchemaEditor } from "./SchemaEditor";
import { SCHEMA_META_SCHEMA } from "../schemaMeta";

interface SchemaViewProps {
  sidebarCollapsed: boolean;
  listsForCurrentType: ListObject[];
  listMemberIds: Record<number, number[]>;
  scopingListId: number | null;
  onSelectList: (listId: number | null) => void;
  listsRefreshing: boolean;
  onRefreshLists: () => void;

  schemaObjects: SchemaObject[];
  setSchemaObjects: Dispatch<SetStateAction<SchemaObject[]>>;
  scopedSchemaObjects: SchemaObject[];
  routeId: number | null;
  navigate: NavigateFunction;
  selectionMode: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  selectedFilters: SelectedFilter[];
  onToggleFilter: (filter: SelectedFilter) => void;
  onClearFilters: () => void;

  editingSchemaId: "new" | null;
  setEditingSchemaId: (id: "new" | null) => void;
}

export function SchemaView({
  sidebarCollapsed,
  listsForCurrentType,
  listMemberIds,
  scopingListId,
  onSelectList,
  listsRefreshing,
  onRefreshLists,
  schemaObjects,
  setSchemaObjects,
  scopedSchemaObjects,
  routeId,
  navigate,
  selectionMode,
  selectedIds,
  onToggleSelect,
  selectedFilters,
  onToggleFilter,
  onClearFilters,
  editingSchemaId,
  setEditingSchemaId,
}: SchemaViewProps) {
  const selectedSchema = schemaObjects.find((s) => s.id === routeId) ?? null;
  const filterCatalog = useMemo(() => buildFilterCatalog(SCHEMA_META_SCHEMA), []);
  const filteredSchemaObjects = useMemo(
    () => scopedSchemaObjects.filter((obj) => matchesFilters(obj, selectedFilters, filterCatalog.fieldsById)),
    [scopedSchemaObjects, selectedFilters, filterCatalog]
  );

  return (
    <Box sx={{ display: "flex", flexGrow: 1, overflow: "hidden" }}>
      {!sidebarCollapsed && (
        <ListsNav
          lists={listsForCurrentType}
          memberIds={listMemberIds}
          selectedListId={scopingListId}
          onSelectList={onSelectList}
          allLabel="All Schemas"
          totalCount={schemaObjects.length}
          refreshing={listsRefreshing}
          onRefresh={onRefreshLists}
        />
      )}
      {!sidebarCollapsed && (
        <TypeObjectList
          schema={SCHEMA_META_SCHEMA}
          objects={filteredSchemaObjects as unknown as (Record<string, unknown> & { id: number })[]}
          selectedId={routeId}
          onSelect={(id) => navigate(`/types/schema/${id}`)}
          onSelectAll={() => navigate("/types/schema")}
          hideAllRow
          subtitleFor={(obj) => ((obj as unknown as SchemaObject).builtin ? "Built-in" : "Custom")}
          headerAction={
            <FilterDropdown
              schema={SCHEMA_META_SCHEMA}
              objects={scopedSchemaObjects}
              selectedFilters={selectedFilters}
              onToggleFilter={onToggleFilter}
              onClear={onClearFilters}
            />
          }
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
        />
      )}

      <Box component="main" sx={{ flexGrow: 1, overflow: "auto", px: 4, pb: 4 }}>
        <Box sx={{ pt: 4 }}>
          {editingSchemaId === "new" ? (
            <SchemaEditor
              schema={null}
              onCancel={() => setEditingSchemaId(null)}
              onSaved={(saved) => {
                setSchemaObjects((prev) => [...prev, saved]);
                setEditingSchemaId(null);
                navigate(`/types/schema/${saved.id}`);
              }}
              onDeleted={() => {}}
            />
          ) : selectedSchema ? (
            <SchemaEditor
              key={selectedSchema.id}
              schema={selectedSchema}
              onCancel={() => navigate("/types/schema")}
              onSaved={(saved) => {
                setSchemaObjects((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
                navigate(`/types/schema/${saved.id}`);
              }}
              onDeleted={(name) => {
                setSchemaObjects((prev) => prev.filter((s) => s.name !== name));
                navigate("/types/schema");
              }}
            />
          ) : routeId !== null ? (
            <Alert severity="error">Not found.</Alert>
          ) : (
            <Typography color="text.secondary">Select a schema to see its details.</Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}
