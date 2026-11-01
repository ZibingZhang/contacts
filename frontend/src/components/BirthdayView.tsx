import { useEffect, useMemo, useState } from "react";
import type { Contact } from "../types";
import { buildDisplayName, initials } from "../format";
import { isTypingTarget } from "../hooks";
import {
  monthGrid,
  monthDayKey,
  parseBirthday,
  upcomingBirthdays,
  describeDaysUntil,
  type CalendarCell,
} from "../birthdays";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

const NAV_WIDTH = 280;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface BirthdayViewProps {
  contacts: Contact[];
  onSelectContact: (id: number) => void;
}

interface ContactsByMonthDay {
  [key: string]: Contact[];
}

function groupByMonthDay(contacts: Contact[]): ContactsByMonthDay {
  const map: ContactsByMonthDay = {};
  for (const contact of contacts) {
    const birthday = parseBirthday(contact.birthday);
    if (!birthday) continue;
    const key = monthDayKey(birthday.month, birthday.day);
    (map[key] ??= []).push(contact);
  }
  return map;
}

function BirthdayEntry({ contact, onSelect }: { contact: Contact; onSelect: (id: number) => void }) {
  const displayName = buildDisplayName(contact.name, { includeNickname: false }) || `Contact ${contact.id}`;
  return (
    <Box
      component="button"
      data-contact-id={contact.id}
      onClick={() => onSelect(contact.id)}
      sx={{
        display: "block",
        width: "100%",
        textAlign: "left",
        border: "none",
        bgcolor: "transparent",
        cursor: "pointer",
        px: 0.5,
        py: 0.25,
        borderRadius: 0.5,
        fontSize: "0.72rem",
        lineHeight: 1.3,
        color: "text.primary",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        "&:hover": { bgcolor: "action.hover" },
      }}
      title={displayName}
    >
      {displayName}
    </Box>
  );
}

function CalendarDayCell({
  cell,
  contacts,
  onSelectContact,
}: {
  cell: CalendarCell;
  contacts: Contact[];
  onSelectContact: (id: number) => void;
}) {
  return (
    <Box
      sx={{
        minHeight: 96,
        display: "flex",
        flexDirection: "column",
        borderRight: 1,
        borderBottom: 1,
        borderColor: "divider",
        opacity: cell.isCurrentMonth ? 1 : 0.4,
        overflow: "hidden",
      }}
    >
      <Box sx={{ px: 0.75, pt: 0.5, display: "flex", justifyContent: "flex-end" }}>
        <Typography
          variant="caption"
          sx={{
            width: 20,
            height: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
            fontWeight: cell.isToday ? 700 : 400,
            bgcolor: cell.isToday ? "primary.main" : "transparent",
            color: cell.isToday ? "primary.contrastText" : "text.secondary",
          }}
        >
          {cell.date.getDate()}
        </Typography>
      </Box>
      <Box sx={{ flexGrow: 1, overflow: "auto", px: 0.5, pb: 0.5 }}>
        {contacts.map((contact) => (
          <BirthdayEntry contact={contact} onSelect={onSelectContact} key={contact.id} />
        ))}
      </Box>
    </Box>
  );
}

function BirthdaysNav({
  contacts,
  onSelectContact,
}: {
  contacts: Contact[];
  onSelectContact: (id: number) => void;
}) {
  const upcoming = useMemo(() => upcomingBirthdays(contacts), [contacts]);

  return (
    <Box
      component="nav"
      id="birthdays-nav"
      sx={{
        width: NAV_WIDTH,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderRight: 1,
        borderColor: "divider",
        overflow: "auto",
      }}
    >
      <Box sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: "divider" }}>
        <Typography variant="subtitle2">Upcoming Birthdays</Typography>
      </Box>
      {upcoming.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ px: 1.5, py: 1 }}>
          No birthdays on file.
        </Typography>
      ) : (
        <Box sx={{ flexGrow: 1, overflow: "auto" }}>
          {upcoming.map(({ contact, date, daysUntil, age }) => {
            const displayName = buildDisplayName(contact.name, { includeNickname: false }) || `Contact ${contact.id}`;
            return (
              <Box
                component="button"
                key={contact.id}
                data-contact-id={contact.id}
                onClick={() => onSelectContact(contact.id)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  bgcolor: "transparent",
                  cursor: "pointer",
                  px: 1.5,
                  py: 0.75,
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <Avatar sx={{ width: 32, height: 32, fontSize: "0.8rem" }}>{initials(contact.name)}</Avatar>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="body2" noWrap>
                    {displayName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    {age !== null ? ` · turns ${age}` : ""}
                  </Typography>
                </Box>
                <Typography
                  variant="caption"
                  color={daysUntil === 0 ? "primary" : "text.secondary"}
                  sx={{ whiteSpace: "nowrap", fontWeight: daysUntil === 0 ? 700 : 400 }}
                >
                  {describeDaysUntil(daysUntil)}
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

export function BirthdayView({ contacts, onSelectContact }: BirthdayViewProps) {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const contactsByMonthDay = useMemo(() => groupByMonthDay(contacts), [contacts]);
  const cells = useMemo(
    () => monthGrid(cursor.getFullYear(), cursor.getMonth(), today),
    [cursor, today]
  );

  function goToMonth(delta: number) {
    setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  function goToToday() {
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
  }

  // N/P page through months, mirroring the contact list's keyboard nav.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        goToMonth(1);
      } else if (event.key === "p" || event.key === "P") {
        event.preventDefault();
        goToMonth(-1);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <Box sx={{ display: "flex", flexGrow: 1, overflow: "hidden" }}>
      <BirthdaysNav contacts={contacts} onSelectContact={onSelectContact} />

      <Box id="birthday-calendar" sx={{ flexGrow: 1, overflow: "auto", px: 3, pb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, pt: 3, pb: 2 }}>
          <Typography variant="h5" sx={{ flexGrow: 1 }}>
            {MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}
          </Typography>
          <Button size="small" variant="outlined" onClick={goToToday}>
            Today
          </Button>
          <Tooltip title="Previous month (P)">
            <IconButton size="small" aria-label="Previous month" onClick={() => goToMonth(-1)}>
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Next month (N)">
            <IconButton size="small" aria-label="Next month" onClick={() => goToMonth(1)}>
              <ChevronRightIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {WEEKDAY_LABELS.map((label) => (
              <Box
                key={label}
                sx={{
                  px: 0.75,
                  py: 0.5,
                  borderRight: 1,
                  borderBottom: 1,
                  borderColor: "divider",
                  bgcolor: "action.hover",
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  {label}
                </Typography>
              </Box>
            ))}
          </Box>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {cells.map((cell) => {
              const key = monthDayKey(cell.date.getMonth() + 1, cell.date.getDate());
              return (
                <CalendarDayCell
                  cell={cell}
                  contacts={contactsByMonthDay[key] ?? []}
                  onSelectContact={onSelectContact}
                  key={cell.date.toISOString()}
                />
              );
            })}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
