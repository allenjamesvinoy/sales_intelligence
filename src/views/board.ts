import {
  BoardColumn,
  Button,
  EmptyState,
  Freshness,
  LeadCard,
  LoadingCards,
  contactAvailability,
} from '../components';
import { DATA_UPDATED } from '../data';
import { h } from '../dom';
import { formatDay, formatStamp, isStale } from '../format';
import { getLeadState, restoreDismissed, setStage } from '../store';
import type { Lead, Stage } from '../types';

type Column = Exclude<Stage, 'dismissed'>;

const COLUMNS: { id: Column; title: string; hint?: string }[] = [
  { id: 'recommended', title: 'Recommended', hint: 'Sorted by rank' },
  { id: 'focus', title: 'My Focus', hint: 'Contractors you are working this week' },
  { id: 'done', title: 'Done' },
];

const EMPTY: Record<Column, { title: string; body: string }> = {
  recommended: {
    title: 'No new leads',
    body: 'You have worked every recommended contractor. New leads arrive when the data refreshes.',
  },
  focus: {
    title: 'Nothing in focus yet',
    body: 'Move a recommended contractor here when you plan to call them.',
  },
  done: {
    title: 'No outcomes yet',
    body: 'Save an outcome on a contractor’s page and it moves here.',
  },
};

let currentTab: Column = 'recommended';

export function renderBoard(leads: Lead[] | null): HTMLElement {
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
          id: `tab-${col.id}`,
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

  const columns = COLUMNS.map((col) => {
    const items = byStage[col.id];
    let body: HTMLElement | HTMLElement[];
    if (!leads) body = LoadingCards(col.id === 'recommended' ? 3 : 1);
    else if (items.length === 0) body = EmptyState(EMPTY[col.id]);
    else body = items.map((lead, i) => card(lead, col.id, col.id === 'recommended' && i === 0));

    const dismissed = byStage.dismissed.length;
    return BoardColumn(
      {
        id: col.id,
        title: col.title,
        count: items.length,
        hint: col.hint,
        active: col.id === 'focus',
        current: col.id === currentTab,
      },
      body,
      col.id === 'recommended' &&
        dismissed > 0 &&
        h(
          'div',
          { className: 'col-foot' },
          Button(
            { size: 'sm', variant: 'quiet', onClick: restoreDismissed },
            `Restore ${dismissed} hidden ${dismissed === 1 ? 'lead' : 'leads'}`,
          ),
        ),
    );
  });

  return h(
    'div',
    null,
    h(
      'div',
      { className: 'page-head' },
      h(
        'div',
        null,
        h('h1', { className: 'page-title', tabindex: '-1' }, 'My leads'),
        h('p', { className: 'page-sub' }, 'Roofing contractors in your territory, ranked by fit.'),
      ),
      Freshness(formatStamp(DATA_UPDATED), isStale(DATA_UPDATED)),
    ),
    tabs,
    h('div', { className: 'lb-board' }, columns),
  );
}

function card(lead: Lead, stage: Column, primary: boolean): HTMLElement {
  const state = getLeadState(lead.id);
  const last = state.activity[0];
  return LeadCard({
    name: lead.name,
    location: lead.location,
    distanceMi: lead.distanceMi,
    priority: lead.priority,
    reason: lead.reason,
    categories: lead.categories,
    contact: contactAvailability(lead.contact),
    nextAction: lead.nextAction,
    stage,
    outcome: last?.outcome,
    followUp: state.followUp ? formatDay(state.followUp) : undefined,
    href: `#/lead/${lead.id}`,
    primary,
    onFocus: () => setStage(lead.id, 'focus'),
    onDone: () => setStage(lead.id, 'done'),
    onNotRelevant: () => setStage(lead.id, 'dismissed'),
  });
}
