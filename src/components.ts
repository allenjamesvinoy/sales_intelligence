/**
 * The Contractor Leads design system components, ported from its React
 * bundle to plain DOM builders. Class names match components.css.
 */
import { cx, h, icon, type Child } from './dom';
import { formatDistance, todayIso } from './format';
import {
  OUTCOMES,
  type ActivityEntry,
  type Contact,
  type ContactAvailability,
  type EvidenceItem,
  type FitLevel,
  type Outcome,
  type Priority,
  type Stage,
} from './types';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet';

export interface ButtonProps {
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  disabled?: boolean;
  type?: 'button' | 'submit';
  onClick?: (e: MouseEvent) => void;
  className?: string;
}

export function Button(props: ButtonProps, ...children: Child[]): HTMLButtonElement {
  const { variant = 'secondary', size = 'md', type = 'button' } = props;
  return h(
    'button',
    {
      type,
      disabled: props.disabled,
      onClick: props.onClick,
      className: cx('lb-btn', `lb-btn-${variant}`, size === 'sm' && 'lb-btn-sm', props.className),
    },
    ...children,
  );
}

const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'High priority',
  medium: 'Medium priority',
  low: 'Low priority',
};

export function PriorityBadge(level: Priority): HTMLSpanElement {
  return h('span', { className: `lb-pri lb-pri-${level}` }, PRIORITY_LABEL[level]);
}

const FIT_LABEL: Record<FitLevel, string> = {
  high: 'High fit',
  medium: 'Medium fit',
  unknown: 'Fit unknown',
};

export function FitTag(level: FitLevel): HTMLSpanElement {
  return h('span', { className: `lb-fit lb-fit-${level}` }, FIT_LABEL[level]);
}

export function contactAvailability(contact: Contact): ContactAvailability {
  if (contact.person?.verified) return 'verified';
  if (contact.person || contact.phone || contact.email) return 'company';
  return 'none';
}

export interface LeadCardProps {
  name: string;
  location: string;
  distanceMi?: number;
  priority?: Priority;
  reason?: string;
  categories?: string[];
  contact: ContactAvailability;
  nextAction?: string;
  stage: Exclude<Stage, 'dismissed'>;
  outcome?: string;
  followUp?: string;
  href: string;
  /** Only the first card on the board gets the copper button. */
  primary?: boolean;
  onFocus?: () => void;
  onDone?: () => void;
  onNotRelevant?: () => void;
}

const CONTACT_TEXT: Record<ContactAvailability, string> = {
  verified: 'Decision-maker verified',
  company: 'Company contact only',
  none: 'No contact found',
};

export function LeadCard(p: LeadCardProps): HTMLElement {
  const { stage, contact } = p;
  const actions: HTMLElement[] = [];
  if (stage === 'recommended') {
    actions.push(Button({ size: 'sm', variant: p.primary ? 'primary' : 'secondary', onClick: p.onFocus }, 'Move to My Focus'));
  }
  if (stage === 'focus') actions.push(Button({ size: 'sm', onClick: p.onDone }, 'Move to Done'));
  if (stage !== 'done') actions.push(Button({ size: 'sm', variant: 'quiet', onClick: p.onNotRelevant }, 'Mark not relevant'));

  return h(
    'article',
    { className: 'lb-card' },
    h(
      'div',
      { className: 'lb-card-head' },
      h('h3', { className: 'lb-card-title' }, h('a', { className: 'lb-card-open', href: p.href }, p.name)),
      p.priority && PriorityBadge(p.priority),
    ),
    h(
      'div',
      { className: 'lb-card-meta' },
      icon('pin'),
      h('span', null, p.location),
      p.distanceMi != null && h('span', { className: 'lb-data' }, `· ${formatDistance(p.distanceMi)}`),
    ),
    p.reason && h('p', { className: 'lb-card-reason' }, p.reason),
    p.categories?.length &&
      h(
        'div',
        { className: 'lb-cats', 'aria-label': 'Likely product categories' },
        p.categories.slice(0, 3).map((c) => h('span', { className: 'lb-cat' }, c)),
      ),
    h(
      'div',
      { className: cx('lb-card-contact', contact === 'verified' && 'is-ok', contact === 'none' && 'is-gap') },
      icon(contact === 'verified' ? 'check' : contact === 'none' ? 'alert' : 'phone'),
      CONTACT_TEXT[contact],
    ),
    stage === 'done' && p.outcome && h('div', { className: 'lb-card-outcome' }, 'Outcome: ', h('b', null, p.outcome)),
    stage === 'done' && p.followUp && h('div', { className: 'lb-card-outcome lb-data' }, `Follow-up ${p.followUp}`),
    stage !== 'done' &&
      p.nextAction &&
      h('div', { className: 'lb-next' }, h('span', { className: 'lb-muted' }, 'Next: '), h('b', null, p.nextAction)),
    actions.length > 0 && h('div', { className: 'lb-card-actions' }, actions),
  );
}

export interface BoardColumnProps {
  id: string;
  title: string;
  count: number;
  hint?: string;
  active?: boolean;
  current?: boolean;
}

export function BoardColumn(p: BoardColumnProps, ...children: Child[]): HTMLElement {
  const titleId = `col-${p.id}-title`;
  return h(
    'section',
    {
      id: `col-${p.id}`,
      className: cx('lb-col', p.active && 'is-active', p.current && 'is-current'),
      'aria-labelledby': titleId,
      role: 'tabpanel',
    },
    h(
      'div',
      { className: 'lb-col-head' },
      h('h2', { className: 'lb-col-title', id: titleId }, p.title),
      h('span', { className: 'lb-col-count' }, h('span', { className: 'sr-only' }, 'Count: '), String(p.count)),
    ),
    p.hint && h('p', { className: 'lb-col-hint' }, p.hint),
    ...children,
  );
}

export interface NoticeProps {
  tone?: 'gap' | 'info' | 'error';
  title: string;
  body?: string;
}

export function Notice(p: NoticeProps, ...children: Child[]): HTMLElement {
  const tone = p.tone ?? 'gap';
  return h(
    'div',
    { className: `lb-notice lb-notice-${tone}`, role: tone === 'error' ? 'alert' : 'status' },
    icon(tone === 'info' ? 'info' : 'alert'),
    h(
      'div',
      null,
      h('p', { className: 'lb-notice-title' }, p.title),
      p.body && h('p', { className: 'lb-notice-body' }, p.body),
      ...children,
    ),
  );
}

export function Freshness(updated: string, stale: boolean): HTMLElement {
  return h(
    'span',
    { className: cx('lb-fresh', stale && 'is-stale') },
    icon(stale ? 'alert' : 'clock'),
    `${stale ? 'Data may be out of date · ' : 'Updated '}${updated}`,
  );
}

export interface EmptyStateProps {
  title: string;
  body?: string;
  action?: HTMLElement;
}

export function EmptyState(p: EmptyStateProps): HTMLElement {
  return h(
    'div',
    { className: 'lb-empty' },
    h('h3', { className: 'lb-empty-title' }, p.title),
    p.body && h('p', { className: 'lb-empty-body' }, p.body),
    p.action,
  );
}

export function LoadingCards(count = 2): HTMLElement {
  const skeleton = () =>
    h(
      'div',
      { className: 'lb-skel' },
      h('span', { style: { width: '60%', height: '16px' } }),
      h('span', { style: { width: '40%' } }),
      h('span', null),
      h('span', { style: { width: '80%' } }),
    );
  return h(
    'div',
    { className: 'lb-stack', 'aria-busy': 'true', 'aria-label': 'Loading leads' },
    Array.from({ length: count }, skeleton),
  );
}

export interface ContactBlockProps extends Contact {
  opener?: string;
  questions?: string[];
}

export function ContactBlock(p: ContactBlockProps): HTMLElement {
  const person = p.person;
  const lines: Child[] = [];
  if (p.phone) lines.push(icon('phone'), h('a', { className: 'lb-link', href: `tel:${p.phone}` }, p.phone));
  if (p.email) lines.push(icon('mail'), h('a', { className: 'lb-link', href: `mailto:${p.email}` }, p.email));
  if (p.website) {
    lines.push(
      icon('globe'),
      h('a', { className: 'lb-link', href: p.website, target: '_blank', rel: 'noopener' }, p.website.replace(/^https?:\/\//, '')),
    );
  }

  return h(
    'div',
    { className: 'lb-contact' },
    person
      ? h(
          'div',
          { className: 'lb-contact-person' },
          h(
            'span',
            { className: 'lb-contact-name' },
            icon('user'),
            person.name,
            person.verified && h('span', { className: 'lb-verified' }, icon('check'), 'Verified'),
          ),
          h('span', { className: 'lb-muted' }, person.role + (person.source ? ` · source: ${person.source}` : '')),
        )
      : Notice({
          tone: 'gap',
          title: 'Purchasing contact not identified',
          body: `Ask for the ${p.askFor ?? 'owner or the person who orders materials'}.`,
        }),
    lines.length > 0
      ? h('div', { className: 'lb-contact-lines' }, lines)
      : Notice({ tone: 'gap', title: 'No phone, email or website found', body: 'Search the business name before calling.' }),
    (p.opener || p.questions?.length) &&
      h(
        'div',
        { className: 'lb-prep' },
        p.opener && [h('p', { className: 'lb-label' }, 'Opener'), h('p', { className: 'lb-opener' }, p.opener)],
        p.questions?.length && [
          h('p', { className: 'lb-label' }, 'Qualify'),
          h('ol', null, p.questions.map((q) => h('li', null, q))),
        ],
      ),
  );
}

export function EvidenceList(items: EvidenceItem[]): HTMLElement {
  return h(
    'ul',
    { className: 'lb-ev' },
    items.map((it) =>
      h(
        'li',
        null,
        icon('check'),
        h(
          'div',
          null,
          h('div', null, it.fact),
          h(
            'div',
            { className: 'lb-ev-src' },
            it.url ? h('a', { className: 'lb-link', href: it.url, target: '_blank', rel: 'noopener' }, it.source) : it.source,
            it.date && h('span', { className: 'lb-data' }, ` · ${it.date}`),
          ),
        ),
      ),
    ),
  );
}

let pickerCount = 0;

/** The Activity form: outcome (required), note, follow-up date (required for Follow-up needed). */
export function OutcomePicker(onSave: (entry: ActivityEntry) => void): HTMLElement {
  const uid = `outcome-${++pickerCount}`;
  let outcome: Outcome | null = null;

  const chips = OUTCOMES.map((o) =>
    h('button', { type: 'button', role: 'radio', 'aria-checked': 'false', className: 'lb-chip', 'data-outcome': o, tabindex: '-1' }, o),
  );
  chips[0].tabIndex = 0;

  const note = h('textarea', { className: 'lb-input', id: `${uid}-note`, placeholder: 'What did you learn?' });
  const date = h('input', { className: 'lb-input', type: 'date', id: `${uid}-date`, min: todayIso() });
  const dateLabel = h('span', { className: 'lb-label' }, 'Follow-up date (optional)');
  const error = h('p', { className: 'lb-field-error', id: `${uid}-error`, role: 'alert' });
  const save = Button({ variant: 'primary', type: 'submit', disabled: true }, 'Save outcome');
  const help = h('p', { className: 'lb-help' });

  function sync(): void {
    const needsDate = outcome === 'Follow-up needed';
    chips.forEach((chip) => {
      const on = chip.dataset.outcome === outcome;
      chip.setAttribute('aria-checked', String(on));
      chip.replaceChildren(...(on ? [icon('check')] : []), chip.dataset.outcome ?? '');
    });
    dateLabel.textContent = needsDate ? 'Follow-up date (required)' : 'Follow-up date (optional)';
    date.required = needsDate;
    save.disabled = !outcome;
    help.textContent = needsDate
      ? 'This contractor returns to My Focus on the date you pick.'
      : 'Pick an outcome to save. Adding a date returns the contractor to My Focus on that day.';
  }

  function select(chip: HTMLButtonElement): void {
    outcome = chip.dataset.outcome as Outcome;
    chips.forEach((c) => (c.tabIndex = c === chip ? 0 : -1));
    error.textContent = '';
    sync();
  }

  chips.forEach((chip, i) => {
    chip.addEventListener('click', () => select(chip));
    chip.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const next = chips[(i + step + chips.length) % chips.length];
      select(next);
      next.focus();
    });
  });

  const form = h(
    'form',
    { className: 'lb-outcome', novalidate: true },
    h(
      'div',
      { className: 'lb-field' },
      h('span', { className: 'lb-label', id: `${uid}-label` }, 'Outcome'),
      h('div', { className: 'lb-chips', role: 'radiogroup', 'aria-labelledby': `${uid}-label` }, chips),
    ),
    h('label', { className: 'lb-field', for: `${uid}-note` }, h('span', { className: 'lb-label' }, 'Note'), note),
    h(
      'div',
      { className: 'lb-followup' },
      h('label', { className: 'lb-field', for: `${uid}-date` }, dateLabel, date),
      save,
    ),
    error,
    help,
  );

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!outcome) return;
    if (outcome === 'Follow-up needed' && !date.value) {
      error.textContent = 'Pick a follow-up date so this contractor comes back to My Focus.';
      date.focus();
      return;
    }
    onSave({ outcome, note: note.value.trim(), followUp: date.value || undefined, at: new Date().toISOString() });
  });

  sync();
  return form;
}
