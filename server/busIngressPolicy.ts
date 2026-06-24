import { timingSafeEqual } from 'node:crypto';
import { observerEventControlDirectiveError } from './observerEventPolicy.js';

const SAFE_INGRESS_EVENT_TYPES = new Set(['signal.observed', 'bridge.health']);

export type BusIngressPolicyDecision =
  | { allowed: true }
  | { allowed: false; status: number; error: string };

export function busIngressFlagEnabled(value: string | undefined) {
  return String(value || '').trim().toLowerCase().match(/^(1|true|yes|on)$/) !== null;
}

export function evaluateBusIngressPolicy(input: {
  enabled?: string;
  expectedSecret?: unknown;
  providedSecret?: unknown;
  event?: unknown;
}): BusIngressPolicyDecision {
  if (!busIngressFlagEnabled(input.enabled)) {
    return {
      allowed: false,
      status: 403,
      error: 'Tandem bus ingress is disabled; set TANDEM_BUS_INGRESS_ENABLED=true to allow observer telemetry writes.',
    };
  }

  const expectedSecret = String(input.expectedSecret || '').trim();
  if (!expectedSecret) {
    return { allowed: false, status: 503, error: 'Tandem bus ingress secret is not configured.' };
  }

  const providedSecret = String(input.providedSecret || '').trim();
  const expected = Buffer.from(expectedSecret, 'utf8');
  const provided = Buffer.from(providedSecret, 'utf8');
  if (!providedSecret || expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return { allowed: false, status: 401, error: 'Tandem bus ingress secret is missing or invalid.' };
  }

  const event = input.event && typeof input.event === 'object' && !Array.isArray(input.event) ? input.event as Record<string, unknown> : {};
  const eventType = String(event.event_type || '').trim();
  if (!SAFE_INGRESS_EVENT_TYPES.has(eventType)) {
    return { allowed: false, status: 403, error: 'bus ingress only allows observer telemetry events' };
  }
  const controlDirectiveError = observerEventControlDirectiveError(event);
  if (controlDirectiveError) {
    return { allowed: false, status: 403, error: controlDirectiveError };
  }

  return { allowed: true };
}
