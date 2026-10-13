import { Button, Notice } from './components';
import { api } from './api';
import { mountAssistant } from './assistant';
import { h, icon } from './dom';
import { getTheme, hydrate, setTheme, subscribe } from './store';
import type { Lead } from './types';
import { renderBoard } from './views/board';
import { renderDetail } from './views/detail';
import { renderProfile } from './views/profile';

const app = document.getElementById('app')!;
let leads: Lead[] | null = null;
let updatedAt: string | undefined;
let loadError = false;

setTheme(getTheme());

type Route = { name: 'board' } | { name: 'profile' } | { name: 'lead'; id: string };

function parseRoute(): Route {
  if (location.hash === '#/profile') return { name: 'profile' };
  const match = location.hash.match(/^#\/lead\/([\w-]+)$/);
  return match ? { name: 'lead', id: match[1] } : { name: 'board' };
}

function themeToggle(): HTMLElement {
  const dark = getTheme() === 'dark';
  const label = dark ? 'Switch to light theme' : 'Switch to dark theme';
  return h(
    'button',
    {
      type: 'button',
      className: 'icon-btn',
      'aria-label': label,
      title: label,
      onClick: () => {
        setTheme(dark ? 'light' : 'dark');
        render();
      },
    },
    icon(dark ? 'sun' : 'moon'),
  );
}

function render(focusHeading = false): void {
  const route = parseRoute();
  let view: HTMLElement;
  if (loadError) {
    view = Notice(
      { tone: 'error', title: 'Leads could not load', body: 'Check your connection and try again.' },
      Button({ size: 'sm', onClick: () => load() }, 'Try again'),
    );
  } else if (route.name === 'profile') {
    view = renderProfile();
  } else if (route.name === 'lead') {
    view = leads ? renderDetail(leads.find((l) => l.id === route.id)) : h('p', { className: 'lb-muted' }, 'Loading…');
  } else {
    view = renderBoard(leads, updatedAt);
  }

  const scrollY = window.scrollY;
  app.replaceChildren(
    h(
      'header',
      { className: 'app-header' },
      h('a', { className: 'app-name', href: '#/' }, 'InstaHermes.AI'),
      h('nav', { className: 'app-nav' }, h('a', { className: 'icon-btn', href: '#/profile', 'aria-label': 'Profile', title: 'Profile' }, icon('user')), themeToggle()),
    ),
    h('main', { id: 'main', className: 'app-main', tabindex: '-1' }, view),
  );

  if (focusHeading) {
    window.scrollTo(0, 0);
    app.querySelector<HTMLElement>('h1')?.focus();
  } else {
    window.scrollTo(0, scrollY);
  }
}

/** `quiet` keeps the current cards on screen while new ones load. */
async function load(quiet = false): Promise<void> {
  loadError = false;
  if (!quiet) {
    leads = null;
    render();
  }
  try {
    const res = await api.getLeads();
    if (res.states) hydrate(res.states);
    leads = res.leads;
    updatedAt = res.updatedAt;
  } catch {
    loadError = true;
  }
  render();
}

window.addEventListener('hashchange', (e) => {
  render(true);
  // The profile page may have changed the territory, so pick up the new queue.
  if (new URL(e.oldURL).hash === '#/profile' && parseRoute().name === 'board') load(true);
});
window.addEventListener('app:render', () => render());
window.addEventListener('leads:changed', () => load(true));
subscribe(() => render());

mountAssistant();
load();
