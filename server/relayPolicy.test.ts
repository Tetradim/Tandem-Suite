import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { evaluateRelayPolicy } from './relayPolicy.js';

test('relay policy is disabled unless explicitly enabled', () => {
  const decision = evaluateRelayPolicy({
    targetService: 'pulse',
    endpoint: '/api/edge/handoff',
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.status, 403);
  assert.match(decision.error, /disabled/i);
});

test('relay policy only allows exact bus-event relay endpoints when enabled', () => {
  const allowed = evaluateRelayPolicy({
    enabled: 'true',
    expectedSecret: 'operator-secret',
    providedSecret: 'operator-secret',
    targetService: 'edge',
    endpoint: '/api/bus/events',
    event: { event_type: 'signal.observed' },
  } as Parameters<typeof evaluateRelayPolicy>[0]);
  const rejected = evaluateRelayPolicy({
    enabled: 'true',
    expectedSecret: 'operator-secret',
    providedSecret: 'operator-secret',
    targetService: 'pulse',
    endpoint: '/api/edge/handoff',
    event: { event_type: 'signal.observed' },
  } as Parameters<typeof evaluateRelayPolicy>[0]);

  assert.deepEqual(allowed, { allowed: true, target: 'edge', endpoint: '/api/bus/events' });
  assert.equal(rejected.allowed, false);
  assert.equal(rejected.status, 403);
  assert.match(rejected.error, /allowlisted/i);
});

test('relay policy fails closed when relay secret is not configured', () => {
  const decision = evaluateRelayPolicy({
    enabled: 'true',
    providedSecret: 'operator-secret',
    targetService: 'edge',
    endpoint: '/api/bus/events',
    event: { event_type: 'signal.observed' },
  } as Parameters<typeof evaluateRelayPolicy>[0]);

  assert.equal(decision.allowed, false);
  assert.equal(decision.status, 503);
  assert.match(decision.error, /secret.*configured/i);
});

test('relay policy requires a matching relay secret before observer relay', () => {
  const rejected = evaluateRelayPolicy({
    enabled: 'true',
    expectedSecret: 'operator-secret',
    providedSecret: 'wrong-secret',
    targetService: 'edge',
    endpoint: '/api/bus/events',
    event: { event_type: 'signal.observed' },
  } as Parameters<typeof evaluateRelayPolicy>[0]);
  const allowed = evaluateRelayPolicy({
    enabled: 'true',
    expectedSecret: 'operator-secret',
    providedSecret: 'operator-secret',
    targetService: 'edge',
    endpoint: '/api/bus/events',
    event: { event_type: 'signal.observed' },
  } as Parameters<typeof evaluateRelayPolicy>[0]);

  assert.equal(rejected.allowed, false);
  assert.equal(rejected.status, 401);
  assert.match(rejected.error, /secret/i);
  assert.deepEqual(allowed, { allowed: true, target: 'edge', endpoint: '/api/bus/events' });
});

test('relay policy blocks execution and handoff shaped bus events', () => {
  for (const eventType of ['pulse.handoff.requested', 'order.submitted', 'execution.buy', 'trade.sell']) {
    const decision = evaluateRelayPolicy({
      enabled: 'true',
      expectedSecret: 'operator-secret',
      providedSecret: 'operator-secret',
      targetService: 'edge',
      endpoint: '/api/bus/events',
      event: { event_type: eventType },
    } as Parameters<typeof evaluateRelayPolicy>[0]);

    assert.equal(decision.allowed, false);
    assert.equal(decision.status, 403);
    assert.match(decision.error, /observer/i);
  }
});

test('relay policy allows only observer bus events when enabled', () => {
  for (const eventType of ['signal.observed', 'bridge.health']) {
    const decision = evaluateRelayPolicy({
      enabled: 'true',
      expectedSecret: 'operator-secret',
      providedSecret: 'operator-secret',
      targetService: 'edge',
      endpoint: '/api/bus/events',
      event: { event_type: eventType },
    } as Parameters<typeof evaluateRelayPolicy>[0]);

    assert.deepEqual(decision, { allowed: true, target: 'edge', endpoint: '/api/bus/events' });
  }
});

test('relay policy blocks observer events carrying structured execution directives', () => {
  const decision = evaluateRelayPolicy({
    enabled: 'true',
    expectedSecret: 'operator-secret',
    providedSecret: 'operator-secret',
    targetService: 'edge',
    endpoint: '/api/bus/events',
    event: {
      event_type: 'signal.observed',
      payload: {
        raw_text: '$SPY alert from Discord',
        side: 'buy',
        qty: 1,
        trailing_stop: true,
      },
    },
  } as Parameters<typeof evaluateRelayPolicy>[0]);

  assert.equal(decision.allowed, false);
  assert.equal(decision.status, 403);
  assert.match(decision.error, /execution|control|directive/i);
});

test('tandem pulse relay route is wired to server-side pulse auth headers', () => {
  const source = fs.readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

  assert.match(source, /pulseEdgeHeaders\(\)/);
  assert.match(source, /pulse relay requires PULSE_EDGE_API_KEY/i);
});

test('tandem snapshot reads Pulse operational data through Edge-authenticated routes', () => {
  const source = fs.readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

  for (const endpoint of [
    '/api/edge/bot/status',
    '/api/edge/bot/snapshot',
    '/api/edge/trades',
    '/api/edge/positions',
    '/api/edge/positions/pending-sells',
    '/api/edge/brokers/status',
    '/api/edge/strategies/registry',
    '/api/edge/strategies/presets',
    '/api/edge/markets',
    '/api/edge/fx-rates',
    '/api/edge/replay/status',
    '/api/edge/replay/sessions',
    '/api/edge/rate-limits',
    '/api/edge/audit-logs',
    '/api/edge/settings',
    '/api/edge/risk/status',
    '/api/edge/risk/limits',
    '/api/edge/reconciliation/summary',
    '/api/edge/portfolio/stats',
    '/api/edge/orders',
    '/api/edge/orders/stats',
    '/api/edge/analytics/portfolio',
    '/api/edge/ops/services',
    '/api/edge/slo/summary',
  ]) {
    assert.match(source, new RegExp(`pulseEdge<[^>]+>\\('${endpoint.replace(/\//g, '\\/')}'\\)`));
  }

  for (const endpoint of [
    '/api/bot/status',
    '/api/bot/snapshot',
    '/api/trades',
    '/api/positions',
    '/api/positions/pending-sells',
    '/api/brokers/status',
    '/api/strategies/registry',
    '/api/strategies/presets',
    '/api/markets',
    '/api/fx-rates',
    '/api/replay/status',
    '/api/replay/sessions',
    '/api/rate-limits',
    '/api/audit-logs',
    '/api/settings',
    '/api/risk/status',
    '/api/risk/limits',
    '/api/reconciliation/summary',
    '/api/portfolio/stats',
    '/api/orders',
    '/api/orders/stats',
    '/api/analytics/portfolio',
    '/api/ops/services',
    '/api/slo/summary',
  ]) {
    assert.doesNotMatch(source, new RegExp(`pulse\\('${endpoint.replace(/\//g, '\\/')}'\\)`));
  }
});
