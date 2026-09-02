import { useRef } from "react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="position-relative mb-2">
      <input
        ref={inputRef}
        id="search-input"
        type="text"
        className="form-control pe-4"
        placeholder="Search contacts…"
        aria-label="Search contacts"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        id="search-clear"
        type="button"
        className="btn-close position-absolute top-50 end-0 translate-middle-y me-2"
        aria-label="Clear search"
        hidden={!value}
        onClick={() => {
          onChange("");
          inputRef.current?.focus();
        }}
      />
    </div>
  );
}
