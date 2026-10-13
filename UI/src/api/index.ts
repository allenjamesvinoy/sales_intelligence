/**
 * The only place the UI talks to the backend. Views and the store import
 * `api` from here and never call fetch themselves.
 *
 * Set VITE_API_URL (see .env.example) to use the real backend; leave it
 * unset to run on the built-in sample data.
 */
import type { ActivityEntry, LeadsResponse, Stage } from '../types';
import { httpApi } from './http';
import { mockApi } from './mock';

export interface Api {
  /** GET /leads */
  getLeads(): Promise<LeadsResponse>;
  /** PUT /leads/:id/stage */
  updateStage(id: string, stage: Stage): Promise<void>;
  /** POST /leads/:id/activity */
  recordActivity(id: string, entry: ActivityEntry): Promise<void>;
}

const baseUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '');

export const api: Api = baseUrl ? httpApi(baseUrl) : mockApi;
