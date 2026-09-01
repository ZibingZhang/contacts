const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const EDUCATION_LABELS = {
  bachelor: "Bachelor's",
  high_school: "High School",
  master: "Master's",
  law: "Law",
  medical: "Medical",
  phd: "PhD",
};

function slugify(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function buildDisplayName(name) {
  if (!name) {
    return "";
  }

  const parts = [];
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

function initials(name) {
  const first = name && name.first_name ? name.first_name[0] : "";
  const last = name && name.last_name ? name.last_name[0] : "";
  return (first + last).toUpperCase() || "?";
}

// Parses the backend's "YYYY-MM-DD" date format, where any of the three
// parts may be "X"-placeholders (e.g. "XXXX-06-21") to mean "unknown".
export function formatDate(dateStr) {
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

export function fieldRow(label, value) {
  const row = document.createElement("div");
  row.className = "field-row";
  row.dataset.field = slugify(label);

  const labelEl = document.createElement("div");
  labelEl.className = "field-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("div");
  valueEl.className = "field-value";
  if (value instanceof Node) {
    valueEl.appendChild(value);
  } else {
    valueEl.textContent = value;
  }

  row.append(labelEl, valueEl);
  return row;
}

export function section(title, rows) {
  if (!rows || rows.length === 0) {
    return null;
  }

  const sectionEl = document.createElement("section");
  sectionEl.className = "detail-section";

  const heading = document.createElement("h6");
  heading.className = "text-uppercase text-secondary fw-bold small mb-2";
  heading.textContent = title;
  sectionEl.appendChild(heading);

  for (const row of rows) {
    sectionEl.appendChild(row);
  }
  return sectionEl;
}

export function renderNameHeader(contact) {
  const wrapper = document.createElement("div");
  wrapper.className = "d-flex align-items-center gap-3 mb-4";

  const placeholder = document.createElement("div");
  placeholder.className = "detail-avatar-placeholder";
  placeholder.textContent = initials(contact.name);
  wrapper.appendChild(placeholder);

  const textWrap = document.createElement("div");

  const heading = document.createElement("h3");
  heading.className = "mb-1";
  heading.textContent = buildDisplayName(contact.name) || `Contact ${contact.id}`;
  textWrap.appendChild(heading);

  if (contact.name && contact.name.chinese_name) {
    const chineseName = document.createElement("div");
    chineseName.className = "text-secondary";
    chineseName.textContent = contact.name.chinese_name;
    textWrap.appendChild(chineseName);
  }

  if (contact.tags && contact.tags.length) {
    const tagsWrap = document.createElement("div");
    tagsWrap.className = "mt-2";
    for (const tag of contact.tags) {
      const badge = document.createElement("span");
      badge.className = "badge text-bg-secondary me-1";
      badge.textContent = tag;
      tagsWrap.appendChild(badge);
    }
    textWrap.appendChild(tagsWrap);
  }

  wrapper.appendChild(textWrap);
  return wrapper;
}

export function renderBirthdaySection(contact) {
  if (!contact.birthday) {
    return null;
  }
  const formatted = formatDate(contact.birthday);
  if (!formatted) {
    return null;
  }
  return section("Birthday", [fieldRow("Birthday", formatted)]);
}

export function renderPhoneSection(contact) {
  if (!contact.phone_numbers || !contact.phone_numbers.length) {
    return null;
  }
  const rows = contact.phone_numbers.map((phone) =>
    fieldRow(phone.label || "Phone", `+${phone.country_code}${phone.number}`)
  );
  return section("Phone Numbers", rows);
}

export function renderEmailSection(contact) {
  if (!contact.email_addresses || !contact.email_addresses.length) {
    return null;
  }
  const rows = contact.email_addresses.map((email) =>
    fieldRow(email.label || "Email", email.address)
  );
  return section("Email Addresses", rows);
}

function formatAddress(address) {
  const lines = [];
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

export function renderAddressSection(contact) {
  if (!contact.street_addresses || !contact.street_addresses.length) {
    return null;
  }
  const rows = contact.street_addresses.map((address) =>
    fieldRow(address.label || "Address", formatAddress(address))
  );
  return section("Addresses", rows);
}

function formatEducationEntry(entry) {
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

export function renderEducationSection(contact) {
  if (!contact.education) {
    return null;
  }
  const rows = [];
  for (const [key, label] of Object.entries(EDUCATION_LABELS)) {
    const entry = contact.education[key];
    if (entry) {
      rows.push(fieldRow(label, formatEducationEntry(entry)));
    }
  }
  return section("Education", rows);
}

export function renderSocialSection(contact) {
  if (!contact.social_profiles) {
    return null;
  }
  const rows = [];
  const { facebook, game_center: gameCenter, instagram } = contact.social_profiles;

  if (facebook) {
    rows.push(fieldRow("Facebook", facebook.username || facebook.user_id || ""));
  }
  if (gameCenter) {
    rows.push(fieldRow("Game Center", gameCenter.username));
  }
  if (instagram) {
    let value = instagram.username;
    if (instagram.finsta_usernames && instagram.finsta_usernames.length) {
      value += ` (finsta: ${instagram.finsta_usernames.join(", ")})`;
    }
    rows.push(fieldRow("Instagram", value));
  }

  return section("Social Profiles", rows);
}

export function renderMiscSection(contact) {
  const rows = [];

  if (contact.notes) {
    rows.push(fieldRow("Notes", contact.notes));
  }
  if (contact.friends_friend) {
    rows.push(fieldRow("Friend's Friend", contact.friends_friend));
  }
  if (contact.dated) {
    const start = formatDate(contact.dated.start);
    const end = formatDate(contact.dated.end);
    const value = [start, end].filter(Boolean).join(" – ") || "Unknown";
    rows.push(fieldRow("Dated", value));
  }
  if (contact.favorite) {
    for (const [key, value] of Object.entries(contact.favorite)) {
      rows.push(fieldRow(`Favorite ${capitalize(key)}`, String(value)));
    }
  }

  return section("Other", rows);
}

export function renderContactDetail(contact) {
  const fragment = document.createDocumentFragment();
  fragment.appendChild(renderNameHeader(contact));

  const sections = [
    renderBirthdaySection(contact),
    renderPhoneSection(contact),
    renderEmailSection(contact),
    renderAddressSection(contact),
    renderEducationSection(contact),
    renderSocialSection(contact),
    renderMiscSection(contact),
  ].filter(Boolean);

  for (const sectionEl of sections) {
    fragment.appendChild(sectionEl);
  }
  return fragment;
}

export function renderContactListItem(contact) {
  const item = document.createElement("a");
  item.href = "#";
  item.className = "list-group-item list-group-item-action";
  item.dataset.contactId = String(contact.id);

  const name = document.createElement("div");
  name.textContent = buildDisplayName(contact.name) || `Contact ${contact.id}`;
  item.appendChild(name);

  if (contact.tags && contact.tags.length) {
    const tagsWrap = document.createElement("div");
    for (const tag of contact.tags.slice(0, 4)) {
      const badge = document.createElement("span");
      badge.className = "badge text-bg-light border me-1";
      badge.textContent = tag;
      tagsWrap.appendChild(badge);
    }
    item.appendChild(tagsWrap);
  }

  return item;
}

export function renderContactList(contacts) {
  const fragment = document.createDocumentFragment();
  for (const contact of contacts) {
    fragment.appendChild(renderContactListItem(contact));
  }
  return fragment;
}

export function renderEmptyState() {
  const div = document.createElement("div");
  div.className = "text-secondary";
  div.textContent = "Select a contact to see their details.";
  return div;
}

export function renderLoading() {
  const div = document.createElement("div");
  div.className = "text-secondary small p-2";
  div.textContent = "Loading…";
  return div;
}

export function renderErrorBanner(message) {
  const div = document.createElement("div");
  div.className = "alert alert-danger";
  div.setAttribute("role", "alert");
  div.textContent = message;
  return div;
}
