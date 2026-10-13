import { api } from '../api';
import { Button, MODE_LABEL } from '../components';
import { cx, h, icon, type Child } from '../dom';
import { formatDay } from '../format';
import { sync } from '../store';
import type { ChatMessage, InteractionDraft, Person } from '../types';

/** Chat per account, kept while the rep moves around so a half-finished log isn't lost. */
const threads = new Map<string, { messages: ChatMessage[]; draft: InteractionDraft | null }>();

const canRecord = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

/** Tell the account what happened, by typing, pasting an email, or speaking; the AI drafts the log entry to confirm. */
export function LogChat(accountId: string, people: Person[]): HTMLElement {
  const thread = threads.get(accountId) ?? { messages: [], draft: null };
  threads.set(accountId, thread);

  const log = h('div', { className: 'chat-thread', 'aria-live': 'polite' });
  const input = h('textarea', {
    className: 'lb-input',
    id: 'log-chat-input',
    rows: '2',
    placeholder: 'What happened? e.g. "Called Ted, Maria picked up, call him back Monday." Paste an email too.',
    'aria-label': 'Describe the interaction',
  });
  const send = h('button', { type: 'submit', className: 'icon-btn is-primary', 'aria-label': 'Send' }, icon('send'));
  const mic = h('button', { type: 'button', className: 'icon-btn', 'aria-label': 'Record a voice note', hidden: !canRecord }, icon('mic'));
  const status = h('p', { className: 'lb-help', role: 'status' });
  const form = h('form', { className: 'chat-input' }, input, mic, send);

  const render = () => {
    log.replaceChildren(...thread.messages.map((m) => bubble(m.role, m.content)));
    if (thread.draft?.ready) log.append(draftCard(thread.draft, people, save));
  };

  async function ask(text: string): Promise<void> {
    thread.messages.push({ role: 'user', content: text });
    thread.draft = null;
    render();
    const thinking = bubble('assistant', 'Reading that…');
    log.append(thinking);
    send.disabled = true;
    try {
      const draft = await api.draftInteraction(accountId, thread.messages);
      thread.messages.push({ role: 'assistant', content: draft.reply });
      thread.draft = draft;
    } catch {
      thread.messages.pop();
      input.value = text;
      status.textContent = 'Could not reach the assistant. Try again.';
    } finally {
      send.disabled = false;
      render();
    }
  }

  async function save(draft: InteractionDraft): Promise<void> {
    const contactIds: number[] = [];
    for (const p of draft.people) {
      if (p.contactId) contactIds.push(p.contactId);
      else contactIds.push((await api.addContact(accountId, { name: p.name, role: p.role })).id);
    }
    threads.delete(accountId);
    await sync(
      api.logInteraction(accountId, {
        mode: draft.mode!,
        outcome: draft.outcome!,
        note: draft.note,
        contactIds,
        nextAction: draft.nextAction ?? undefined,
        dueDate: draft.dueDate ?? undefined,
      }),
    );
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || send.disabled) return;
    input.value = '';
    status.textContent = '';
    ask(text);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  let recorder: MediaRecorder | null = null;
  mic.addEventListener('click', async () => {
    if (recorder) return recorder.stop();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      status.textContent = 'Microphone access is blocked. Allow it in the browser to record.';
      return;
    }
    const chunks: Blob[] = [];
    const active = new MediaRecorder(stream);
    active.addEventListener('dataavailable', (e) => chunks.push(e.data));
    active.addEventListener('stop', async () => {
      stream.getTracks().forEach((t) => t.stop());
      recorder = null;
      setRecording(false);
      status.textContent = 'Transcribing…';
      try {
        const text = await api.transcribe(new Blob(chunks, { type: active.mimeType }));
        input.value = [input.value.trim(), text].filter(Boolean).join(' ');
        status.textContent = 'Check the text, then send.';
        input.focus();
      } catch {
        status.textContent = 'Could not transcribe that recording. Try again or type it.';
      }
    });
    recorder = active;
    active.start();
    setRecording(true);
  });

  function setRecording(on: boolean): void {
    mic.classList.toggle('is-recording', on);
    mic.replaceChildren(icon(on ? 'stop' : 'mic'));
    mic.setAttribute('aria-label', on ? 'Stop recording' : 'Record a voice note');
    if (on) status.textContent = 'Listening… tap stop when you are done.';
  }

  render();
  return h('div', { className: 'log-chat' }, log, form, status);
}

function bubble(role: ChatMessage['role'], text: string): HTMLElement {
  return h('p', { className: cx('assistant-msg', `is-${role}`) }, text);
}

/** What will be saved, at a glance, with one button to confirm. */
function draftCard(draft: InteractionDraft, people: Person[], save: (d: InteractionDraft) => Promise<void>): HTMLElement {
  const button = Button({ variant: 'primary', size: 'sm' }, 'Save to log');
  button.addEventListener('click', async () => {
    button.disabled = true;
    await save(draft);
  });
  const who: Child[] = draft.people.map((p) => {
    const known = people.find((k) => k.id === p.contactId);
    return h('span', { className: 'lb-cat' }, p.name, p.role && ` · ${p.role}`, !known && ' · new');
  });
  return h(
    'div',
    { className: 'draft-card' },
    h('div', { className: 'lb-cats' }, h('span', { className: 'lb-cat' }, MODE_LABEL[draft.mode!]), h('b', null, draft.outcome)),
    who.length > 0 && h('div', { className: 'lb-cats' }, h('span', { className: 'lb-muted' }, 'With'), who),
    draft.note && h('p', null, draft.note),
    draft.nextAction &&
      h('p', null, h('span', { className: 'lb-muted' }, 'Next: '), draft.nextAction, draft.dueDate && h('span', { className: 'lb-data' }, ` · ${formatDay(draft.dueDate)}`)),
    h('div', { className: 'draft-actions' }, button, h('span', { className: 'lb-help' }, 'or reply to change anything')),
  );
}

export function focusLogChat(): void {
  const input = document.getElementById('log-chat-input');
  input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  input?.focus({ preventScroll: true });
}
