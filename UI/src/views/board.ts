import { BoardColumn, Button, EmptyState, Freshness, LeadCard, LoadingCards, contactAvailability } from '../components';
import { h } from '../dom';
import { makeDraggable } from '../drag';
import { formatDay, formatStamp, isStale } from '../format';
import { getLeadState, restoreDismissed, setStage } from '../store';
import type { Lead, Stage } from '../types';

type Column = Exclude<Stage, 'dismissed'>;

const COLUMNS: { id: Column; title: string; empty: string }[] = [
  { id: 'recommended', title: 'Recommended', empty: 'All caught up' },
  { id: 'focus', title: 'My Focus', empty: 'Drag leads here' },
  { id: 'done', title: 'Done', empty: 'Nothing done yet' },
];

/** One line a day to start the rep off. */
const MOTIVATION = [
  'Today is your day.',
  'Every call is a chance to win.',
  'Your next big account is on this board.',
  'Momentum starts with the first call.',
  'Show up. Follow up. Close.',
  'You are one conversation away from your next deal.',
  'Make today count.',
];

function motivation(now = new Date()): string {
  const day = Math.floor((now.getTime() - now.getTimezoneOffset() * 60_000) / 86_400_000);
  return MOTIVATION[day % MOTIVATION.length];
}

let currentTab: Column = 'recommended';

export function renderBoard(leads: Lead[] | null, updatedAt?: string): HTMLElement {
  const byStage: Record<Stage, Lead[]> = { recommended: [], focus: [], done: [], dismissed: [] };
  for (const lead of leads ?? []) byStage[getLeadState(lead.id).stage].push(lead);
  byStage.recommended.sort((a, b) => a.rank - b.rank);

  const tabs = h(
    'div',
    { className: 'board-tabs', role: 'tablist', 'aria-label': 'Board columns' },
    COLUMNS.map((col) =>
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          className: 'board-tab',
          'data-drop': col.id,
          'aria-controls': `col-${col.id}`,
          'aria-selected': String(col.id === currentTab),
          onClick: () => {
            currentTab = col.id;
            window.dispatchEvent(new Event('app:render'));
          },
        },
        col.title,
        leads && h('span', { className: 'lb-data' }, String(byStage[col.id].length)),
      ),
    ),
  );

  const dismissed = byStage.dismissed.length;
  const columns = COLUMNS.map((col) => {
    const items = byStage[col.id];
    let body: HTMLElement | HTMLElement[];
    if (!leads) body = LoadingCards(col.id === 'recommended' ? 3 : 1);
    else if (items.length === 0) body = EmptyState({ title: col.empty });
    else body = items.map((lead) => card(lead, col.id));

    return BoardColumn(
      { id: col.id, title: col.title, count: items.length, active: col.id === 'focus', current: col.id === currentTab },
      body,
      col.id === 'recommended' &&
        dismissed > 0 &&
        h('div', { className: 'col-foot' }, Button({ size: 'sm', variant: 'quiet', onClick: restoreDismissed }, `Restore ${dismissed} hidden`)),
    );
  });

  return h(
    'div',
    null,
    h(
      'div',
      { className: 'page-head' },
      h('h1', { className: 'page-title motto', tabindex: '-1' }, motivation()),
      updatedAt && Freshness(formatStamp(updatedAt), isStale(updatedAt)),
    ),
    h('p', { className: 'sr-only', id: 'board-help' }, 'Drag a card to another column, or press Alt with the left or right arrow key.'),
    tabs,
    h('div', { className: 'lb-board' }, columns),
  );
}

function card(lead: Lead, stage: Column): HTMLElement {
  const state = getLeadState(lead.id);
  const el = LeadCard({
    id: lead.id,
    name: lead.name,
    location: lead.location,
    distanceMi: lead.distanceMi,
    priority: lead.priority,
    reason: lead.reason,
    categories: lead.categories,
    contact: contactAvailability(lead.contact),
    stage,
    outcome: state.activity[0]?.outcome,
    followUp: state.followUp ? formatDay(state.followUp) : undefined,
    href: `#/lead/${lead.id}`,
  });

  makeDraggable(el, stage, (to) => moveTo(lead.id, to as Column, false));

  const link = el.querySelector('a');
  link?.setAttribute('aria-describedby', 'board-help');
  link?.setAttribute('aria-keyshortcuts', 'Alt+ArrowLeft Alt+ArrowRight');
  el.addEventListener('keydown', (e) => {
    if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    const i = COLUMNS.findIndex((c) => c.id === stage) + (e.key === 'ArrowRight' ? 1 : -1);
    if (i < 0 || i >= COLUMNS.length) return;
    e.preventDefault();
    moveTo(lead.id, COLUMNS[i].id, true);
  });
  return el;
}

function moveTo(id: string, to: Column, keepFocus: boolean): void {
  // On narrow screens, follow the card to the tab it landed in.
  currentTab = to;
  setStage(id, to); // re-renders the board synchronously
  if (keepFocus) document.querySelector<HTMLElement>(`[data-lead="${id}"] a`)?.focus();
}
