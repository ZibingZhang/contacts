import { useState } from "react";
import { formatDate } from "../format";
import TextField from "@mui/material/TextField";

// A "date" field's value allows "XXXX"/"XX" in place of a year/month/day
// that isn't known (e.g. a birthday with no known year), so it's a plain
// text field rather than a native date input, which can't represent that
// ambiguity. Shared by every "date" field in every schema.
const PARTIAL_DATE_RE = /^(\d{4}|XXXX)-(\d{2}|XX)-(\d{2}|XX)$/;

export function isValidDateInput(value: string): boolean {
  return value.trim() === "" || PARTIAL_DATE_RE.test(value.trim());
}

// Strips everything but digits/X, uppercases, caps at 8 meaningful chars
// (YYYYMMDD), and re-inserts the dashes -- so typing "19900305" becomes
// "1990-03-05" as you go, the same way a phone number field auto-formats.
export function autoDashDate(raw: string): string {
  const chars = raw.toUpperCase().replace(/[^0-9X]/g, "").slice(0, 8);
  const parts = [chars.slice(0, 4)];
  if (chars.length > 4) parts.push(chars.slice(4, 6));
  if (chars.length > 6) parts.push(chars.slice(6, 8));
  return parts.join("-");
}

interface DateFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

// Shows a friendly, read-only-looking formatted date (e.g. "March 1990")
// until clicked, then swaps to the raw "YYYY-MM-DD" (XX/XXXX for unknown
// parts) for editing, reverting back to the friendly format on blur.
// Doesn't flag red while a date is still mid-typing -- only once all 8
// digits/X's are in and they don't form a valid date, or after blur.
export function DateField({ label, value, onChange }: DateFieldProps) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(value);

  const complete = draft.replace(/-/g, "").length === 8;
  const showError = focused ? complete && !isValidDateInput(draft) : value !== "" && !isValidDateInput(value);

  return (
    <TextField
      label={label}
      size="small"
      fullWidth
      value={focused ? draft : formatDate(value) ?? ""}
      placeholder={focused ? "YYYY-MM-DD" : undefined}
      error={showError}
      helperText={
        showError ? "Expected YYYY-MM-DD, with XX/XXXX for unknown parts" : focused ? "XX/XXXX for unknown parts" : undefined
      }
      onFocus={() => {
        setDraft(value);
        setFocused(true);
      }}
      onBlur={() => {
        setFocused(false);
        onChange(draft.trim());
      }}
      onChange={(e) => setDraft(autoDashDate(e.target.value))}
    />
  );
}
