import type { AccountDetail, LeadsResponse, Person, Profile } from '../types';
import type { Api } from './index';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw new ApiError(res.status, `${init?.method ?? 'GET'} ${path} failed with ${res.status}`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

const account = (id: string) => `/accounts/${encodeURIComponent(id)}`;

export function httpApi(baseUrl: string): Api {
  return {
    getLeads: () => request<LeadsResponse>(baseUrl, '/leads'),
    updateStage: (id, stage, order) =>
      request(baseUrl, `/leads/${encodeURIComponent(id)}/stage`, { method: 'PUT', body: JSON.stringify({ stage, order }) }),
    getAccount: (id) => request<AccountDetail>(baseUrl, account(id)),
    logInteraction: (id, input) =>
      request(baseUrl, `${account(id)}/interactions`, { method: 'POST', body: JSON.stringify(input) }),
    addContact: (id, person) => request<Person>(baseUrl, `${account(id)}/contacts`, { method: 'POST', body: JSON.stringify(person) }),
    updateContact: (id, contactId, person) =>
      request<Person>(baseUrl, `${account(id)}/contacts/${contactId}`, { method: 'PUT', body: JSON.stringify(person) }),
    convertToOpportunity: (id, note) =>
      request(baseUrl, `${account(id)}/opportunity`, { method: 'POST', body: JSON.stringify({ note }) }),
    askAssistant: async (messages, contractorId) =>
      (await request<{ reply: string }>(baseUrl, '/assistant', { method: 'POST', body: JSON.stringify({ messages, contractorId }) })).reply,
    updateNextAction: (id, nextAction, dueDate) =>
      request(baseUrl, `${account(id)}/next-action`, { method: 'PUT', body: JSON.stringify({ nextAction, dueDate }) }),
    getProfile: () => request<Profile>(baseUrl, '/me'),
    updateTerritory: (postalCode, radiusMiles) =>
      request(baseUrl, '/me/territory', { method: 'PUT', body: JSON.stringify({ postalCode, radiusMiles }) }),
  };
}
