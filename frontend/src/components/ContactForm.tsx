import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ContactFieldOptions, Contact, Education, EducationLevel, TagCount } from "../types";
import { createContact, updateContact, fetchContactFieldOptions, ApiError } from "../api";
import { EDUCATION_LABELS } from "../format";
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
    bachelor: { ...EMPTY_EDUCATION_ROW },
    high_school: { ...EMPTY_EDUCATION_ROW },
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

// A plain "YYYY-MM-DD" is all a native date input can render -- birthdays and
// dated-range endpoints with "XXXX"/"XX" unknown-part placeholders fall back
// to blank rather than showing something the input would reject.
function toDateInputValue(dateStr: string | undefined): string {
  return dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : "";
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

  function remove(id: string) {
    setRows((prev) => prev.filter((row) => row.id !== id));
  }

  function update(id: string, patch: Partial<T>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

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
    suffix: source?.name?.suffix ?? "",
    chinese_name: source?.name?.chinese_name ?? "",
  });
  const [birthday, setBirthday] = useState(() => toDateInputValue(source?.birthday));

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
  function updateEducation(level: EducationLevel, patch: Partial<EducationRowState>) {
    setEducation((prev) => ({ ...prev, [level]: { ...prev[level], ...patch } }));
  }

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
  const [datedStart, setDatedStart] = useState(() => toDateInputValue(source?.dated?.start));
  const [datedEnd, setDatedEnd] = useState(() => toDateInputValue(source?.dated?.end));
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

  function buildPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {};

    const nameFields = Object.fromEntries(
      Object.entries(name).filter(([, value]) => value.trim() !== "").map(([key, value]) => [key, value.trim()])
    );
    payload.name = nameFields;

    if (birthday) payload.birthday = birthday;

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
    if (datedStart || datedEnd) {
      payload.dated = { start: datedStart || null, end: datedEnd || null };
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

  return (
    <Box id="contact-form">
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 4 }}>
        <Typography variant="h5">{contact ? "Edit Contact" : "New Contact"}</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSubmit} disabled={isSubmitting || !isDirty}>
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
          <TextField label="Suffix" value={name.suffix} onChange={(e) => setName({ ...name, suffix: e.target.value })} size="small" />
          <TextField label="Chinese Name" value={name.chinese_name} onChange={(e) => setName({ ...name, chinese_name: e.target.value })} size="small" />
        </RowGrid>
      </Section>

      <Divider sx={{ my: 2 }} />

      <Section title="Tags">
        <Autocomplete
          multiple
          freeSolo
          options={allTags.map(({ tag }) => tag)}
          value={tags}
          onChange={(_event, newValue) => setTags(Array.from(new Set(newValue.map((v) => v.trim()).filter(Boolean))))}
          renderInput={(params) => <TextField {...params} size="small" placeholder="Type a tag and press Enter…" />}
        />
      </Section>

      <Divider sx={{ my: 2 }} />

      <Section title="Birthday">
        <TextField
          label="Birthday"
          type="date"
          value={birthday}
          onChange={(e) => setBirthday(e.target.value)}
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Section>

      <Divider sx={{ my: 2 }} />

      <Section title="Phone Numbers">
        {phones.rows.map((row) => (
          <RemovableRow key={row.id} onRemove={() => phones.remove(row.id)}>
            <TextField label="Label" value={row.label} onChange={(e) => phones.update(row.id, { label: e.target.value })} size="small" />
            <TextField
              label="Country"
              select
              value={row.countryCode}
              onChange={(e) => phones.update(row.id, { countryCode: Number(e.target.value) })}
              size="small"
            >
              {countryCodeOptions.map((option) => (
                <MenuItem key={option.code} value={option.code}>
                  {option.label} (+{option.code})
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Number" value={row.number} onChange={(e) => phones.update(row.id, { number: e.target.value })} size="small" />
          </RemovableRow>
        ))}
        <Button size="small" startIcon={<AddIcon />} onClick={phones.add}>
          Add phone number
        </Button>
      </Section>

      <Divider sx={{ my: 2 }} />

      <Section title="Email Addresses">
        {emails.rows.map((row) => (
          <RemovableRow key={row.id} onRemove={() => emails.remove(row.id)}>
            <TextField label="Label" value={row.label} onChange={(e) => emails.update(row.id, { label: e.target.value })} size="small" />
            <TextField
              label="Address"
              type="email"
              value={row.address}
              onChange={(e) => emails.update(row.id, { address: e.target.value })}
              size="small"
              sx={{ gridColumn: "span 2" }}
            />
          </RemovableRow>
        ))}
        <Button size="small" startIcon={<AddIcon />} onClick={emails.add}>
          Add email address
        </Button>
      </Section>

      <Divider sx={{ my: 2 }} />

      <Section title="Addresses">
        {addresses.rows.map((row) => (
          <RemovableRow key={row.id} onRemove={() => addresses.remove(row.id)}>
            <TextField label="Label" value={row.label} onChange={(e) => addresses.update(row.id, { label: e.target.value })} size="small" />
            <TextField
              label="Street"
              value={row.street}
              onChange={(e) => addresses.update(row.id, { street: e.target.value })}
              size="small"
              multiline
              placeholder="One line per address line"
              sx={{ gridColumn: "span 2" }}
            />
            <TextField label="City" value={row.city} onChange={(e) => addresses.update(row.id, { city: e.target.value })} size="small" />
            <TextField label="State" value={row.state} onChange={(e) => addresses.update(row.id, { state: e.target.value })} size="small" />
            <TextField label="Postal Code" value={row.postalCode} onChange={(e) => addresses.update(row.id, { postalCode: e.target.value })} size="small" />
            <TextField
              label="Country"
              select
              value={row.country}
              onChange={(e) => addresses.update(row.id, { country: e.target.value })}
              size="small"
            >
              <MenuItem value="">—</MenuItem>
              {(options?.countries ?? []).map((country) => (
                <MenuItem key={country} value={country}>
                  {country}
                </MenuItem>
              ))}
            </TextField>
          </RemovableRow>
        ))}
        <Button size="small" startIcon={<AddIcon />} onClick={addresses.add}>
          Add address
        </Button>
      </Section>

      <Divider sx={{ my: 2 }} />

      <Section title="Education">
        {(Object.keys(EDUCATION_LABELS) as EducationLevel[]).map((level) => {
          const row = education[level];
          const schoolOptions = level === "high_school" ? options?.high_schools ?? [] : options?.universities ?? [];
          return (
            <Box key={level} sx={{ mb: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                {EDUCATION_LABELS[level]}
              </Typography>
              <RowGrid>
                <TextField
                  label="School"
                  select
                  value={row.name}
                  onChange={(e) => updateEducation(level, { name: e.target.value })}
                  size="small"
                  sx={{ gridColumn: "span 2" }}
                >
                  <MenuItem value="">—</MenuItem>
                  {schoolOptions.map((school) => (
                    <MenuItem key={school} value={school}>
                      {school}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Graduation Year"
                  type="number"
                  value={row.graduationYear}
                  onChange={(e) => updateEducation(level, { graduationYear: e.target.value })}
                  size="small"
                />
                {level !== "high_school" && (
                  <>
                    <TextField
                      label="Majors"
                      value={row.majors}
                      onChange={(e) => updateEducation(level, { majors: e.target.value })}
                      size="small"
                      placeholder="Comma-separated"
                    />
                    <TextField
                      label="Minors"
                      value={row.minors}
                      onChange={(e) => updateEducation(level, { minors: e.target.value })}
                      size="small"
                      placeholder="Comma-separated"
                    />
                  </>
                )}
              </RowGrid>
            </Box>
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
          <TextField
            label="Dated From"
            type="date"
            value={datedStart}
            onChange={(e) => setDatedStart(e.target.value)}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Dated To"
            type="date"
            value={datedEnd}
            onChange={(e) => setDatedEnd(e.target.value)}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </RowGrid>

        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5, mt: 2 }}>
          Favorites
        </Typography>
        {favorites.rows.map((row) => (
          <RemovableRow key={row.id} onRemove={() => favorites.remove(row.id)}>
            <TextField label="Key" value={row.key} onChange={(e) => favorites.update(row.id, { key: e.target.value })} size="small" placeholder="e.g. color" />
            <TextField label="Value" value={row.value} onChange={(e) => favorites.update(row.id, { value: e.target.value })} size="small" />
          </RemovableRow>
        ))}
        <Button size="small" startIcon={<AddIcon />} onClick={favorites.add}>
          Add favorite
        </Button>
      </Section>
    </Box>
  );
}
