import type { SuiteConfig, SuiteSnapshot } from './types';

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    headers: {
      Accept: 'application/json',
    },
  });

  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    const detail = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).error : undefined;
    throw new Error(typeof detail === 'string' ? detail : `${response.status} ${response.statusText}`);
  }

  return payload as T;
}

export function loadSuiteConfig() {
  return requestJson<SuiteConfig>('/api/tandem/config');
}

export function loadSuiteSnapshot() {
  return requestJson<SuiteSnapshot>('/api/tandem/snapshot');
}
