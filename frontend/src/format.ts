import type { Name, PhoneNumber, StreetAddress, EducationEntry, EducationLevel } from "./types";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const EDUCATION_LABELS: Record<EducationLevel, string> = {
  bachelor: "Bachelor's",
  high_school: "High School",
  master: "Master's",
  law: "Law",
  medical: "Medical",
  phd: "PhD",
};

export function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function buildDisplayName(name: Name | undefined): string {
  if (!name) {
    return "";
  }

  const parts: string[] = [];
  if (name.prefix) parts.push(name.prefix);
  if (name.first_name) parts.push(name.first_name);
  if (name.nickname) parts.push(`"${name.nickname}"`);
  if (name.middle_name) parts.push(name.middle_name);
  if (name.last_name) parts.push(name.last_name);

  let displayName = parts.join(" ");
  if (name.suffix) {
    displayName = displayName ? `${displayName}, ${name.suffix}` : name.suffix;
  }
  return displayName;
}

export function initials(name: Name | undefined): string {
  const first = name?.first_name ? name.first_name[0] : "";
  const last = name?.last_name ? name.last_name[0] : "";
  return (first + last).toUpperCase() || "?";
}

// Parses the backend's "YYYY-MM-DD" date format, where any of the three
// parts may be "X"-placeholders (e.g. "XXXX-06-21") to mean "unknown".
export function formatDate(dateStr: string | undefined): string | null {
  if (!dateStr) {
    return null;
  }

  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = yearStr === "XXXX" ? null : parseInt(yearStr, 10);
  const month = monthStr === "XX" ? null : parseInt(monthStr, 10);
  const day = dayStr === "XX" ? null : parseInt(dayStr, 10);

  const monthName = month ? MONTH_NAMES[month - 1] : null;

  if (monthName && day && year) return `${monthName} ${day}, ${year}`;
  if (monthName && day) return `${monthName} ${day}`;
  if (monthName && year) return `${monthName} ${year}`;
  if (year) return `${year}`;
  if (monthName) return monthName;
  return null;
}

const NANP_COUNTRY_CODE = 1;

// NANP (US/Canada/etc.) numbers get the familiar "+1 (XXX) XXX-XXXX" look;
// everything else just gets a space after the country code, since we don't
// know each country's local formatting conventions.
export function formatPhoneNumber(phone: PhoneNumber): string {
  const { country_code: countryCode, number } = phone;
  if (countryCode === NANP_COUNTRY_CODE && /^\d{10}$/.test(number)) {
    const areaCode = number.slice(0, 3);
    const exchange = number.slice(3, 6);
    const line = number.slice(6);
    return `+${countryCode} (${areaCode}) ${exchange}-${line}`;
  }
  return `+${countryCode} ${number}`;
}

export function formatAddress(address: StreetAddress): string {
  const lines: string[] = [];
  if (address.street && address.street.length) {
    lines.push(address.street.join(", "));
  }
  const cityStateZip = [address.city, address.state, address.postal_code]
    .filter(Boolean)
    .join(", ");
  if (cityStateZip) {
    lines.push(cityStateZip);
  }
  if (address.country) {
    lines.push(address.country);
  }
  return lines.join(" · ");
}

export function formatEducationEntry(entry: EducationEntry): string {
  const parts = [entry.name];
  if (entry.graduation_year) {
    parts.push(`(${entry.graduation_year})`);
  }
  let value = parts.join(" ");
  if (entry.majors && entry.majors.length) {
    value += ` — ${entry.majors.join(", ")}`;
  }
  if (entry.minors && entry.minors.length) {
    value += ` (minor: ${entry.minors.join(", ")})`;
  }
  return value;
}
