/**
 * The Contractor Leads design system components, ported from its React
 * bundle to plain DOM builders. Class names match components.css.
 */
import { cx, h, icon, type Child } from './dom';
import { formatDay, formatDistance, todayIso } from './format';
import {
  MODES,
  OUTCOMES,
  type Contact,
  type EvidenceItem,
  type FitLevel,
  type InteractionInput,
  type InteractionMode,
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

export interface LeadCardProps {
  id: string;
  name: string;
  location: string;
  distanceMi?: number | null;
  priority?: Priority;
  reason?: string;
  categories?: string[];
  contact: Contact;
  stage: Exclude<Stage, 'dismissed'>;
  nextAction?: string;
  /** yyyy-mm-dd */
  dueDate?: string;
  href: string;
}

export function LeadCard(p: LeadCardProps): HTMLElement {
  const { contact } = p;
  return h(
    'article',
    { className: 'lb-card', 'data-lead': p.id },
    h(
      'div',
      { className: 'lb-card-head' },
      h('h3', { className: 'lb-card-title' }, h('a', { className: 'lb-card-open', href: p.href, draggable: 'false' }, p.name)),
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
    p.nextAction && p.dueDate && NextAction(p.nextAction, p.dueDate),
    CardContact(contact),
  );
}

/** "Next: Call Ted · Oct 14", amber once overdue. */
export function NextAction(action: string, dueDate: string): HTMLElement {
  const overdue = dueDate < todayIso();
  return h(
    'div',
    { className: cx('lb-next', overdue && 'is-overdue') },
    h('span', { className: 'lb-muted' }, 'Next: '),
    h('b', null, action),
    h('span', { className: 'lb-data' }, ` · ${overdue ? 'overdue ' : ''}${formatDay(dueDate)}`),
  );
}

function CardContact({ person, phone }: Contact): HTMLElement {
  if (!person && !phone) {
    return h('div', { className: 'lb-card-contact is-gap' }, icon('alert'), 'No contact found');
  }
  return h(
    'div',
    { className: 'lb-card-caller' },
    h(
      'span',
      { className: 'lb-card-contact' },
      icon('user'),
      person ? [h('b', null, person.name), `, ${person.role}`] : 'Ask for the owner',
    ),
    phone && h('a', { className: 'lb-link lb-card-contact', href: `tel:${phone}` }, icon('phone'), phone),
  );
}

export interface BoardColumnProps {
  id: string;
  title: string;
  count: number;
  active?: boolean;
  current?: boolean;
}

/** A board stage. `data-drop` makes the whole well a drop target for dragged cards. */
export function BoardColumn(p: BoardColumnProps, ...children: Child[]): HTMLElement {
  const titleId = `col-${p.id}-title`;
  return h(
    'section',
    {
      id: `col-${p.id}`,
      className: cx('lb-col', p.active && 'is-active', p.current && 'is-current'),
      'aria-labelledby': titleId,
      'data-drop': p.id,
    },
    h(
      'div',
      { className: 'lb-col-head' },
      h('h2', { className: 'lb-col-title', id: titleId }, p.title),
      h('span', { className: 'lb-col-count' }, h('span', { className: 'sr-only' }, 'Count: '), String(p.count)),
    ),
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
      : Notice({ tone: 'gap', title: 'No phone, email or website found' }),
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

let formCount = 0;

/** A single-choice chip row with arrow-key navigation (ARIA radio group). */
function ChipGroup<T extends string>(label: string, options: readonly T[], text: (o: T) => string, onChange: (o: T) => void) {
  const id = `chips-${++formCount}`;
  let value: T | null = null;
  const chips = options.map((o) =>
    h('button', { type: 'button', role: 'radio', 'aria-checked': 'false', className: 'lb-chip', tabindex: '-1' }, text(o)),
  );
  chips[0].tabIndex = 0;

  function select(i: number): void {
    value = options[i];
    chips.forEach((chip, j) => {
      chip.setAttribute('aria-checked', String(i === j));
      chip.tabIndex = i === j ? 0 : -1;
      chip.replaceChildren(...(i === j ? [icon('check')] : []), text(options[j]));
    });
    onChange(value);
  }

  chips.forEach((chip, i) => {
    chip.addEventListener('click', () => select(i));
    chip.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const next = (i + step + chips.length) % chips.length;
      select(next);
      chips[next].focus();
    });
  });

  const el = h(
    'div',
    { className: 'lb-field' },
    h('span', { className: 'lb-label', id }, label),
    h('div', { className: 'lb-chips', role: 'radiogroup', 'aria-labelledby': id }, chips),
  );
  return { el, value: () => value };
}

const MODE_LABEL: Record<InteractionMode, string> = { call: 'Call', email: 'Email', text: 'Text', visit: 'Visit' };

/** Log a call, email, text or visit, and set what happens next. */
export function InteractionForm(onSave: (input: InteractionInput) => Promise<void>): HTMLElement {
  const uid = `interaction-${++formCount}`;
  const save = Button({ variant: 'primary', type: 'submit', disabled: true }, 'Log interaction');
  const error = h('p', { className: 'lb-field-error', role: 'alert' });
  const sync = () => {
    save.disabled = !mode.value() || !outcome.value();
    error.textContent = '';
  };
  const mode = ChipGroup('How', MODES, (m) => MODE_LABEL[m], sync);
  const outcome = ChipGroup('Outcome', OUTCOMES, (o) => o, sync);
  const note = h('textarea', { className: 'lb-input', id: `${uid}-note`, placeholder: 'What did you learn?' });
  const next = h('input', { className: 'lb-input', id: `${uid}-next`, placeholder: 'Leave blank for the suggested step' });
  const due = h('input', { className: 'lb-input', type: 'date', id: `${uid}-due`, min: todayIso() });

  const form = h(
    'form',
    { className: 'lb-outcome', novalidate: true },
    mode.el,
    outcome.el,
    h('label', { className: 'lb-field', for: `${uid}-note` }, h('span', { className: 'lb-label' }, 'Note'), note),
    h(
      'div',
      { className: 'lb-followup' },
      h('label', { className: 'lb-field grow', for: `${uid}-next` }, h('span', { className: 'lb-label' }, 'Next action'), next),
      h('label', { className: 'lb-field', for: `${uid}-due` }, h('span', { className: 'lb-label' }, 'Due'), due),
    ),
    save,
    error,
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const m = mode.value(), o = outcome.value();
    if (!m || !o) return;
    if (o === 'Follow-up needed' && !due.value) {
      error.textContent = 'Pick the follow-up date.';
      due.focus();
      return;
    }
    save.disabled = true;
    await onSave({ mode: m, outcome: o, note: note.value.trim(), nextAction: next.value.trim() || undefined, dueDate: due.value || undefined });
  });
  return form;
}
