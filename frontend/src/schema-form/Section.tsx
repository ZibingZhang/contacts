import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box component="section" sx={{ "& + &": { mt: 3 } }}>
      <Typography
        variant="subtitle2"
        color="text.secondary"
        sx={{ textTransform: "uppercase", fontWeight: 700, mb: 1.5 }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  );
}
