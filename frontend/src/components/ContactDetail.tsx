import type { Contact } from "../types";
import {
  buildDisplayName,
  initials,
  formatDate,
  formatPhoneNumber,
  formatAddress,
  formatEducationEntry,
  capitalize,
  EDUCATION_LABELS,
} from "../format";
import { DetailSection, fieldRow } from "./DetailSection";

function NameHeader({ contact }: { contact: Contact }) {
  return (
    <div className="d-flex align-items-center gap-3 mb-4">
      <div className="detail-avatar-placeholder">{initials(contact.name)}</div>
      <div>
        <h3 className="mb-1">{buildDisplayName(contact.name) || `Contact ${contact.id}`}</h3>
        {contact.name?.chinese_name && <div className="text-secondary">{contact.name.chinese_name}</div>}
        {contact.tags && contact.tags.length > 0 && (
          <div className="mt-2">
            {contact.tags.map((tag) => (
              <span className="badge text-bg-secondary me-1" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

function InstagramValue({ username, finstaUsernames }: { username: string; finstaUsernames?: string[] }) {
  return (
    <span>
      <ExternalLink href={`https://www.instagram.com/${username}`}>{username}</ExternalLink>
      {finstaUsernames && finstaUsernames.length > 0 && (
        <>
          {" (finsta: "}
          {finstaUsernames.map((name, index) => (
            <span key={name}>
              {index > 0 && ", "}
              <ExternalLink href={`https://www.instagram.com/${name}`}>{name}</ExternalLink>
            </span>
          ))}
          {")"}
        </>
      )}
    </span>
  );
}

export function ContactDetail({ contact }: { contact: Contact }) {
  const birthday = formatDate(contact.birthday);

  const socialRows = [];
  if (contact.social_profiles?.facebook) {
    const { facebook } = contact.social_profiles;
    socialRows.push(fieldRow("Facebook", facebook.username || facebook.user_id || ""));
  }
  if (contact.social_profiles?.game_center) {
    socialRows.push(fieldRow("Game Center", contact.social_profiles.game_center.username));
  }
  if (contact.social_profiles?.instagram) {
    const { instagram } = contact.social_profiles;
    socialRows.push(
      fieldRow(
        "Instagram",
        <InstagramValue username={instagram.username} finstaUsernames={instagram.finsta_usernames} />
      )
    );
  }

  const miscRows = [];
  if (contact.notes) {
    miscRows.push(fieldRow("Notes", contact.notes));
  }
  if (contact.friends_friend) {
    miscRows.push(fieldRow("Friend's Friend", contact.friends_friend));
  }
  if (contact.dated) {
    const start = formatDate(contact.dated.start);
    const end = formatDate(contact.dated.end);
    miscRows.push(fieldRow("Dated", [start, end].filter(Boolean).join(" – ") || "Unknown"));
  }
  if (contact.favorite) {
    for (const [key, value] of Object.entries(contact.favorite)) {
      miscRows.push(fieldRow(`Favorite ${capitalize(key)}`, String(value)));
    }
  }

  return (
    <>
      <NameHeader contact={contact} />

      {birthday && <DetailSection title="Birthday" rows={[fieldRow("Birthday", birthday)]} />}

      {contact.phone_numbers && contact.phone_numbers.length > 0 && (
        <DetailSection
          title="Phone Numbers"
          rows={contact.phone_numbers.map((phone, index) =>
            fieldRow(phone.label || "Phone", formatPhoneNumber(phone), `${phone.label ?? "phone"}-${index}`)
          )}
        />
      )}

      {contact.email_addresses && contact.email_addresses.length > 0 && (
        <DetailSection
          title="Email Addresses"
          rows={contact.email_addresses.map((email, index) =>
            fieldRow(
              email.label || "Email",
              <a href={`mailto:${email.address}`}>{email.address}</a>,
              `${email.label ?? "email"}-${index}`
            )
          )}
        />
      )}

      {contact.street_addresses && contact.street_addresses.length > 0 && (
        <DetailSection
          title="Addresses"
          rows={contact.street_addresses.map((address, index) =>
            fieldRow(
              address.label || "Address",
              formatAddress(address),
              `${address.label ?? "address"}-${index}`
            )
          )}
        />
      )}

      {contact.education && (
        <DetailSection
          title="Education"
          rows={(Object.keys(EDUCATION_LABELS) as (keyof typeof EDUCATION_LABELS)[])
            .filter((level) => contact.education?.[level])
            .map((level) => fieldRow(EDUCATION_LABELS[level], formatEducationEntry(contact.education![level]!)))}
        />
      )}

      {contact.social_profiles && <DetailSection title="Social Profiles" rows={socialRows} />}

      <DetailSection title="Other" rows={miscRows} />
    </>
  );
}
