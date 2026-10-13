import { api } from './api';
import type { ActivityEntry, LeadState, Stage } from './types';

/**
 * Lead stage and activity. Changes apply locally at once (and are cached in
 * localStorage), then go to the backend through `api`. With the sample data
 * the api calls do nothing and localStorage is the only copy.
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

function sync(request: Promise<void>): void {
  request.catch((err: unknown) => console.error('[InstaHermes] Could not save to the backend', err));
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
  return state[id] ?? { stage: 'recommended', activity: [] };
}

export function setStage(id: string, stage: Stage): void {
  const prev = getLeadState(id);
  // A lead pulled out of Done by hand no longer needs its scheduled return.
  const followUp = stage === 'done' ? prev.followUp : undefined;
  state = { ...state, [id]: { ...prev, stage, followUp } };
  persist();
  sync(api.updateStage(id, stage));
}

export function restoreDismissed(): void {
  const ids = Object.keys(state).filter((id) => state[id].stage === 'dismissed');
  const next = { ...state };
  for (const id of ids) next[id] = { ...next[id], stage: 'recommended' };
  state = next;
  persist();
  ids.forEach((id) => sync(api.updateStage(id, 'recommended')));
}

/** Saving an outcome moves the lead to Done; a follow-up date brings it back later. */
export function recordOutcome(id: string, entry: ActivityEntry): void {
  const prev = getLeadState(id);
  state = {
    ...state,
    [id]: {
      stage: 'done',
      activity: [entry, ...prev.activity],
      followUp: entry.followUp,
    },
  };
  persist();
  sync(api.recordActivity(id, entry));
}

/** Returns Done leads whose follow-up date has arrived to My Focus. */
export function applyDueFollowUps(today: string): void {
  const due = Object.keys(state).filter((id) => {
    const s = state[id];
    return s.stage === 'done' && s.followUp && s.followUp <= today;
  });
  if (due.length === 0) return;
  const next = { ...state };
  for (const id of due) next[id] = { ...next[id], stage: 'focus', followUp: undefined };
  state = next;
  persist();
  due.forEach((id) => sync(api.updateStage(id, 'focus')));
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
