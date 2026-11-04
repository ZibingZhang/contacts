import { useEffect, useState } from "react";
import { fetchSchemas } from "../api";
import { SCHEMA_META_SCHEMA } from "../schemaMeta";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import AppsIcon from "@mui/icons-material/Apps";

interface TypeOption {
  name: string;
  label: string;
}

interface TypeNavProps {
  currentTypeName: string | null;
  onSelectType: (typeName: string) => void;
}

/**
 * A generic picker over every schema-defined object type, fed by
 * `GET /api/schemas` -- gives any custom type a working nav entry with no
 * type-specific code. Contact and list also appear here, alongside their
 * own dedicated TopBar affordances. "Schema" itself is injected as a
 * synthetic entry (see schemaMeta.ts) since the backend never returns a
 * schema-object literally named "schema".
 */
export function TypeNav({ currentTypeName, onSelectType }: TypeNavProps) {
  const [types, setTypes] = useState<TypeOption[]>([]);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSchemas()
      .then((data) => {
        if (cancelled) return;
        const options = data.schemas.map((schema) => ({ name: schema.name, label: schema.label.singular }));
        options.push({ name: SCHEMA_META_SCHEMA.name, label: SCHEMA_META_SCHEMA.label.singular });
        options.sort((a, b) => a.label.localeCompare(b.label));
        setTypes(options);
      })
      .catch(() => {
        if (!cancelled) setTypes([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Tooltip title="Browse object types">
        <IconButton
          id="type-nav-button"
          size="small"
          aria-label="Browse object types"
          onClick={(event) => setAnchorEl(event.currentTarget)}
        >
          <AppsIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        {types.map((type) => (
          <MenuItem
            key={type.name}
            selected={type.name === currentTypeName}
            onClick={() => {
              onSelectType(type.name);
              setAnchorEl(null);
            }}
          >
            {type.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
