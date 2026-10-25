import { useRef } from "react";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import ClearIcon from "@mui/icons-material/Clear";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <TextField
      inputRef={inputRef}
      id="search-input"
      size="small"
      fullWidth
      sx={{ mb: 2 }}
      placeholder="Search contacts…"
      aria-label="Search contacts"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      slotProps={{
        input: {
          endAdornment: value ? (
            <InputAdornment position="end">
              <IconButton
                id="search-clear"
                size="small"
                aria-label="Clear search"
                onClick={() => {
                  onChange("");
                  inputRef.current?.focus();
                }}
              >
                <ClearIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ) : undefined,
        },
      }}
    />
  );
}
