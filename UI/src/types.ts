export type Priority = 'high' | 'medium' | 'low';
export type FitLevel = 'high' | 'medium' | 'unknown';
export type ContactAvailability = 'verified' | 'company' | 'none';
export type Stage = 'recommended' | 'focus' | 'done' | 'dismissed';
export type Outcome = 'Connected' | 'No response' | 'Follow-up needed' | 'Qualified' | 'Not relevant';

export const OUTCOMES: readonly Outcome[] = ['Connected', 'No response', 'Follow-up needed', 'Qualified', 'Not relevant'];

export interface ContactPerson {
  name: string;
  role: string;
  verified?: boolean;
  source?: string;
}

export interface Contact {
  person?: ContactPerson;
  /** Role to ask for when no person is known. */
  askFor?: string;
  phone?: string;
  email?: string;
  website?: string;
}

export interface EvidenceItem {
  fact: string;
  source: string;
  url?: string;
  date?: string;
}

export interface ProductFit {
  category: string;
  level: FitLevel;
  reason: string;
  question: string;
}

/** Missing fields are left undefined; the detail page shows them as a data gap. */
export interface Overview {
  businessType?: string;
  address?: string;
  services?: string[];
  rating?: number;
  reviewCount?: number;
  yearsInBusiness?: number;
  certifications?: string[];
}

export interface Lead {
  id: string;
  rank: number;
  name: string;
  location: string;
  distanceMi: number | null;
  priority: Priority;
  /** One sentence: why this contractor is worth a call. */
  reason: string;
  /** Up to three, shown on the card. */
  categories: string[];
  nextAction: string;
  overview: Overview;
  evidence: EvidenceItem[];
  productFit: ProductFit[];
  contact: Contact;
  opener?: string;
  questions: string[];
}

export interface ActivityEntry {
  outcome: Outcome;
  note: string;
  followUp?: string;
  /** ISO timestamp the outcome was saved. */
  at: string;
}

export interface LeadState {
  stage: Stage;
  activity: ActivityEntry[];
  /** ISO date (yyyy-mm-dd) the lead returns to My Focus. */
  followUp?: string;
}

/** GET /leads */
export interface LeadsResponse {
  /** ISO timestamp of the last data refresh, shown as the freshness stamp. */
  updatedAt: string;
  leads: Lead[];
  /** Saved stage and activity per lead id. Omitted by the sample data, which keeps state in the browser. */
  states?: Record<string, LeadState>;
}
