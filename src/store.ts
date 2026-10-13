import type { ActivityEntry, LeadState, Stage } from './types';

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

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getLeadState(id: string): LeadState {
  return state[id] ?? { stage: 'recommended', activity: [] };
}

export function setStage(id: string, stage: Stage): void {
  state = { ...state, [id]: { ...getLeadState(id), stage } };
  persist();
}

export function restoreDismissed(): void {
  const next = { ...state };
  for (const [id, s] of Object.entries(next)) {
    if (s.stage === 'dismissed') next[id] = { ...s, stage: 'recommended' };
  }
  state = next;
  persist();
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
}

/** Returns Done leads whose follow-up date has arrived to My Focus. */
export function applyDueFollowUps(today: string): void {
  let changed = false;
  const next = { ...state };
  for (const [id, s] of Object.entries(next)) {
    if (s.stage === 'done' && s.followUp && s.followUp <= today) {
      next[id] = { ...s, stage: 'focus', followUp: undefined };
      changed = true;
    }
  }
  if (changed) {
    state = next;
    persist();
  }
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
