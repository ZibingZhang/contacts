import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import type { NavigateFunction } from "react-router-dom";
import type { ListObject, SchemaField, SchemaObject } from "../types";
import { ListsNav } from "./ListsNav";
import { TypeObjectList } from "./TypeObjectList";
import { FilterDropdown } from "./FilterDropdown";
import type { SelectedFilter } from "../filters";
import { SchemaDetail, type SchemaObjectData } from "../schema-form/SchemaDetail";
import { SchemaForm, type SavedObject, type FieldRendererProps } from "../schema-form/SchemaForm";
import { useDebouncedValue, useFilteredObjectIds } from "../hooks";

interface GenericTypeViewProps {
  sidebarCollapsed: boolean;
  listsForCurrentType: ListObject[];
  listMemberIds: Record<number, number[]>;
  scopingListId: number | null;
  onSelectList: (listId: number | null) => void;
  listsRefreshing: boolean;
  onRefreshLists: () => void;

  typeName: string;
  routeId: number | null;
  navigate: NavigateFunction;
  genericSchema: SchemaObject | null;
  genericObjects: SavedObject[];
  scopedGenericObjects: SavedObject[];
  genericReady: boolean;
  genericLoading: boolean;
  selectionMode: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  selectedFilters: SelectedFilter[];
  onToggleFilter: (filter: SelectedFilter) => void;
  onClearFilters: () => void;

  editingGenericId: number | "new" | null;
  setEditingGenericId: (id: number | "new" | null) => void;
  saveGenericObject: (saved: SavedObject) => void | Promise<void>;

  // Composition-root overlays for the one caller (List) that still needs
  // per-type customization of this otherwise fully generic view -- undefined
  // for every true generic type.
  subtitleFor?: (obj: SavedObject) => string;
  overlayFields?: (fields: SchemaField[], isEditing: boolean) => SchemaField[];
  extraSections?: (obj: SavedObject) => ReactNode;
  extraActions?: (obj: SavedObject) => ReactNode;
  fieldRenderers?: Record<string, ComponentType<FieldRendererProps>>;
}

export function GenericTypeView({
  sidebarCollapsed,
  listsForCurrentType,
  listMemberIds,
  scopingListId,
  onSelectList,
  listsRefreshing,
  onRefreshLists,
  typeName,
  routeId,
  navigate,
  genericSchema,
  genericObjects,
  scopedGenericObjects,
  genericReady,
  genericLoading,
  selectionMode,
  selectedIds,
  onToggleSelect,
  selectedFilters,
  onToggleFilter,
  onClearFilters,
  editingGenericId,
  setEditingGenericId,
  saveGenericObject,
  subtitleFor,
  overlayFields,
  extraSections,
  extraActions,
  fieldRenderers,
}: GenericTypeViewProps) {
  // Local to this view rather than URL-synced (unlike Contact's `?q=`) --
  // reset whenever the browsed type or list scope changes, so a search
  // typed while browsing one type doesn't silently carry over and hide
  // everything after switching to another (this component instance is
  // reused across types/scopes, not remounted).
  const [searchQuery, setSearchQuery] = useState("");
  useEffect(() => {
    setSearchQuery("");
  }, [typeName, scopingListId]);
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 100);

  const { ids: visibleGenericIds, query: appliedSearchQuery } = useFilteredObjectIds<SavedObject>(
    scopedGenericObjects,
    debouncedSearchQuery,
    selectedFilters,
    genericSchema
  );
  const genericObjectsById = useMemo(() => new Map(scopedGenericObjects.map((obj) => [obj.id, obj])), [scopedGenericObjects]);
  const filteredGenericObjects = useMemo(
    () => visibleGenericIds.flatMap((id) => (genericObjectsById.has(id) ? [genericObjectsById.get(id)!] : [])),
    [visibleGenericIds, genericObjectsById]
  );
  const grouped = !appliedSearchQuery.trim();

  return (
    <Box sx={{ display: "flex", flexGrow: 1, overflow: "hidden" }}>
      {!sidebarCollapsed && (
        // Unlike TypeObjectList below, ListsNav doesn't need the generic
        // schema to render -- lists/memberIds are already loaded app-wide --
        // so it never has to wait on the per-type fetch.
        <ListsNav
          lists={listsForCurrentType}
          memberIds={listMemberIds}
          selectedListId={scopingListId}
          onSelectList={onSelectList}
          allLabel={genericSchema ? `All ${genericSchema.label.plural}` : "All"}
          totalCount={genericObjects.length}
          refreshing={listsRefreshing}
          onRefresh={onRefreshLists}
        />
      )}
      {!sidebarCollapsed &&
        (genericSchema ? (
          <TypeObjectList
            schema={genericSchema}
            objects={filteredGenericObjects}
            selectedId={routeId}
            onSelect={(id) => navigate(`/types/${typeName}/${id}`)}
            onSelectAll={() => navigate(`/types/${typeName}`)}
            hideAllRow
            subtitleFor={subtitleFor}
            headerAction={
              <FilterDropdown
                schema={genericSchema}
                objects={scopedGenericObjects}
                selectedFilters={selectedFilters}
                onToggleFilter={onToggleFilter}
                onClear={onClearFilters}
              />
            }
            search={{ query: searchQuery, onQueryChange: setSearchQuery, grouped }}
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            onToggleSelect={onToggleSelect}
          />
        ) : (
          // Schema not cached yet for this type -- a same-sized placeholder
          // column instead of rendering nothing, so the layout doesn't
          // collapse and reflow once it arrives.
          <Box
            sx={{
              width: 280,
              flexShrink: 0,
              borderRight: 1,
              borderColor: "divider",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CircularProgress size={24} />
          </Box>
        ))}

      <Box component="main" sx={{ flexGrow: 1, overflow: "auto", px: 4, pb: 4 }}>
        {!genericReady || !genericSchema ? (
          genericLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Alert severity="error" sx={{ mt: 4 }}>
              Unknown object type "{typeName}".
            </Alert>
          )
        ) : editingGenericId !== null ? (
          <SchemaForm
            key={editingGenericId}
            schema={genericSchema}
            value={editingGenericId === "new" ? null : genericObjects.find((o) => o.id === editingGenericId) ?? null}
            overlayFields={overlayFields}
            fieldRenderers={fieldRenderers}
            onCancel={() => setEditingGenericId(null)}
            onSaved={async (saved) => {
              await saveGenericObject(saved);
              setEditingGenericId(null);
              navigate(`/types/${typeName}/${saved.id}`);
            }}
          />
        ) : (
          <Box sx={{ pt: 4 }}>
            {(() => {
              const selectedGenericObject = genericObjects.find((o) => o.id === routeId) ?? null;
              return selectedGenericObject ? (
                <SchemaDetail
                  key={selectedGenericObject.id}
                  schema={genericSchema}
                  data={selectedGenericObject as unknown as SchemaObjectData}
                  onEdit={() => setEditingGenericId(selectedGenericObject.id)}
                  extraSections={extraSections?.(selectedGenericObject)}
                  extraActions={extraActions?.(selectedGenericObject)}
                />
              ) : routeId !== null ? (
                <Alert severity="error">Not found.</Alert>
              ) : (
                <Typography color="text.secondary">
                  Select a {genericSchema.label.singular.toLowerCase()} to see its details.
                </Typography>
              );
            })()}
          </Box>
        )}
      </Box>
    </Box>
  );
}
