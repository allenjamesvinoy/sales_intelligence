import type { LeadsResponse } from '../types';
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

export function httpApi(baseUrl: string): Api {
  return {
    getLeads: () => request<LeadsResponse>(baseUrl, '/leads'),
    updateStage: (id, stage) =>
      request(baseUrl, `/leads/${encodeURIComponent(id)}/stage`, { method: 'PUT', body: JSON.stringify({ stage }) }),
    recordActivity: (id, entry) =>
      request(baseUrl, `/leads/${encodeURIComponent(id)}/activity`, { method: 'POST', body: JSON.stringify(entry) }),
  };
}
