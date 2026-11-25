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

// This interface defines the schema for a job offer record.
export interface JobOffer {
  id: string;
  user_id: string;
  title: string;
  company: string;
  location: string | null;
  url: string | null;
  description: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type JobOfferInput = {
  title: string;
  company: string;
  location?: string | null;
  url?: string | null;
  description?: string | null;
  notes?: string | null;
};

// This union type represents the possible progress statuses for an application.
export type ApplicationStatus = 'Saved' | 'Applied' | 'Interview' | 'Offer' | 'Rejected';

// This interface records a status transition event in application history.
export interface StatusHistoryItem {
  status: ApplicationStatus;
  changed_at: string;
}

// This interface defines the schema for a job application record.
export interface Application {
  id: string;
  user_id: string;
  offer_id: string;
  status: ApplicationStatus;
  applied_at: string;
  notes: string | null;
  status_history: StatusHistoryItem[];
  created_at: string;
  updated_at: string;
  offer?: Pick<JobOffer, 'id' | 'title' | 'company' | 'location'>;
}

export type ApplicationInput = {
  offer_id: string;
  status?: ApplicationStatus;
  notes?: string | null;
  applied_at?: string;
};
