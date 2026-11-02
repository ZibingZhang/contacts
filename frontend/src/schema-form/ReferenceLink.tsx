import { useEffect, useState } from "react";
import { fetchObject, fetchSchema } from "../api";
import { displayLabel } from "./displayLabel";
import { useNavigateToObject } from "./navigation";
import Link from "@mui/material/Link";

export function ReferenceLink({ objectType, id }: { objectType: string; id: number }) {
  const [label, setLabel] = useState<string>(`#${id}`);
  const navigate = useNavigateToObject();

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchObject<Record<string, unknown>>(objectType, id), fetchSchema(objectType)])
      .then(([obj, schema]) => {
        if (!cancelled) setLabel(displayLabel(schema, obj, id));
      })
      .catch(() => {
        // Keep the "#<id>" fallback if the referenced object can't be loaded.
      });
    return () => {
      cancelled = true;
    };
  }, [objectType, id]);

  return (
    <Link component="button" type="button" onClick={() => navigate(objectType, id)} sx={{ textAlign: "left" }}>
      {label}
    </Link>
  );
}
