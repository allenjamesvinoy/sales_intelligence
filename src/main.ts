import { Button, Notice } from './components';
import { fetchLeads } from './data';
import { h } from './dom';
import { todayIso } from './format';
import { applyDueFollowUps, getTheme, setTheme, subscribe } from './store';
import type { Lead } from './types';
import { renderBoard } from './views/board';
import { renderDetail } from './views/detail';

const app = document.getElementById('app')!;
let leads: Lead[] | null = null;
let loadError = false;

setTheme(getTheme());

type Route = { name: 'board' } | { name: 'lead'; id: string };

function parseRoute(): Route {
  const match = location.hash.match(/^#\/lead\/([\w-]+)$/);
  return match ? { name: 'lead', id: match[1] } : { name: 'board' };
}

function themeToggle(): HTMLElement {
  const dark = getTheme() === 'dark';
  return Button(
    {
      variant: 'quiet',
      size: 'sm',
      onClick: () => {
        setTheme(dark ? 'light' : 'dark');
        render();
      },
    },
    dark ? 'Use light theme' : 'Use dark theme',
  );
}

function render(focusHeading = false): void {
  const route = parseRoute();
  let view: HTMLElement;
  if (loadError) {
    view = Notice(
      { tone: 'error', title: 'Leads could not load', body: 'Check your connection and try again.' },
      Button({ size: 'sm', onClick: load }, 'Try again'),
    );
  } else if (route.name === 'lead') {
    view = leads ? renderDetail(leads.find((l) => l.id === route.id)) : h('p', { className: 'lb-muted' }, 'Loading…');
  } else {
    view = renderBoard(leads);
  }

  const scrollY = window.scrollY;
  app.replaceChildren(
    h(
      'header',
      { className: 'app-header' },
      h('a', { className: 'app-name', href: '#/' }, 'Contractor Leads'),
      themeToggle(),
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

async function load(): Promise<void> {
  loadError = false;
  leads = null;
  render();
  try {
    leads = await fetchLeads();
    applyDueFollowUps(todayIso());
  } catch {
    loadError = true;
  }
  render();
}

window.addEventListener('hashchange', () => render(true));
window.addEventListener('app:render', () => render());
subscribe(() => render());

load();
