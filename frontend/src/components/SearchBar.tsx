import { useRef } from "react";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import ClearIcon from "@mui/icons-material/Clear";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChange, placeholder = "Search contacts…" }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <TextField
      inputRef={inputRef}
      id="search-input"
      size="small"
      fullWidth
      placeholder={placeholder}
      aria-label={placeholder.replace(/…$/, "")}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          inputRef.current?.blur();
        }
      }}
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
