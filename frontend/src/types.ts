export interface Name {
  prefix?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  nickname?: string;
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

export type EducationLevel = "bachelor" | "high_school" | "master" | "law" | "medical" | "phd";

export type Education = Partial<Record<EducationLevel, EducationEntry>>;

export interface FacebookProfile {
  username?: string;
  user_id?: string;
}

export interface GameCenterProfile {
  username: string;
}

export interface InstagramProfile {
  username: string;
  finsta_usernames?: string[];
}

export interface SocialProfiles {
  facebook?: FacebookProfile;
  game_center?: GameCenterProfile;
  instagram?: InstagramProfile;
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
