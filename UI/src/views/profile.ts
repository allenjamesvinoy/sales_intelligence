import { api } from '../api';
import { Button, Notice } from '../components';
import { append, h, icon, type Child } from '../dom';
import { formatStamp } from '../format';
import type { Profile } from '../types';

const RADII = [25, 50, 100];
const POLL_MS = 5000;

export function renderProfile(): HTMLElement {
  const root = h('div', { className: 'detail' }, h('p', { className: 'lb-muted' }, 'Loading…'));
  load(root);
  return root;
}

async function load(root: HTMLElement): Promise<void> {
  try {
    const profile = await api.getProfile();
    if (!root.isConnected) return;
    root.replaceChildren();
    append(root, view(profile, root));
    if (profile.refresh === 'running') setTimeout(() => root.isConnected && load(root), POLL_MS);
  } catch {
    root.replaceChildren(Notice({ tone: 'error', title: 'Profile could not load' }));
  }
}

function view(p: Profile, root: HTMLElement): Child[] {
  const { profile, territory, queue } = p;
  const facts = (rows: [string, Child][]) =>
    h('dl', { className: 'facts' }, rows.filter(([, v]) => v != null && v !== '').map(([k, v]) => [h('dt', null, k), h('dd', null, v)]));
  const byFocus = (focus: string) => p.products.filter((x) => x.focus === focus).map((x) => x.name).join(', ');

  return [
    h('a', { className: 'back-link', href: '#/' }, icon('back'), 'My leads'),
    h('header', { className: 'detail-head' }, h('h1', { className: 'page-title', tabindex: '-1' }, profile.name), p.summary && h('p', { className: 'lb-muted' }, p.summary)),
    section('Territory', territoryForm(p, root)),
    section('Product focus', facts([['Primary', byFocus('primary')], ['Secondary', byFocus('secondary')]])),
    section(
      'Morning queue',
      facts([
        ['Daily leads', queue?.dailyLimit],
        ['Ready by', queue?.readyBy],
        ['Last refresh', queue?.lastRefresh && h('span', { className: 'lb-data' }, formatStamp(queue.lastRefresh))],
      ]),
    ),
    section(
      'Profile',
      facts([
        ['Role', profile.role],
        ['Branch', profile.branch],
        ['Manager', profile.manager],
        ['Email', profile.email],
        ['Time zone', profile.timezone],
        ['Contractor type', territory && territory.segment[0].toUpperCase() + territory.segment.slice(1)],
      ]),
    ),
  ];
}

function territoryForm(p: Profile, root: HTMLElement): HTMLElement {
  const zip = h('input', {
    className: 'lb-input',
    id: 'zip',
    inputmode: 'numeric',
    autocomplete: 'postal-code',
    maxlength: '5',
    pattern: '\\d{5}',
    required: true,
    value: p.territory?.postalCode ?? '',
  });
  const radius = h(
    'select',
    { className: 'lb-input', id: 'radius' },
    RADII.map((r) => h('option', { value: String(r), selected: r === p.territory?.radiusMiles }, `${r} mi`)),
  );
  const error = h('p', { className: 'lb-field-error', role: 'alert' });
  const save = Button({ variant: 'primary', type: 'submit' }, 'Save');

  const form = h(
    'form',
    { className: 'lb-followup', novalidate: true },
    h('label', { className: 'lb-field', for: 'zip' }, h('span', { className: 'lb-label' }, 'ZIP code'), zip),
    h('label', { className: 'lb-field', for: 'radius' }, h('span', { className: 'lb-label' }, 'Radius'), radius),
    save,
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!/^\d{5}$/.test(zip.value)) {
      error.textContent = 'Enter a 5-digit ZIP code.';
      zip.focus();
      return;
    }
    save.disabled = true;
    try {
      await api.updateTerritory(zip.value, Number(radius.value));
      await load(root);
    } catch {
      error.textContent = 'Could not save. Try again.';
      save.disabled = false;
    }
  });

  return h('div', { className: 'lb-stack' }, form, error, refreshStatus(p));
}

function refreshStatus(p: Profile): Child {
  if (p.refresh === 'running') {
    return Notice({ tone: 'info', title: `Finding contractors near ${p.territory?.postalCode}`, body: 'This takes a few minutes.' });
  }
  if (p.refresh === 'done') return Notice({ tone: 'info', title: 'Your leads are updated' });
  if (p.refresh?.startsWith('failed')) return Notice({ tone: 'error', title: 'Update failed', body: p.refresh.slice(8) });
  return null;
}

function section(title: string, ...children: Child[]): HTMLElement {
  return h('section', { className: 'section' }, h('h2', { className: 'section-title' }, title), ...children);
}
