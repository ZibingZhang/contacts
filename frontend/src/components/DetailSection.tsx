import type { ReactNode } from "react";
import { slugify } from "../format";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export interface FieldRowData {
  key: string;
  label: string;
  value: ReactNode;
}

export function fieldRow(label: string, value: ReactNode, key = label): FieldRowData {
  return { key, label, value };
}

export function DetailSection({ title, rows }: { title: string; rows: FieldRowData[] }) {
  if (!rows.length) {
    return null;
  }

  return (
    <Box component="section" sx={{ "& + &": { mt: 3 } }}>
      <Typography
        variant="subtitle2"
        color="text.secondary"
        sx={{ textTransform: "uppercase", fontWeight: 700, mb: 1 }}
      >
        {title}
      </Typography>
      {rows.map((row) => (
        <Box sx={{ display: "flex", gap: 1.5, py: 0.25 }} data-field={slugify(row.label)} key={row.key}>
          <Box sx={{ flex: "0 0 140px", color: "text.secondary", fontSize: "0.875rem" }}>{row.label}</Box>
          <Box sx={{ flex: "1 1 auto" }}>{row.value}</Box>
        </Box>
      ))}
    </Box>
  );
}
