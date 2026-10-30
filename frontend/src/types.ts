export interface Name {
  prefix?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  nickname?: string;
  maiden_name?: string;
  deadname?: string;
  suffix?: string;
  chinese_name?: string;
}

export interface PhoneNumber {
  label?: string;
  country_code: number;
  number: string;
}

export interface EmailAddress {
  label?: string;
  address: string;
}

export interface StreetAddress {
  label?: string;
  street?: string[];
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

export interface EducationEntry {
  name: string;
  graduation_year?: number;
  majors?: string[];
  minors?: string[];
}

export type EducationLevel = "high_school" | "bachelor" | "master" | "law" | "medical" | "phd";

export type Education = Partial<Record<EducationLevel, EducationEntry>>;

export interface FacebookProfile {
  username?: string;
  user_id?: string;
}

export interface GameCenterProfile {
  username: string;
  link?: string;
}

export interface InstagramProfile {
  username: string;
  finsta_usernames?: string[];
}

export interface LinkedInProfile {
  username: string;
}

export interface SocialProfiles {
  facebook?: FacebookProfile;
  game_center?: GameCenterProfile;
  instagram?: InstagramProfile;
  linkedin?: LinkedInProfile;
}

export interface DateRange {
  start?: string;
  end?: string;
}

export interface Contact {
  id: number;
  name?: Name;
  tags?: string[];
  birthday?: string;
  phone_numbers?: PhoneNumber[];
  email_addresses?: EmailAddress[];
  street_addresses?: StreetAddress[];
  education?: Education;
  social_profiles?: SocialProfiles;
  notes?: string;
  friends_friend?: string;
  dated?: DateRange;
  favorite?: Record<string, unknown>;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface CountryCodeOption {
  code: number;
  label: string;
}

export interface ContactFieldOptions {
  countries: string[];
  country_codes: CountryCodeOption[];
  high_schools: string[];
  universities: string[];
}

export interface ContactsResponse {
  contacts: Contact[];
}

export interface TagsResponse {
  tags: TagCount[];
}

export interface BatchAddTagsResponse {
  contacts: Contact[];
  tags: TagCount[];
}

export type SyncVerificationKind = "code" | "device_and_code";

export interface SyncComplete {
  status: "complete";
  created: number;
  updated: number;
}

export interface SyncRequiresVerification {
  status: "requires_verification";
  verification_kind: SyncVerificationKind;
  devices: string[];
}

// A contact fresh from iCloud, not yet created on disk, so it has no `id` yet.
export type UnsavedContact = Omit<Contact, "id"> & { id?: number };

export interface SyncReviewCreatedItem {
  icloud_id: string;
  contact: UnsavedContact;
}

export interface SyncReviewUpdatedItem {
  icloud_id: string;
  before: Contact;
  after: Contact;
}

export interface SyncReview {
  status: "review";
  created: SyncReviewCreatedItem[];
  updated: SyncReviewUpdatedItem[];
}

export type SyncResult = SyncComplete | SyncRequiresVerification | SyncReview;
