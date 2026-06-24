import { timingSafeEqual } from 'node:crypto';
import { observerEventControlDirectiveError } from './observerEventPolicy.js';

const SAFE_RELAY_ENDPOINTS = new Set(['/api/bus/events']);
const SAFE_RELAY_TARGETS = new Set(['edge', 'pulse']);
const SAFE_RELAY_EVENT_TYPES = new Set(['signal.observed', 'bridge.health']);

export type RelayPolicyDecision =
  | { allowed: true; target: 'edge' | 'pulse'; endpoint: string }
  | { allowed: false; status: number; error: string };

export function envFlagEnabled(value: string | undefined) {
  return String(value || '').trim().toLowerCase().match(/^(1|true|yes|on)$/) !== null;
}

export function evaluateRelayPolicy(input: {
  enabled?: string;
  expectedSecret?: unknown;
  providedSecret?: unknown;
  targetService?: unknown;
  target_service?: unknown;
  endpoint?: unknown;
  event?: unknown;
}): RelayPolicyDecision {
  if (!envFlagEnabled(input.enabled)) {
    return {
      allowed: false,
      status: 403,
      error: 'Tandem relay is disabled; set TANDEM_RELAY_ENABLED=true to allow safe bus-event relay.',
    };
  }

  const expectedSecret = String(input.expectedSecret || '').trim();
  if (!expectedSecret) {
    return { allowed: false, status: 503, error: 'Tandem relay secret is not configured.' };
  }
  const providedSecret = String(input.providedSecret || '').trim();
  const expected = Buffer.from(expectedSecret, 'utf8');
  const provided = Buffer.from(providedSecret, 'utf8');
  if (!providedSecret || expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return { allowed: false, status: 401, error: 'Tandem relay secret is missing or invalid.' };
  }

  const target = String(input.targetService || input.target_service || '').trim().toLowerCase();
  if (!SAFE_RELAY_TARGETS.has(target)) {
    return { allowed: false, status: 400, error: 'targetService must be edge or pulse' };
  }

  const endpoint = String(input.endpoint || '/api/bus/events').trim();
  if (!SAFE_RELAY_ENDPOINTS.has(endpoint)) {
    return { allowed: false, status: 403, error: 'relay endpoint is not allowlisted' };
  }

  const event = input.event && typeof input.event === 'object' && !Array.isArray(input.event) ? input.event as Record<string, unknown> : {};
  const eventType = String(event.event_type || '').trim();
  if (!SAFE_RELAY_EVENT_TYPES.has(eventType)) {
    return { allowed: false, status: 403, error: 'relay only allows observer bus events' };
  }
  const controlDirectiveError = observerEventControlDirectiveError(event);
  if (controlDirectiveError) {
    return { allowed: false, status: 403, error: controlDirectiveError };
  }

  return { allowed: true, target: target as 'edge' | 'pulse', endpoint };
}
