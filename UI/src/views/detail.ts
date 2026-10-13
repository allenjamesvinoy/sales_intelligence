import { api } from '../api';
import {
  Button,
  EmptyState,
  EvidenceList,
  FitTag,
  InteractionForm,
  MODE_LABEL as INTERACTION_MODES,
  NextAction,
  Notice,
  PersonDialog,
  PriorityBadge,
  openDialog,
} from '../components';
import { append, cx, h, icon, type Child } from '../dom';
import { formatDay, formatDistance, formatStamp, todayIso } from '../format';
import { getLeadState, setStage, sync } from '../store';
import { ACCOUNT_STAGES, type Account, type AccountDetail, type AccountStage, type Interaction, type Lead, type Overview, type Person, type Stage } from '../types';

const STAGE_LABEL: Record<AccountStage, string> = {
  discovered: 'Discovered',
  researching: 'Researching',
  contacted: 'Contacted',
  opportunity: 'Opportunity',
  customer: 'Customer',
};
const MODE_LABEL: Record<Interaction['mode'], string> = { ...INTERACTION_MODES, update: 'Update' };

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

  const board = getLeadState(lead.id).stage;
  const status = h('section', { className: 'section account-status' }, h('p', { className: 'lb-muted' }, 'Loading account…'));
  const chat = h('section', { className: 'section chat', 'aria-label': 'Account conversation' });
  const list = h('section', { className: 'section', 'aria-labelledby': 'log-title' }, h('h2', { className: 'section-title', id: 'log-title' }, 'Interactions'));
  const people = details('People', true);
  const logButton = Button({ variant: 'primary', disabled: true }, icon('plus'), 'Log interaction');
  api
    .getAccount(lead.id)
    .then((detail) => {
      status.replaceChildren();
      append(status, accountStatus(lead, detail));
      append(chat, chatPanel(lead, board, detail));
      append(list, [interactionList(detail.interactions)]);
      append(people, peopleList(lead.id, detail.contacts));
      logButton.disabled = false;
      logButton.addEventListener('click', () => openLog(lead, detail.contacts));
    })
    .catch(() => status.replaceChildren(Notice({ tone: 'error', title: 'Account could not load' })));

  return h(
    'div',
    { className: 'account' },
    backLink(),
    h(
      'header',
      { className: 'detail-head' },
      h('div', { className: 'detail-title-row' }, h('h1', { className: 'page-title', tabindex: '-1' }, lead.name), PriorityBadge(lead.priority)),
      h(
        'div',
        { className: 'lb-card-meta' },
        icon('pin'),
        h('span', null, lead.location),
        lead.distanceMi != null && h('span', { className: 'lb-data' }, `· ${formatDistance(lead.distanceMi)}`),
      ),
      h('div', { className: 'detail-actions' }, logButton, stageAction(lead.id, board)),
    ),
    status,
    h(
      'div',
      { className: 'account-layout' },
      h(
        'div',
        { className: 'account-main' },
        chat,
        people,
        details('Call preparation', false, callPrep(lead)),
        details(
          'Why this lead',
          false,
          h('p', null, lead.reason),
          lead.evidence.length > 0 ? EvidenceList(lead.evidence) : Notice({ tone: 'gap', title: 'No public evidence recorded' }),
        ),
        details('Likely product fit', false, productFit(lead)),
        details('Overview', false, overview(lead.overview)),
      ),
      h('div', { className: 'account-side' }, list),
    ),
  );
}

function accountStatus(lead: Lead, { account, interactions: log }: AccountDetail): Child[] {
  const current = ACCOUNT_STAGES.indexOf(account.stage);
  const track = h(
    'ol',
    { className: 'stage-track', 'aria-label': 'Sales stage' },
    ACCOUNT_STAGES.map((stage, i) =>
      h(
        'li',
        {
          className: i < current ? 'is-past' : i === current ? 'is-current' : stage === 'customer' ? 'is-future' : '',
          'aria-current': i === current ? 'step' : null,
        },
        h('span', { className: 'stage-num lb-data' }, String(i + 1)),
        STAGE_LABEL[stage],
      ),
    ),
  );

  const next = h('dd', null, NextAction(account.nextAction, account.dueDate));
  const edit = Button({ size: 'sm', variant: 'quiet', onClick: () => next.replaceChildren(nextActionForm(lead.id, account)) }, 'Edit');
  next.append(edit);

  return [
    track,
    h(
      'dl',
      { className: 'facts' },
      h('dt', null, 'Owner'),
      h('dd', null, account.owner.name),
      h('dt', null, 'People'),
      h('dd', null, participants(log, account.owner.name)),
      h('dt', null, 'Next action'),
      next,
      h('dt', null, 'Recommended because'),
      h('dd', null, lead.reason),
      account.opportunityNote && [h('dt', null, 'Opportunity'), h('dd', null, account.opportunityNote)],
    ),
    account.stage === 'opportunity' &&
      h('p', { className: 'lb-help' }, 'Customer insights (reorder timing, cross-sell, account risk) start once order history is connected.'),
  ];
}

function nextActionForm(id: string, account: Account): HTMLElement {
  const action = h('input', { className: 'lb-input', value: account.nextAction, 'aria-label': 'Next action', required: true });
  const due = h('input', { className: 'lb-input', type: 'date', value: account.dueDate, min: todayIso(), 'aria-label': 'Due date' });
  const form = h('form', { className: 'lb-followup' }, action, due, Button({ size: 'sm', type: 'submit' }, 'Save'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (action.value.trim() && due.value) sync(api.updateNextAction(id, action.value.trim(), due.value));
  });
  queueMicrotask(() => action.focus());
  return form;
}

function chatPanel(lead: Lead, board: Stage, { account, interactions: log }: AccountDetail): Child[] {
  const canConvert = board !== 'recommended' && (account.stage === 'researching' || account.stage === 'contacted');
  return [
    h('div', { className: 'chat-thread' }, bubble(summary(lead, account, log))),
    canConvert && h('div', { className: 'chat-composer' }, opportunityForm(lead.id)),
  ];
}

function bubble(...children: Child[]): HTMLElement {
  return h('div', { className: 'chat-bubble' }, h('span', { className: 'chat-from' }, 'InstaHermes.AI'), h('p', null, ...children));
}

/** Plain-language recap of the log, built from the records (no AI call). */
function summary(lead: Lead, account: Account, log: Interaction[]): string {
  const contacts = log.filter((i) => i.mode !== 'update');
  if (contacts.length === 0) return `No one has contacted ${lead.name} yet. ${account.owner.name} owns this account.`;
  const reps = [...new Set(contacts.map((i) => i.user))];
  const last = contacts[0];
  const connected = contacts.filter((i) => i.outcome === 'Connected' || i.outcome === 'Qualified').length;
  return [
    `${contacts.length} ${contacts.length === 1 ? 'interaction' : 'interactions'} so far by ${reps.join(' and ')}, ${connected} reached someone.`,
    `Last: ${last.user} (${MODE_LABEL[last.mode].toLowerCase()}, ${formatDay(last.at.slice(0, 10))}): ${last.outcome}${last.note ? `, "${last.note}"` : ''}.`,
    `Now ${STAGE_LABEL[account.stage]}, owned by ${account.owner.name}.`,
  ].join(' ');
}

function interactionList(log: Interaction[]): Child {
  if (log.length === 0) return h('p', { className: 'lb-muted' }, 'Nothing logged yet.');
  return h(
    'ol',
    { className: 'interaction-list' },
    log.map((i) =>
      h(
        'li',
        null,
        h(
          'button',
          { type: 'button', className: cx('interaction-row', i.mode === 'update' && 'is-update'), onClick: () => openInteraction(i) },
          h('span', { className: 'interaction-top' }, h('b', null, i.outcome), h('span', { className: 'lb-cat' }, MODE_LABEL[i.mode])),
          i.people.length > 0 && h('span', null, 'with ', i.people.map((p) => p.name).join(', ')),
          h('span', { className: 'lb-muted' }, i.user, ' · ', h('span', { className: 'lb-data' }, formatStamp(i.at))),
        ),
      ),
    ),
  );
}

function openInteraction(i: Interaction): void {
  openDialog(
    `${MODE_LABEL[i.mode]}: ${i.outcome}`,
    h(
      'dl',
      { className: 'facts' },
      h('dt', null, 'By'),
      h('dd', null, i.user),
      h('dt', null, 'When'),
      h('dd', null, h('span', { className: 'lb-data' }, formatStamp(i.at))),
      i.people.length > 0 && [h('dt', null, 'Talked to'), h('dd', null, i.people.map((p) => (p.role ? `${p.name} (${p.role})` : p.name)).join(', '))],
      i.note && [h('dt', null, 'Notes'), h('dd', { className: 'pre-wrap' }, i.note)],
      i.nextAction && [h('dt', null, 'Next step set'), h('dd', null, i.nextAction, i.dueDate ? `, due ${formatDay(i.dueDate)}` : '')],
    ),
  );
}

function openLog(lead: Lead, contacts: Person[]): void {
  const dialog = openDialog(
    `Log interaction with ${lead.name}`,
    InteractionForm({
      people: contacts,
      addPerson: () => PersonDialog((input) => api.addContact(lead.id, input)),
      onSave: async (input) => {
        await sync(api.logInteraction(lead.id, input));
        dialog.close();
      },
    }),
  );
}

/** Everyone known at the contractor, editable by any rep. */
function peopleList(id: string, contacts: Person[]): Child[] {
  const changed = () => window.dispatchEvent(new Event('leads:changed'));
  const add = Button({ size: 'sm', onClick: async () => (await PersonDialog((input) => api.addContact(id, input))) && changed() }, icon('plus'), 'Add person');
  if (contacts.length === 0) return [h('p', { className: 'lb-muted' }, 'No one identified yet.'), add];
  return [
    h(
      'ul',
      { className: 'people' },
      contacts.map((p) =>
        h(
          'li',
          null,
          h(
            'div',
            { className: 'people-main' },
            h('b', null, p.name),
            p.role && h('span', { className: 'lb-muted' }, p.role),
            p.phone && h('a', { className: 'lb-link', href: `tel:${p.phone}` }, p.phone),
            p.email && h('a', { className: 'lb-link', href: `mailto:${p.email}` }, p.email),
            h('span', { className: 'lb-help' }, p.source),
          ),
          Button({ size: 'sm', variant: 'quiet', onClick: async () => (await PersonDialog((input) => api.updateContact(id, p.id, input), p)) && changed() }, 'Edit'),
        ),
      ),
    ),
    add,
  ];
}

/** Company lines and talking points for the next call. */
function callPrep(lead: Lead): Child[] {
  const { phone, email, website } = lead.contact;
  return [
    h(
      'div',
      { className: 'lb-contact-lines' },
      phone && [icon('phone'), h('a', { className: 'lb-link', href: `tel:${phone}` }, phone)],
      email && [icon('mail'), h('a', { className: 'lb-link', href: `mailto:${email}` }, email)],
      website && [icon('globe'), h('a', { className: 'lb-link', href: website, target: '_blank', rel: 'noopener' }, website.replace(/^https?:\/\//, ''))],
    ),
    lead.opener && [h('p', { className: 'lb-label' }, 'Opener'), h('p', null, lead.opener)],
    lead.questions.length > 0 && [h('p', { className: 'lb-label' }, 'Qualify'), h('ol', { className: 'prep-questions' }, lead.questions.map((q) => h('li', null, q)))],
  ];
}

/** Users who have touched this account, with how many interactions each. */
function participants(log: Interaction[], owner: string): HTMLElement {
  const counts = new Map<string, number>([[owner, 0]]);
  for (const i of log) if (i.mode !== 'update') counts.set(i.user, (counts.get(i.user) ?? 0) + 1);
  return h(
    'div',
    { className: 'lb-cats' },
    [...counts].map(([name, n]) =>
      h('span', { className: 'person-chip' }, h('span', { className: 'avatar', 'aria-hidden': 'true' }, initials(name)), name, h('span', { className: 'lb-data lb-muted' }, String(n))),
    ),
  );
}

const initials = (name: string) => name.split(' ').map((w) => w[0]).slice(0, 2).join('');

function details(title: string, open: boolean, ...children: Child[]): HTMLElement {
  return h('details', { className: 'section brief', open }, h('summary', { className: 'section-title' }, title), ...children);
}

/** Stage 4: record that a real need was confirmed. */
function opportunityForm(id: string): HTMLElement {
  const note = h('input', { className: 'lb-input', placeholder: 'What do they need? e.g. 40 squares of HDZ in November', 'aria-label': 'Confirmed need' });
  const form = h('form', { className: 'lb-followup' }, note, Button({ type: 'submit' }, 'Convert to opportunity'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (note.value.trim()) sync(api.convertToOpportunity(id, note.value.trim()));
    else note.focus();
  });
  return h('div', { className: 'lb-field' }, h('span', { className: 'lb-label' }, 'Real need confirmed?'), form);
}

function backLink(): HTMLElement {
  return h('a', { className: 'back-link', href: '#/' }, icon('back'), 'My leads');
}

function stageAction(id: string, stage: Stage): HTMLElement {
  return stage === 'dismissed'
    ? Button({ size: 'sm', onClick: () => setStage(id, 'recommended') }, 'Restore')
    : Button({ size: 'sm', variant: 'quiet', onClick: () => setStage(id, 'dismissed') }, 'Not relevant');
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
