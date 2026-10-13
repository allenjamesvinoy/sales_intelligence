import { BoardColumn, Button, EmptyState, Freshness, LeadCard, LoadingCards } from '../components';
import { h } from '../dom';
import { makeDraggable } from '../drag';
import { formatStamp, isStale } from '../format';
import { getLeadState, restoreDismissed, setStage } from '../store';
import type { Lead, Stage } from '../types';

type Column = Exclude<Stage, 'dismissed'>;

const REORDERABLE: Column[] = ['recommended', 'focus'];

/** Leads must be worked in My Focus before they can be completed; only Recommended and My Focus can be reordered. */
function canMove(from: Column, to: Column): boolean {
  if (from === to) return REORDERABLE.includes(to);
  return !(from === 'recommended' && to === 'done');
}

const sortKey = (lead: Lead) => getLeadState(lead.id).order ?? lead.rank;

const COLUMNS: { id: Column; title: string; empty: string }[] = [
  { id: 'recommended', title: 'Recommended', empty: 'All caught up' },
  { id: 'focus', title: 'My Focus', empty: 'Drag leads here' },
  { id: 'done', title: 'Congrats!', empty: 'Your wins land here' },
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
let columnLeads: Record<Column, Lead[]> = { recommended: [], focus: [], done: [] };

export function renderBoard(leads: Lead[] | null, updatedAt?: string): HTMLElement {
  const byStage: Record<Stage, Lead[]> = { recommended: [], focus: [], done: [], dismissed: [] };
  for (const lead of leads ?? []) byStage[getLeadState(lead.id).stage].push(lead);
  for (const col of REORDERABLE) byStage[col].sort((a, b) => sortKey(a) - sortKey(b));
  columnLeads = byStage;

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
    h('p', { className: 'sr-only', id: 'board-help' }, 'Drag a card to move or reorder it, or press Alt with an arrow key.'),
    tabs,
    h('div', { className: 'lb-board' }, columns),
  );
}

function card(lead: Lead, stage: Column): HTMLElement {
  const el = LeadCard({
    id: lead.id,
    name: lead.name,
    location: lead.location,
    distanceMi: lead.distanceMi,
    priority: lead.priority,
    reason: lead.reason,
    categories: lead.categories,
    contact: lead.contact,
    stage,
    nextAction: lead.account.nextAction,
    dueDate: lead.account.dueDate,
    href: `#/lead/${lead.id}`,
  });

  makeDraggable(
    el,
    stage,
    (to) => canMove(stage, to as Column),
    (to, beforeId) => moveTo(lead.id, stage, to as Column, beforeId, false),
  );

  const link = el.querySelector('a');
  link?.setAttribute('aria-describedby', 'board-help');
  link?.setAttribute('aria-keyshortcuts', 'Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown');
  el.addEventListener('keydown', (e) => {
    if (!e.altKey) return;
    const siblings = columnLeads[stage];
    const at = siblings.findIndex((l) => l.id === lead.id);
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (!canMove(stage, stage)) return;
      const target = e.key === 'ArrowUp' ? siblings[at - 1] : siblings[at + 2];
      if (e.key === 'ArrowUp' ? at === 0 : at === siblings.length - 1) return;
      e.preventDefault();
      moveTo(lead.id, stage, stage, target?.id ?? null, true);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const i = COLUMNS.findIndex((c) => c.id === stage) + (e.key === 'ArrowRight' ? 1 : -1);
      if (i < 0 || i >= COLUMNS.length || !canMove(stage, COLUMNS[i].id)) return;
      e.preventDefault();
      moveTo(lead.id, stage, COLUMNS[i].id, null, true);
    }
  });
  return el;
}

/** Sort key that places a lead just before `beforeId`, or last when it is null. */
function orderBefore(column: Lead[], beforeId: string | null): number {
  const i = beforeId ? column.findIndex((l) => l.id === beforeId) : column.length;
  const prev = column[i - 1], next = column[i];
  if (!prev && !next) return 0;
  if (!prev) return sortKey(next) - 1;
  if (!next) return sortKey(prev) + 1;
  return (sortKey(prev) + sortKey(next)) / 2;
}

function moveTo(id: string, from: Column, to: Column, beforeId: string | null, keepFocus: boolean): void {
  const others = columnLeads[to].filter((l) => l.id !== id);
  if (from === to) {
    const at = columnLeads[to].findIndex((l) => l.id === id);
    if ((columnLeads[to][at + 1]?.id ?? null) === beforeId) return;
  }
  // On narrow screens, follow the card to the tab it landed in.
  currentTab = to;
  setStage(id, to, REORDERABLE.includes(to) ? orderBefore(others, beforeId) : undefined); // re-renders synchronously
  if (keepFocus) document.querySelector<HTMLElement>(`[data-lead="${id}"] a`)?.focus();
}
