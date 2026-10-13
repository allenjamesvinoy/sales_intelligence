export type Priority = 'high' | 'medium' | 'low';
export type FitLevel = 'high' | 'medium' | 'unknown';
export type Stage = 'recommended' | 'focus' | 'done' | 'dismissed';
export type Outcome = 'Connected' | 'No response' | 'Follow-up needed' | 'Qualified' | 'Not relevant';

export type InteractionMode = 'call' | 'email' | 'meeting' | 'text';
/** The shared sales journey. Customer needs order history, so it is shown as a future state. */
export type AccountStage = 'discovered' | 'researching' | 'contacted' | 'opportunity' | 'customer';

export const OUTCOMES: readonly Outcome[] = ['Connected', 'No response', 'Follow-up needed', 'Qualified', 'Not relevant'];
export const MODES: readonly InteractionMode[] = ['call', 'email', 'meeting', 'text'];
export const ACCOUNT_STAGES: readonly AccountStage[] = ['discovered', 'researching', 'contacted', 'opportunity', 'customer'];

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
  account: Account;
  overview: Overview;
  evidence: EvidenceItem[];
  productFit: ProductFit[];
  contact: Contact;
  opener?: string;
  questions: string[];
}

/** Every account always has a stage, owner, next action and due date. */
export interface Account {
  stage: AccountStage;
  owner: { id: number; name: string };
  nextAction: string;
  /** yyyy-mm-dd */
  dueDate: string;
  opportunityNote: string | null;
}

export interface Interaction {
  id: number;
  /** ISO timestamp */
  at: string;
  user: string;
  /** "update" entries record stage changes. */
  mode: InteractionMode | 'update';
  outcome: string;
  note: string;
  /** The next step set when this interaction was logged. */
  nextAction?: string | null;
  dueDate?: string | null;
  /** Who the rep spoke with or met. */
  people: { id: number; name: string; role: string | null }[];
}

/** Someone at the contractor, shared by the team. */
export interface Person {
  id: number;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  /** "Company website", "Web research" or "Added by rep" */
  source: string;
}

export type PersonInput = Pick<Person, 'name'> & Partial<Pick<Person, 'role' | 'phone' | 'email'>>;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** GET /accounts/:id */
export interface AccountDetail {
  account: Account;
  contacts: Person[];
  interactions: Interaction[];
}

export interface InteractionInput {
  mode: InteractionMode;
  outcome: Outcome;
  note: string;
  contactIds: number[];
  /** Blank means "use the suggested next step". */
  nextAction?: string;
  dueDate?: string;
}

/** The rep's own board position for a lead. */
export interface LeadState {
  stage: Stage;
  /** Manual position within its column; falls back to the queue rank. */
  order?: number | null;
}

/** GET /leads */
export interface LeadsResponse {
  /** ISO timestamp of the last data refresh, shown as the freshness stamp. */
  updatedAt: string;
  leads: Lead[];
  /** Board stage and order per lead id. Omitted by the sample data, which keeps state in the browser. */
  states?: Record<string, LeadState>;
}

export type FocusLevel = 'primary' | 'secondary' | 'not_assigned';

/** GET /me */
export interface Profile {
  /** Background re-import after a territory change: "running", "done", "failed: …", or null. */
  refresh: string | null;
  profile: { name: string; email: string; role: string; team: number | null; manager: string | null; branch: string; timezone: string };
  territory: { segment: string; postalCode: string; radiusMiles: number } | null;
  products: { name: string; focus: FocusLevel }[];
  queue: { dailyLimit: number; readyBy: string; lastRefresh: string | null } | null;
  summary: string | null;
}
