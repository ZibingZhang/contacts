import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import type { NavigateFunction } from "react-router-dom";
import type { ListObject, SchemaField, SchemaObject } from "../types";
import { ListsNav } from "./ListsNav";
import { TypeObjectList } from "./TypeObjectList";
import { SchemaDetail, type SchemaObjectData } from "../schema-form/SchemaDetail";
import { ListMembersSection } from "../schema-form/ListMembersSection";
import { SchemaForm, type SavedObject } from "../schema-form/SchemaForm";

interface ListViewProps {
  sidebarCollapsed: boolean;
  listsForCurrentType: ListObject[];
  listMemberIds: Record<number, number[]>;
  scopingListId: number | null;
  onSelectList: (listId: number | null) => void;
  listsRefreshing: boolean;
  onRefreshLists: () => void;

  lists: ListObject[];
  scopedLists: ListObject[];
  listSchema: SchemaObject | null;
  selectedListId: number | null;
  navigate: NavigateFunction;
  selectionMode: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;

  overlayListFields: (fields: SchemaField[], isEditing: boolean) => SchemaField[];
  editingListId: number | "new" | null;
  onCancelEditList: () => void;
  onListSaved: (list: ListObject) => void;

  selectedList: ListObject | null;
  onEditList: () => void;
  onRefreshSelectedList: (listId: number) => void;
  selectedListRefreshing: boolean;
  selectedListRefreshError: string | null;
}

export function ListView({
  sidebarCollapsed,
  listsForCurrentType,
  listMemberIds,
  scopingListId,
  onSelectList,
  listsRefreshing,
  onRefreshLists,
  lists,
  scopedLists,
  listSchema,
  selectedListId,
  navigate,
  selectionMode,
  selectedIds,
  onToggleSelect,
  overlayListFields,
  editingListId,
  onCancelEditList,
  onListSaved,
  selectedList,
  onEditList,
  onRefreshSelectedList,
  selectedListRefreshing,
  selectedListRefreshError,
}: ListViewProps) {
  return (
    <Box sx={{ display: "flex", flexGrow: 1, overflow: "hidden" }}>
      {!sidebarCollapsed && (
        <ListsNav
          lists={listsForCurrentType}
          memberIds={listMemberIds}
          selectedListId={scopingListId}
          onSelectList={onSelectList}
          allLabel="All Lists"
          totalCount={lists.length}
          refreshing={listsRefreshing}
          onRefresh={onRefreshLists}
        />
      )}
      {!sidebarCollapsed && listSchema && (
        <TypeObjectList
          schema={listSchema}
          objects={scopedLists as unknown as (Record<string, unknown> & { id: number })[]}
          selectedId={selectedListId}
          onSelect={(id) => navigate(`/types/list/${id}`)}
          onSelectAll={() => navigate("/types/list")}
          hideAllRow
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
          subtitleFor={(obj) => `${listMemberIds[obj.id]?.length ?? 0} member${listMemberIds[obj.id]?.length === 1 ? "" : "s"}`}
        />
      )}

      <Box component="main" id="list-detail" sx={{ flexGrow: 1, overflow: "auto", px: 4, pb: 4 }}>
        {!listSchema ? (
          <Alert severity="error" sx={{ mt: 4 }}>
            Could not load the list schema.
          </Alert>
        ) : editingListId !== null ? (
          <SchemaForm
            key={editingListId}
            schema={listSchema}
            value={editingListId === "new" ? null : (lists.find((l) => l.id === editingListId) as SavedObject | undefined) ?? null}
            overlayFields={overlayListFields}
            onCancel={onCancelEditList}
            onSaved={(saved) => onListSaved(saved as unknown as ListObject)}
          />
        ) : (
          <Box sx={{ pt: 4 }}>
            {selectedList ? (
              <SchemaDetail
                key={selectedList.id}
                schema={listSchema}
                data={selectedList as unknown as SchemaObjectData}
                onEdit={onEditList}
                extraSections={<ListMembersSection list={selectedList} />}
                extraActions={
                  selectedList.query ? (
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => onRefreshSelectedList(selectedList.id)}
                      disabled={selectedListRefreshing}
                    >
                      {selectedListRefreshing ? "Refreshing…" : "Refresh"}
                    </Button>
                  ) : undefined
                }
              />
            ) : selectedListId !== null ? (
              <Alert severity="error">List not found.</Alert>
            ) : (
              <Typography color="text.secondary">Select a list to see its details.</Typography>
            )}
            {selectedListRefreshError && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {selectedListRefreshError}
              </Alert>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}
