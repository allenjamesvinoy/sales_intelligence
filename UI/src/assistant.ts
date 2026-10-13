import { api } from './api';
import { Button } from './components';
import { cx, h, icon } from './dom';
import type { ChatMessage } from './types';

/** Messages sent to the model per turn; older turns stay on screen only. */
const HISTORY_SENT = 12;

const history: ChatMessage[] = [];

/** The open account's id, so answers use that account as context. */
function currentAccount(): { id: string; name: string } | null {
  const id = location.hash.match(/^#\/lead\/([\w-]+)$/)?.[1];
  if (!id) return null;
  return { id, name: document.querySelector('.account h1')?.textContent ?? 'this account' };
}

/** Floating assistant: a round button in the corner that opens a chat panel, on every page. */
export function mountAssistant(): void {
  const log = h('div', { className: 'assistant-log', 'aria-live': 'polite' }, message('assistant', 'Ask what to focus on today, or about the account you have open.'));
  const scope = h('span', { className: 'assistant-scope' });
  const input = h('textarea', { className: 'lb-input', rows: '2', placeholder: 'Ask InstaHermes.AI', 'aria-label': 'Message' });
  const send = Button({ variant: 'primary', size: 'sm', type: 'submit' }, 'Send');
  const form = h('form', { className: 'assistant-form' }, input, send);
  const close = h('button', { type: 'button', className: 'assistant-icon-btn', 'aria-label': 'Close assistant' }, icon('close'));
  const panel = h(
    'section',
    { className: 'assistant-panel', role: 'dialog', 'aria-label': 'InstaHermes.AI assistant', hidden: true },
    h('div', { className: 'assistant-head' }, h('div', null, h('b', null, 'InstaHermes.AI'), scope), close),
    log,
    form,
  );
  const toggle = h('button', { type: 'button', className: 'assistant-fab', 'aria-label': 'Open assistant', 'aria-expanded': 'false' }, icon('chat'));

  const updateScope = () => {
    scope.textContent = `About: ${currentAccount()?.name ?? 'your leads'}`;
  };
  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close assistant' : 'Open assistant');
    if (open) {
      updateScope();
      input.focus();
    } else toggle.focus();
  };

  toggle.addEventListener('click', () => setOpen(panel.hidden));
  close.addEventListener('click', () => setOpen(false));
  panel.addEventListener('keydown', (e) => e.key === 'Escape' && setOpen(false));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  window.addEventListener('hashchange', () => setTimeout(updateScope));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || send.disabled) return;
    history.push({ role: 'user', content: text });
    log.append(message('user', text));
    input.value = '';
    send.disabled = true;
    const thinking = message('assistant', 'Thinking…');
    log.append(thinking);
    log.scrollTop = log.scrollHeight;
    try {
      const reply = await api.askAssistant(history.slice(-HISTORY_SENT), currentAccount()?.id);
      history.push({ role: 'assistant', content: reply });
      thinking.replaceWith(message('assistant', reply));
    } catch {
      thinking.replaceWith(message('error', 'The assistant could not answer. Try again.'));
    } finally {
      send.disabled = false;
      log.scrollTop = log.scrollHeight;
    }
  });

  document.body.append(panel, toggle);
}

function message(from: 'user' | 'assistant' | 'error', text: string): HTMLElement {
  return h('p', { className: cx('assistant-msg', `is-${from}`) }, text);
}
