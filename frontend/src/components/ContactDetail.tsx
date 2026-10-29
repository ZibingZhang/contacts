import { useEffect } from "react";
import type { Contact } from "../types";
import { isTypingTarget } from "../hooks";
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
import Box from "@mui/material/Box";
import Avatar from "@mui/material/Avatar";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";

function NameHeader({
  contact,
  onEdit,
  onCopy,
}: {
  contact: Contact;
  onEdit: () => void;
  onCopy: () => void;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 4 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 3 }}>
        <Avatar sx={{ width: 64, height: 64, fontSize: "1.25rem", fontWeight: 600 }}>
          {initials(contact.name)}
        </Avatar>
        <Box>
          <Typography variant="h5" sx={{ mb: 0.5 }}>
            {buildDisplayName(contact.name) || `Contact ${contact.id}`}
          </Typography>
          {contact.name?.chinese_name && (
            <Typography color="text.secondary">{contact.name.chinese_name}</Typography>
          )}
          {contact.tags && contact.tags.length > 0 && (
            <Box sx={{ mt: 1, display: "flex", gap: 0.5, flexWrap: "wrap" }}>
              {contact.tags.map((tag) => (
                <Chip label={tag} size="small" key={tag} />
              ))}
            </Box>
          )}
        </Box>
      </Box>
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button id="copy-contact-button" variant="outlined" size="small" onClick={onCopy}>
          Copy
        </Button>
        <Button id="edit-contact-button" variant="outlined" size="small" onClick={onEdit}>
          Edit
        </Button>
      </Box>
    </Box>
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

export function ContactDetail({
  contact,
  onEdit,
  onCopy,
}: {
  contact: Contact;
  onEdit: () => void;
  onCopy: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      if (event.key === "e" || event.key === "E") {
        event.preventDefault();
        onEdit();
      } else if (event.key === "c" || event.key === "C") {
        event.preventDefault();
        onCopy();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onEdit, onCopy]);

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
  if (contact.social_profiles?.linkedin) {
    const { linkedin } = contact.social_profiles;
    socialRows.push(
      fieldRow(
        "LinkedIn",
        <ExternalLink href={`https://www.linkedin.com/in/${linkedin.username}`}>{linkedin.username}</ExternalLink>
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
      <NameHeader contact={contact} onEdit={onEdit} onCopy={onCopy} />

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
