import type { Contact } from "./types";

export interface ParsedBirthday {
  month: number; // 1-12
  day: number; // 1-31
  year: number | null;
}

// Parses the backend's "YYYY-MM-DD" birthday format. A calendar placement
// needs at least a month and day, so an unknown month or day (the "XX"
// placeholder) makes the birthday unplaceable and this returns null; an
// unknown year is fine, since plenty of birthdays are recorded without one.
export function parseBirthday(birthday: string | undefined): ParsedBirthday | null {
  if (!birthday) {
    return null;
  }
  const [yearStr, monthStr, dayStr] = birthday.split("-");
  const month = monthStr === "XX" ? null : parseInt(monthStr, 10);
  const day = dayStr === "XX" ? null : parseInt(dayStr, 10);
  if (month === null || day === null || Number.isNaN(month) || Number.isNaN(day)) {
    return null;
  }
  const year = yearStr === "XXXX" ? null : parseInt(yearStr, 10);
  return { month, day, year: year !== null && !Number.isNaN(year) ? year : null };
}

export function monthDayKey(month: number, day: number): string {
  return `${month}-${day}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// How many days from `from` until this birthday's next occurrence (0 if it
// falls on `from` itself), along with the age they'll turn that day.
export function nextOccurrence(
  birthday: ParsedBirthday,
  from: Date
): { date: Date; daysUntil: number; age: number | null } {
  const today = startOfDay(from);
  let next = new Date(today.getFullYear(), birthday.month - 1, birthday.day);
  if (next < today) {
    next = new Date(today.getFullYear() + 1, birthday.month - 1, birthday.day);
  }
  const daysUntil = Math.round((next.getTime() - today.getTime()) / 86_400_000);
  const age = birthday.year !== null ? next.getFullYear() - birthday.year : null;
  return { date: next, daysUntil, age };
}

export interface UpcomingBirthday {
  contact: Contact;
  birthday: ParsedBirthday;
  date: Date;
  daysUntil: number;
  age: number | null;
}

// All contacts with a placeable birthday, sorted by how soon the next
// occurrence of their birthday falls (today first, wrapping into next year).
export function upcomingBirthdays(contacts: Contact[], from: Date = new Date()): UpcomingBirthday[] {
  const upcoming: UpcomingBirthday[] = [];
  for (const contact of contacts) {
    const birthday = parseBirthday(contact.birthday);
    if (!birthday) continue;
    const { date, daysUntil, age } = nextOccurrence(birthday, from);
    upcoming.push({ contact, birthday, date, daysUntil, age });
  }
  return upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
}

export function describeDaysUntil(daysUntil: number): string {
  if (daysUntil === 0) return "Today";
  if (daysUntil === 1) return "Tomorrow";
  return `In ${daysUntil} days`;
}

export interface CalendarCell {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
}

// A fixed 6-week (42 day) grid covering `month` (0-indexed) of `year`, so
// the calendar's height never shifts as the user pages between months.
export function monthGrid(year: number, month: number, today: Date = new Date()): CalendarCell[] {
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - firstOfMonth.getDay());
  const todayStart = startOfDay(today);
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    cells.push({
      date,
      isCurrentMonth: date.getMonth() === month,
      isToday: date.getTime() === todayStart.getTime(),
    });
  }
  return cells;
}
