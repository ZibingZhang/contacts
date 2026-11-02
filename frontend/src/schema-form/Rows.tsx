import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";

export function RowGrid({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 1.5 }}>
      {children}
    </Box>
  );
}

export function RemovableRow({ onRemove, children }: { onRemove: () => void; children: ReactNode }) {
  return (
    <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", mb: 1.5 }}>
      <Box sx={{ flexGrow: 1, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 1.5 }}>
        {children}
      </Box>
      <IconButton aria-label="Remove" onClick={onRemove} size="small" sx={{ mt: 0.5 }}>
        <DeleteOutlineIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}
