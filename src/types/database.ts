// This file contains type definitions for database records and candidate profiles.

export interface Profile {
  id: string;
  display_name: string | null;
  target_role: string | null;
  location: string | null;
  skills: string[];
  experience_level: string | null;
  education_summary: string | null;
  experience_summary: string | null;
  created_at: string;
  updated_at: string;
}

export type ProfileUpdate = Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>;
