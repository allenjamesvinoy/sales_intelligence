import { api } from './api';
import type { LeadState, Stage } from './types';

/**
 * The rep's board: each lead's column and order. Changes apply locally at once
 * (and are cached in localStorage), then go to the backend through `api`.
 */

const STATE_KEY = 'leads.state.v1';
const THEME_KEY = 'leads.theme';

type Listener = () => void;

let state: Record<string, LeadState> = readJson(STATE_KEY) ?? {};
const listeners = new Set<Listener>();

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function persist(): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable (private mode, quota): keep working in memory.
  }
  listeners.forEach((fn) => fn());
}

/** Saves to the backend, then signals that server-derived data (account stage, next action) may have changed. */
export function sync(request: Promise<void>): Promise<void> {
  return request
    .then(() => void window.dispatchEvent(new Event('leads:changed')))
    .catch((err: unknown) => console.error('[InstaHermes.AI] Could not save to the backend', err));
}

/** Replaces local state with what the backend returned. */
export function hydrate(states: Record<string, LeadState>): void {
  state = states;
  persist();
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getLeadState(id: string): LeadState {
  return state[id] ?? { stage: 'recommended' };
}

export function setStage(id: string, stage: Stage, order?: number): void {
  state = { ...state, [id]: { stage, order } };
  persist();
  sync(api.updateStage(id, stage, order));
}

export function restoreDismissed(): void {
  const ids = Object.keys(state).filter((id) => state[id].stage === 'dismissed');
  const next = { ...state };
  for (const id of ids) next[id] = { ...next[id], stage: 'recommended' };
  state = next;
  persist();
  ids.forEach((id) => sync(api.updateStage(id, 'recommended')));
}

export type Theme = 'light' | 'dark';

export function getTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Not remembered, but still applied for this visit.
  }
}
