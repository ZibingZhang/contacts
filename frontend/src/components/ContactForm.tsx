import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ContactFieldOptions, Contact, Education, EducationLevel, TagCount } from "../types";
import { createContact, updateContact, fetchContactFieldOptions, ApiError } from "../api";
import { EDUCATION_LABELS, formatDate } from "../format";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";
import Autocomplete from "@mui/material/Autocomplete";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";

interface IdRow {
  id: string;
}

interface PhoneRow extends IdRow {
  label: string;
  countryCode: number;
  number: string;
}

interface EmailRow extends IdRow {
  label: string;
  address: string;
}

interface AddressRow extends IdRow {
  label: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

interface FavoriteRow extends IdRow {
  key: string;
  value: string;
}

interface EducationRowState {
  name: string;
  graduationYear: string;
  majors: string;
  minors: string;
}

const EMPTY_EDUCATION_ROW: EducationRowState = { name: "", graduationYear: "", majors: "", minors: "" };

function emptyEducation(): Record<EducationLevel, EducationRowState> {
  return {
    high_school: { ...EMPTY_EDUCATION_ROW },
    bachelor: { ...EMPTY_EDUCATION_ROW },
    master: { ...EMPTY_EDUCATION_ROW },
    law: { ...EMPTY_EDUCATION_ROW },
    medical: { ...EMPTY_EDUCATION_ROW },
    phd: { ...EMPTY_EDUCATION_ROW },
  };
}

function educationToForm(education: Education | undefined): Record<EducationLevel, EducationRowState> {
  const form = emptyEducation();
  for (const level of Object.keys(form) as EducationLevel[]) {
    const entry = education?.[level];
    if (!entry) continue;
    form[level] = {
      name: entry.name,
      graduationYear: entry.graduation_year != null ? String(entry.graduation_year) : "",
      majors: (entry.majors ?? []).join(", "),
      minors: (entry.minors ?? []).join(", "),
    };
  }
  return form;
}

// Birthdays and dated-range endpoints allow "XXXX"/"XX" in place of a
// year/month/day that isn't known, so they're plain text fields rather than
// native date inputs (which can't represent that ambiguity).
const PARTIAL_DATE_RE = /^(\d{4}|XXXX)-(\d{2}|XX)-(\d{2}|XX)$/;

function isValidDateInput(value: string): boolean {
  return value.trim() === "" || PARTIAL_DATE_RE.test(value.trim());
}

// Strips everything but digits/X, uppercases, caps at 8 meaningful chars
// (YYYYMMDD), and re-inserts the dashes -- so typing "19900305" becomes
// "1990-03-05" as you go, the same way a phone number field auto-formats.
function autoDashDate(raw: string): string {
  const chars = raw.toUpperCase().replace(/[^0-9X]/g, "").slice(0, 8);
  const parts = [chars.slice(0, 4)];
  if (chars.length > 4) parts.push(chars.slice(4, 6));
  if (chars.length > 6) parts.push(chars.slice(6, 8));
  return parts.join("-");
}

interface DateTextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint: string;
}

// Shows a friendly, read-only-looking formatted date (e.g. "March 1990")
// until clicked, then swaps to the raw "YYYY-MM-DD" (XX/XXXX for unknown
// parts) for editing, reverting back to the friendly format on blur.
// Doesn't flag red while a date is still mid-typing -- only once all 8
// digits/X's are in and they don't form a valid date, or after blur.
function DateTextField({ label, value, onChange, hint }: DateTextFieldProps) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(value);

  const complete = draft.replace(/-/g, "").length === 8;
  const showError = focused ? complete && !isValidDateInput(draft) : value !== "" && !isValidDateInput(value);

  return (
    <TextField
      label={label}
      size="small"
      value={focused ? draft : formatDate(value) ?? ""}
      placeholder={focused ? "YYYY-MM-DD" : undefined}
      error={showError}
      helperText={showError ? "Expected YYYY-MM-DD, with XX/XXXX for unknown parts" : focused ? hint : undefined}
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

function phonesToRows(phones: Contact["phone_numbers"]): PhoneRow[] {
  return (phones ?? []).map((phone, index) => ({
    id: `init-phone-${index}`,
    label: phone.label ?? "",
    countryCode: phone.country_code,
    number: phone.number,
  }));
}

function emailsToRows(emails: Contact["email_addresses"]): EmailRow[] {
  return (emails ?? []).map((email, index) => ({
    id: `init-email-${index}`,
    label: email.label ?? "",
    address: email.address,
  }));
}

function addressesToRows(addresses: Contact["street_addresses"]): AddressRow[] {
  return (addresses ?? []).map((address, index) => ({
    id: `init-address-${index}`,
    label: address.label ?? "",
    street: (address.street ?? []).join("\n"),
    city: address.city ?? "",
    state: address.state ?? "",
    postalCode: address.postal_code ?? "",
    country: address.country ?? "",
  }));
}

function favoritesToRows(favorite: Contact["favorite"]): FavoriteRow[] {
  return Object.entries(favorite ?? {}).map(([key, value], index) => ({
    id: `init-favorite-${index}`,
    key,
    value: String(value),
  }));
}

// Manages an array of id-tagged rows (phone numbers, emails, addresses,
// favorites) with add/remove/update, so each repeatable section doesn't
// reimplement the same three operations. Starts from `initialRows` (e.g.
// prefilled from an existing contact when editing), falling back to one
// blank row so there's always something to fill in.
function useRowList<T extends IdRow>(initialRows: T[], makeRow: () => Omit<T, "id">) {
  const nextId = useRef(initialRows.length);
  const [rows, setRows] = useState<T[]>(() => (initialRows.length ? initialRows : [{ id: "r0", ...makeRow() } as T]));

  function add() {
    nextId.current += 1;
    setRows((prev) => [...prev, { id: `r${nextId.current}`, ...makeRow() } as T]);
  }

  // Stable identities (no deps) so row components below can be memoized:
  // typing in one row's fields only re-renders that row instead of the
  // whole form (and, for Education in particular, the hundreds of options
  // the school Autocompletes filter on every keystroke).
  const remove = useCallback((id: string) => {
    setRows((prev) => prev.filter((row) => row.id !== id));
  }, []);

  const update = useCallback((id: string, patch: Partial<T>) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }, []);

  return { rows, add, remove, update };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
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

function RowGrid({ children }: { children: ReactNode }) {
  return <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 1.5 }}>{children}</Box>;
}

function RemovableRow({ onRemove, children }: { onRemove: () => void; children: ReactNode }) {
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

const PhoneRowFields = memo(function PhoneRowFields({
  row,
  countryCodeOptions,
  onUpdate,
  onRemove,
}: {
  row: PhoneRow;
  countryCodeOptions: { code: number; label: string }[];
  onUpdate: (id: string, patch: Partial<PhoneRow>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <RemovableRow onRemove={() => onRemove(row.id)}>
      <TextField label="Label" value={row.label} onChange={(e) => onUpdate(row.id, { label: e.target.value })} size="small" />
      <TextField
        label="Country"
        select
        value={row.countryCode}
        onChange={(e) => onUpdate(row.id, { countryCode: Number(e.target.value) })}
        size="small"
      >
        {countryCodeOptions.map((option) => (
          <MenuItem key={option.code} value={option.code}>
            {option.label} (+{option.code})
          </MenuItem>
        ))}
      </TextField>
      <TextField label="Number" value={row.number} onChange={(e) => onUpdate(row.id, { number: e.target.value })} size="small" />
    </RemovableRow>
  );
});

const EmailRowFields = memo(function EmailRowFields({
  row,
  onUpdate,
  onRemove,
}: {
  row: EmailRow;
  onUpdate: (id: string, patch: Partial<EmailRow>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <RemovableRow onRemove={() => onRemove(row.id)}>
      <TextField label="Label" value={row.label} onChange={(e) => onUpdate(row.id, { label: e.target.value })} size="small" />
      <TextField
        label="Address"
        type="email"
        value={row.address}
        onChange={(e) => onUpdate(row.id, { address: e.target.value })}
        size="small"
        sx={{ gridColumn: "span 2" }}
      />
    </RemovableRow>
  );
});

const AddressRowFields = memo(function AddressRowFields({
  row,
  countryOptions,
  onUpdate,
  onRemove,
}: {
  row: AddressRow;
  countryOptions: string[];
  onUpdate: (id: string, patch: Partial<AddressRow>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <RemovableRow onRemove={() => onRemove(row.id)}>
      <TextField label="Label" value={row.label} onChange={(e) => onUpdate(row.id, { label: e.target.value })} size="small" />
      <TextField
        label="Street"
        value={row.street}
        onChange={(e) => onUpdate(row.id, { street: e.target.value })}
        size="small"
        multiline
        placeholder="One line per address line"
        sx={{ gridColumn: "span 2" }}
      />
      <TextField label="City" value={row.city} onChange={(e) => onUpdate(row.id, { city: e.target.value })} size="small" />
      <TextField label="State" value={row.state} onChange={(e) => onUpdate(row.id, { state: e.target.value })} size="small" />
      <TextField label="Postal Code" value={row.postalCode} onChange={(e) => onUpdate(row.id, { postalCode: e.target.value })} size="small" />
      <TextField
        label="Country"
        select
        value={row.country}
        onChange={(e) => onUpdate(row.id, { country: e.target.value })}
        size="small"
      >
        <MenuItem value="">—</MenuItem>
        {countryOptions.map((country) => (
          <MenuItem key={country} value={country}>
            {country}
          </MenuItem>
        ))}
      </TextField>
    </RemovableRow>
  );
});

const FavoriteRowFields = memo(function FavoriteRowFields({
  row,
  onUpdate,
  onRemove,
}: {
  row: FavoriteRow;
  onUpdate: (id: string, patch: Partial<FavoriteRow>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <RemovableRow onRemove={() => onRemove(row.id)}>
      <TextField label="Key" value={row.key} onChange={(e) => onUpdate(row.id, { key: e.target.value })} size="small" placeholder="e.g. color" />
      <TextField label="Value" value={row.value} onChange={(e) => onUpdate(row.id, { value: e.target.value })} size="small" />
    </RemovableRow>
  );
});

const EducationLevelFields = memo(function EducationLevelFields({
  level,
  row,
  schoolOptions,
  onUpdate,
}: {
  level: EducationLevel;
  row: EducationRowState;
  schoolOptions: string[];
  onUpdate: (level: EducationLevel, patch: Partial<EducationRowState>) => void;
}) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
        {EDUCATION_LABELS[level]}
      </Typography>
      <RowGrid>
        <Autocomplete
          freeSolo
          options={schoolOptions}
          value={row.name}
          onChange={(_event, newValue) => onUpdate(level, { name: newValue ?? "" })}
          onInputChange={(_event, newValue) => onUpdate(level, { name: newValue })}
          renderInput={(params) => <TextField {...params} label="School" size="small" />}
          sx={{ gridColumn: "span 2" }}
        />
        <TextField
          label="Graduation Year"
          type="number"
          value={row.graduationYear}
          onChange={(e) => onUpdate(level, { graduationYear: e.target.value })}
          size="small"
        />
        {level !== "high_school" && (
          <>
            <TextField
              label="Majors"
              value={row.majors}
              onChange={(e) => onUpdate(level, { majors: e.target.value })}
              size="small"
              placeholder="Comma-separated"
            />
            <TextField
              label="Minors"
              value={row.minors}
              onChange={(e) => onUpdate(level, { minors: e.target.value })}
              size="small"
              placeholder="Comma-separated"
            />
          </>
        )}
      </RowGrid>
    </Box>
  );
});

interface ContactFormProps {
  contact: Contact | null;
  // When set (and `contact` is null, i.e. creating a new contact), prefills
  // the form fields from this contact without copying its id or affecting
  // the create-vs-update decision below — used by the "Copy" action.
  prefillFrom?: Contact | null;
  allTags: TagCount[];
  onCancel: () => void;
  onSaved: (contact: Contact) => void;
}

export function ContactForm({ contact, prefillFrom, allTags, onCancel, onSaved }: ContactFormProps) {
  const source = contact ?? prefillFrom ?? null;
  const [options, setOptions] = useState<ContactFieldOptions | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchContactFieldOptions()
      .then((data) => {
        if (!cancelled) setOptions(data);
      })
      .catch(() => {
        if (!cancelled) setOptions({ countries: [], country_codes: [{ code: 1, label: "United States/Canada" }], high_schools: [], universities: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [name, setName] = useState({
    prefix: source?.name?.prefix ?? "",
    first_name: source?.name?.first_name ?? "",
    middle_name: source?.name?.middle_name ?? "",
    last_name: source?.name?.last_name ?? "",
    nickname: source?.name?.nickname ?? "",
    maiden_name: source?.name?.maiden_name ?? "",
    suffix: source?.name?.suffix ?? "",
    chinese_name: source?.name?.chinese_name ?? "",
  });
  const [birthday, setBirthday] = useState(source?.birthday ?? "");

  const phones = useRowList<PhoneRow>(phonesToRows(source?.phone_numbers), () => ({ label: "", countryCode: 1, number: "" }));
  const emails = useRowList<EmailRow>(emailsToRows(source?.email_addresses), () => ({ label: "", address: "" }));
  const addresses = useRowList<AddressRow>(addressesToRows(source?.street_addresses), () => ({
    label: "",
    street: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
  }));
  const favorites = useRowList<FavoriteRow>(favoritesToRows(source?.favorite), () => ({ key: "", value: "" }));

  const [education, setEducation] = useState(() => educationToForm(source?.education));
  const updateEducation = useCallback((level: EducationLevel, patch: Partial<EducationRowState>) => {
    setEducation((prev) => ({ ...prev, [level]: { ...prev[level], ...patch } }));
  }, []);

  const [facebookUsername, setFacebookUsername] = useState(source?.social_profiles?.facebook?.username ?? "");
  const [facebookUserId, setFacebookUserId] = useState(source?.social_profiles?.facebook?.user_id ?? "");
  const [gameCenterUsername, setGameCenterUsername] = useState(source?.social_profiles?.game_center?.username ?? "");
  const [gameCenterLink, setGameCenterLink] = useState(source?.social_profiles?.game_center?.link ?? "");
  const [instagramUsername, setInstagramUsername] = useState(source?.social_profiles?.instagram?.username ?? "");
  const [instagramFinstas, setInstagramFinstas] = useState(
    (source?.social_profiles?.instagram?.finsta_usernames ?? []).join(", ")
  );
  const [linkedinUsername, setLinkedinUsername] = useState(source?.social_profiles?.linkedin?.username ?? "");

  const [notes, setNotes] = useState(source?.notes ?? "");
  const [friendsFriend, setFriendsFriend] = useState(source?.friends_friend ?? "");
  const [datedStart, setDatedStart] = useState(source?.dated?.start ?? "");
  const [datedEnd, setDatedEnd] = useState(source?.dated?.end ?? "");
  const [tags, setTags] = useState<string[]>(source?.tags ?? []);

  function buildSnapshot() {
    return JSON.stringify({
      name,
      birthday,
      phones: phones.rows,
      emails: emails.rows,
      addresses: addresses.rows,
      favorites: favorites.rows,
      education,
      facebookUsername,
      facebookUserId,
      gameCenterUsername,
      gameCenterLink,
      instagramUsername,
      instagramFinstas,
      linkedinUsername,
      notes,
      friendsFriend,
      datedStart,
      datedEnd,
      tags,
    });
  }

  const initialSnapshotRef = useRef<string | null>(null);
  if (initialSnapshotRef.current === null) {
    initialSnapshotRef.current = buildSnapshot();
  }
  const isDirty = buildSnapshot() !== initialSnapshotRef.current;
  const hasInvalidDates = !isValidDateInput(birthday) || !isValidDateInput(datedStart) || !isValidDateInput(datedEnd);

  function buildPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {};

    const nameFields = Object.fromEntries(
      Object.entries(name).filter(([, value]) => value.trim() !== "").map(([key, value]) => [key, value.trim()])
    );
    payload.name = nameFields;

    if (birthday.trim()) payload.birthday = birthday.trim();

    const phoneNumbers = phones.rows
      .filter((row) => row.number.trim() !== "")
      .map((row) => ({
        number: row.number.trim(),
        country_code: row.countryCode,
        ...(row.label.trim() ? { label: row.label.trim() } : {}),
      }));
    if (phoneNumbers.length) payload.phone_numbers = phoneNumbers;

    const emailAddresses = emails.rows
      .filter((row) => row.address.trim() !== "")
      .map((row) => ({ address: row.address.trim(), label: row.label.trim() || "Email" }));
    if (emailAddresses.length) payload.email_addresses = emailAddresses;

    const streetAddresses = addresses.rows
      .filter((row) => [row.street, row.city, row.state, row.postalCode, row.country].some((v) => v.trim() !== ""))
      .map((row) => ({
        label: row.label.trim() || "Home",
        ...(row.street.trim()
          ? { street: row.street.split("\n").map((line) => line.trim()).filter(Boolean) }
          : {}),
        ...(row.city.trim() ? { city: row.city.trim() } : {}),
        ...(row.state.trim() ? { state: row.state.trim() } : {}),
        ...(row.postalCode.trim() ? { postal_code: row.postalCode.trim() } : {}),
        ...(row.country ? { country: row.country } : {}),
      }));
    if (streetAddresses.length) payload.street_addresses = streetAddresses;

    const educationPayload: Record<string, unknown> = {};
    for (const level of Object.keys(education) as EducationLevel[]) {
      const row = education[level];
      if (!row.name) continue;
      educationPayload[level] = {
        name: row.name,
        ...(row.graduationYear.trim() ? { graduation_year: Number(row.graduationYear) } : {}),
        ...(level !== "high_school" && row.majors.trim()
          ? { majors: row.majors.split(",").map((v) => v.trim()).filter(Boolean) }
          : {}),
        ...(level !== "high_school" && row.minors.trim()
          ? { minors: row.minors.split(",").map((v) => v.trim()).filter(Boolean) }
          : {}),
      };
    }
    if (Object.keys(educationPayload).length) payload.education = educationPayload;

    const socialProfiles: Record<string, unknown> = {};
    if (facebookUsername.trim() || facebookUserId.trim()) {
      socialProfiles.facebook = {
        ...(facebookUsername.trim() ? { username: facebookUsername.trim() } : {}),
        ...(facebookUserId.trim() ? { user_id: facebookUserId.trim() } : {}),
      };
    }
    if (gameCenterUsername.trim() && gameCenterLink.trim()) {
      socialProfiles.game_center = { username: gameCenterUsername.trim(), link: gameCenterLink.trim() };
    }
    if (instagramUsername.trim()) {
      socialProfiles.instagram = {
        username: instagramUsername.trim(),
        ...(instagramFinstas.trim()
          ? { finsta_usernames: instagramFinstas.split(",").map((v) => v.trim()).filter(Boolean) }
          : {}),
      };
    }
    if (linkedinUsername.trim()) {
      socialProfiles.linkedin = { username: linkedinUsername.trim() };
    }
    if (Object.keys(socialProfiles).length) payload.social_profiles = socialProfiles;

    if (notes.trim()) payload.notes = notes.trim();
    if (friendsFriend.trim()) payload.friends_friend = friendsFriend.trim();
    if (datedStart.trim() || datedEnd.trim()) {
      payload.dated = { start: datedStart.trim() || null, end: datedEnd.trim() || null };
    }

    const favorite = Object.fromEntries(
      favorites.rows
        .filter((row) => row.key.trim() !== "")
        .map((row) => [row.key.trim(), row.value.trim()])
    );
    if (Object.keys(favorite).length) payload.favorite = favorite;

    if (tags.length) payload.tags = tags;

    return payload;
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (isDirty && !isSubmitting && !hasInvalidDates) handleSubmit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        if (!isSubmitting) onCancel();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  });

  async function handleSubmit() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const payload = buildPayload();
      const saved = contact ? await updateContact(contact.id, payload) : await createContact(payload);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${contact ? "save" : "create"} contact`);
      setIsSubmitting(false);
    }
  }

  const countryCodeOptions = options?.country_codes ?? [{ code: 1, label: "United States/Canada" }];
  const countryOptions = options?.countries ?? [];
  const tagOptions = useMemo(() => allTags.map(({ tag }) => tag), [allTags]);

  return (
    <Box id="contact-form">
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 2,
          pt: 4,
          mb: 4,
          backgroundColor: "background.paper",
        }}
      >
        <Typography variant="h5">{contact ? "Edit Contact" : "New Contact"}</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSubmit} disabled={isSubmitting || !isDirty || hasInvalidDates}>
            {isSubmitting ? "Saving…" : "Save"}
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Section title="Name">
        <RowGrid>
          <TextField label="Prefix" value={name.prefix} onChange={(e) => setName({ ...name, prefix: e.target.value })} size="small" />
          <TextField label="First Name" value={name.first_name} onChange={(e) => setName({ ...name, first_name: e.target.value })} size="small" autoFocus />
          <TextField label="Middle Name" value={name.middle_name} onChange={(e) => setName({ ...name, middle_name: e.target.value })} size="small" />
          <TextField label="Last Name" value={name.last_name} onChange={(e) => setName({ ...name, last_name: e.target.value })} size="small" />
          <TextField label="Nickname" value={name.nickname} onChange={(e) => setName({ ...name, nickname: e.target.value })} size="small" />
          <TextField label="Maiden Name" value={name.maiden_name} onChange={(e) => setName({ ...name, maiden_name: e.target.value })} size="small" />
          <TextField label="Suffix" value={name.suffix} onChange={(e) => setName({ ...name, suffix: e.target.value })} size="small" />
          <TextField label="Chinese Name" value={name.chinese_name} onChange={(e) => setName({ ...name, chinese_name: e.target.value })} size="small" />
        </RowGrid>
      </Section>

      <Divider sx={{ my: 2 }} />

      <Section title="Tags">
        <Autocomplete
          multiple
          freeSolo
          options={tagOptions}
          value={tags}
          onChange={(_event, newValue) => setTags(Array.from(new Set(newValue.map((v) => v.trim()).filter(Boolean))))}
          renderInput={(params) => <TextField {...params} size="small" placeholder="Type a tag and press Enter…" />}
        />
      </Section>

      <Divider sx={{ my: 2 }} />

      <Section title="Birthday">
        <DateTextField
          label="Birthday"
          value={birthday}
          onChange={setBirthday}
          hint="Use XX for an unknown month/day, or XXXX for an unknown year"
        />
      </Section>

      <Divider sx={{ my: 2 }} />

      <Section title="Phone Numbers">
        {phones.rows.map((row) => (
          <PhoneRowFields key={row.id} row={row} countryCodeOptions={countryCodeOptions} onUpdate={phones.update} onRemove={phones.remove} />
        ))}
        <Button size="small" startIcon={<AddIcon />} onClick={phones.add}>
          Add phone number
        </Button>
      </Section>

      <Divider sx={{ my: 2 }} />

      <Section title="Email Addresses">
        {emails.rows.map((row) => (
          <EmailRowFields key={row.id} row={row} onUpdate={emails.update} onRemove={emails.remove} />
        ))}
        <Button size="small" startIcon={<AddIcon />} onClick={emails.add}>
          Add email address
        </Button>
      </Section>

      <Divider sx={{ my: 2 }} />

      <Section title="Addresses">
        {addresses.rows.map((row) => (
          <AddressRowFields key={row.id} row={row} countryOptions={countryOptions} onUpdate={addresses.update} onRemove={addresses.remove} />
        ))}
        <Button size="small" startIcon={<AddIcon />} onClick={addresses.add}>
          Add address
        </Button>
      </Section>

      <Divider sx={{ my: 2 }} />

      <Section title="Education">
        {(Object.keys(EDUCATION_LABELS) as EducationLevel[]).map((level) => {
          const schoolOptions = level === "high_school" ? options?.high_schools ?? [] : options?.universities ?? [];
          return (
            <EducationLevelFields
              key={level}
              level={level}
              row={education[level]}
              schoolOptions={schoolOptions}
              onUpdate={updateEducation}
            />
          );
        })}
      </Section>

      <Divider sx={{ my: 2 }} />

      <Section title="Social Profiles">
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
          Facebook
        </Typography>
        <RowGrid>
          <TextField label="Username" value={facebookUsername} onChange={(e) => setFacebookUsername(e.target.value)} size="small" />
          <TextField label="User ID" value={facebookUserId} onChange={(e) => setFacebookUserId(e.target.value)} size="small" />
        </RowGrid>

        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5, mt: 2 }}>
          Game Center
        </Typography>
        <RowGrid>
          <TextField label="Username" value={gameCenterUsername} onChange={(e) => setGameCenterUsername(e.target.value)} size="small" />
          <TextField label="Link" value={gameCenterLink} onChange={(e) => setGameCenterLink(e.target.value)} size="small" />
        </RowGrid>

        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5, mt: 2 }}>
          Instagram
        </Typography>
        <RowGrid>
          <TextField label="Username" value={instagramUsername} onChange={(e) => setInstagramUsername(e.target.value)} size="small" />
          <TextField
            label="Finsta Usernames"
            value={instagramFinstas}
            onChange={(e) => setInstagramFinstas(e.target.value)}
            size="small"
            placeholder="Comma-separated"
          />
        </RowGrid>

        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5, mt: 2 }}>
          LinkedIn
        </Typography>
        <RowGrid>
          <TextField label="Username" value={linkedinUsername} onChange={(e) => setLinkedinUsername(e.target.value)} size="small" />
        </RowGrid>
      </Section>

      <Divider sx={{ my: 2 }} />

      <Section title="Other">
        <RowGrid>
          <TextField
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            size="small"
            multiline
            sx={{ gridColumn: "span 2" }}
          />
          <TextField label="Friend's Friend" value={friendsFriend} onChange={(e) => setFriendsFriend(e.target.value)} size="small" />
          <DateTextField label="Dated From" value={datedStart} onChange={setDatedStart} hint="XX/XXXX for unknown parts" />
          <DateTextField label="Dated To" value={datedEnd} onChange={setDatedEnd} hint="XX/XXXX for unknown parts" />
        </RowGrid>

        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5, mt: 2 }}>
          Favorites
        </Typography>
        {favorites.rows.map((row) => (
          <FavoriteRowFields key={row.id} row={row} onUpdate={favorites.update} onRemove={favorites.remove} />
        ))}
        <Button size="small" startIcon={<AddIcon />} onClick={favorites.add}>
          Add favorite
        </Button>
      </Section>
    </Box>
  );
}
