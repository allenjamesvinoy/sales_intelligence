/**
 * The only place the UI talks to the backend. Views and the store import
 * `api` from here and never call fetch themselves.
 *
 * Set VITE_API_URL (see .env.example) to use the real backend; leave it
 * unset to run on the built-in sample data.
 */
import type { AccountDetail, InteractionInput, LeadsResponse, Profile, Stage } from '../types';
import { httpApi } from './http';
import { mockApi } from './mock';

export interface Api {
  /** GET /leads */
  getLeads(): Promise<LeadsResponse>;
  /** PUT /leads/:id/stage */
  updateStage(id: string, stage: Stage, order?: number): Promise<void>;
  /** GET /accounts/:id */
  getAccount(id: string): Promise<AccountDetail>;
  /** POST /accounts/:id/interactions */
  logInteraction(id: string, input: InteractionInput): Promise<void>;
  /** POST /accounts/:id/opportunity */
  convertToOpportunity(id: string, note: string): Promise<void>;
  /** PUT /accounts/:id/next-action */
  updateNextAction(id: string, nextAction: string, dueDate: string): Promise<void>;
  /** GET /me */
  getProfile(): Promise<Profile>;
  /** PUT /me/territory, then the backend re-imports and re-ranks in the background */
  updateTerritory(postalCode: string, radiusMiles: number): Promise<void>;
}

const baseUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '');

export const api: Api = baseUrl ? httpApi(baseUrl) : mockApi;
