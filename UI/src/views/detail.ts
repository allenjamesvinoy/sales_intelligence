import {
  Button,
  ContactBlock,
  EmptyState,
  EvidenceList,
  FitTag,
  Notice,
  OutcomePicker,
  PriorityBadge,
} from '../components';
import { h, icon, type Child } from '../dom';
import { formatDay, formatDistance, formatStamp } from '../format';
import { getLeadState, recordOutcome, setStage } from '../store';
import type { Lead, Overview } from '../types';

const STAGE_LABEL = {
  recommended: 'Recommended',
  focus: 'My Focus',
  done: 'Done',
  dismissed: 'Hidden',
} as const;

export function renderDetail(lead: Lead | undefined): HTMLElement {
  if (!lead) {
    return h(
      'div',
      { className: 'detail' },
      backLink(),
      EmptyState({
        title: 'Contractor not found',
        action: h('a', { className: 'lb-link', href: '#/' }, 'Go to My leads'),
      }),
    );
  }

  const state = getLeadState(lead.id);

  return h(
    'div',
    { className: 'detail' },
    backLink(),
    h(
      'header',
      { className: 'detail-head' },
      h(
        'div',
        { className: 'detail-title-row' },
        h('h1', { className: 'page-title', tabindex: '-1' }, lead.name),
        PriorityBadge(lead.priority),
      ),
      h(
        'div',
        { className: 'lb-card-meta' },
        icon('pin'),
        h('span', null, lead.location),
        h('span', { className: 'lb-data' }, `· ${formatDistance(lead.distanceMi)}`),
        h('span', null, `· ${STAGE_LABEL[state.stage]}`),
      ),
      stageActions(lead.id, state.stage),
    ),
    section('Overview', overview(lead.overview)),
    section('Why this lead', h('p', null, lead.reason), lead.evidence.length > 0
      ? EvidenceList(lead.evidence)
      : Notice({ tone: 'gap', title: 'No public evidence recorded' })),
    section('Likely product fit', productFit(lead)),
    section(
      'Contact and call preparation',
      ContactBlock({ ...lead.contact, opener: lead.opener, questions: lead.questions }),
    ),
    section('Activity', OutcomePicker((entry) => recordOutcome(lead.id, entry)), history(lead.id)),
  );
}

function backLink(): HTMLElement {
  return h('a', { className: 'back-link', href: '#/' }, icon('back'), 'My leads');
}

function section(title: string, ...children: Child[]): HTMLElement {
  const id = `sec-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return h(
    'section',
    { className: 'section', 'aria-labelledby': id },
    h('h2', { className: 'section-title', id }, title),
    ...children,
  );
}

function stageActions(id: string, stage: keyof typeof STAGE_LABEL): HTMLElement {
  const button =
    stage === 'dismissed'
      ? Button({ size: 'sm', onClick: () => setStage(id, 'recommended') }, 'Restore')
      : Button({ size: 'sm', variant: 'quiet', onClick: () => setStage(id, 'dismissed') }, 'Not relevant');
  return h('div', { className: 'detail-actions' }, button);
}

const OVERVIEW_FIELDS: { key: keyof Overview; label: string }[] = [
  { key: 'businessType', label: 'Business type' },
  { key: 'address', label: 'Address' },
  { key: 'services', label: 'Services' },
  { key: 'rating', label: 'Reviews' },
  { key: 'yearsInBusiness', label: 'Years in business' },
  { key: 'certifications', label: 'Certifications' },
];

function overview(o: Overview): Child[] {
  const rows: Child[] = [];
  const missing: string[] = [];
  for (const { key, label } of OVERVIEW_FIELDS) {
    const value = overviewValue(o, key);
    if (value == null) {
      missing.push(label.toLowerCase());
      continue;
    }
    rows.push(h('dt', null, label), h('dd', null, value));
  }
  return [
    rows.length > 0 && h('dl', { className: 'facts' }, rows),
    missing.length > 0 &&
      Notice({
        tone: 'gap',
        title: 'Incomplete contractor data',
        body: `Missing: ${missing.join(', ')}.`,
      }),
  ];
}

function overviewValue(o: Overview, key: keyof Overview): Child {
  switch (key) {
    case 'services':
    case 'certifications': {
      const list = o[key];
      return list?.length ? list.join(', ') : null;
    }
    case 'rating':
      return o.rating != null
        ? h('span', { className: 'lb-data' }, `${o.rating.toFixed(1)} · ${o.reviewCount ?? 0} reviews`)
        : null;
    case 'yearsInBusiness':
      return o.yearsInBusiness != null ? h('span', { className: 'lb-data' }, String(o.yearsInBusiness)) : null;
    default:
      return o[key] ?? null;
  }
}

function productFit(lead: Lead): Child {
  if (lead.productFit.length === 0) {
    return Notice({
      tone: 'info',
      title: 'No product-fit evidence',
      body: 'Ask what they install most.',
    });
  }
  return h(
    'ul',
    { className: 'fit-list' },
    lead.productFit.map((fit) =>
      h(
        'li',
        { className: 'fit-row' },
        h('div', { className: 'fit-head' }, h('span', { className: 'fit-name' }, fit.category), FitTag(fit.level)),
        h('p', null, fit.reason),
        h('p', { className: 'fit-ask' }, `Ask: ${fit.question}`),
      ),
    ),
  );
}

function history(id: string): Child {
  const { activity, followUp } = getLeadState(id);
  if (activity.length === 0) return null;
  return [
    h('p', { className: 'lb-label' }, 'History'),
    h(
      'ul',
      { className: 'history' },
      activity.map((entry, i) =>
        h(
          'li',
          null,
          h(
            'div',
            { className: 'history-head' },
            h('b', null, entry.outcome),
            h('span', { className: 'lb-data lb-muted' }, formatStamp(entry.at)),
          ),
          entry.note && h('p', null, entry.note),
          i === 0 && followUp && h('p', { className: 'lb-help' }, `Follow up ${formatDay(followUp)}`),
        ),
      ),
    ),
  ];
}
