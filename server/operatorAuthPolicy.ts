import { timingSafeEqual } from 'node:crypto';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export type OperatorAuthPolicyDecision =
  | { allowed: true }
  | { allowed: false; status: number; error: string };

function normalizedHost(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export function sentinelCoreRequiresOperatorAuth(input: {
  host?: unknown;
  nodeEnv?: unknown;
}) {
  const nodeEnv = normalizedHost(input.nodeEnv);
  if (nodeEnv === 'production') {
    return true;
  }
  const host = normalizedHost(input.host);
  return Boolean(host) && !LOCAL_HOSTS.has(host);
}

export function evaluateOperatorAuthPolicy(input: {
  host?: unknown;
  nodeEnv?: unknown;
  expectedSecret?: unknown;
  providedSecret?: unknown;
}): OperatorAuthPolicyDecision {
  if (!sentinelCoreRequiresOperatorAuth({ host: input.host, nodeEnv: input.nodeEnv })) {
    return { allowed: true };
  }

  const expectedSecret = String(input.expectedSecret || '').trim();
  if (!expectedSecret) {
    return { allowed: false, status: 503, error: 'Sentinel Core operator secret is not configured.' };
  }

  const providedSecret = String(input.providedSecret || '').trim();
  const expected = Buffer.from(expectedSecret, 'utf8');
  const provided = Buffer.from(providedSecret, 'utf8');
  if (!providedSecret || expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return { allowed: false, status: 401, error: 'Sentinel Core operator secret is missing or invalid.' };
  }

  return { allowed: true };
}
