import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { evaluateBusIngressPolicy } from './busIngressPolicy.js';

test('bus ingress is disabled unless explicitly enabled', () => {
  const decision = evaluateBusIngressPolicy({
    event: { event_type: 'signal.observed' },
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.status, 403);
  assert.match(decision.error, /disabled/i);
});

test('bus ingress fails closed when secret is missing or invalid', () => {
  const missingConfig = evaluateBusIngressPolicy({
    enabled: 'true',
    providedSecret: 'operator-secret',
    event: { event_type: 'signal.observed' },
  });
  const invalidSecret = evaluateBusIngressPolicy({
    enabled: 'true',
    expectedSecret: 'operator-secret',
    providedSecret: 'wrong-secret',
    event: { event_type: 'signal.observed' },
  });

  assert.equal(missingConfig.allowed, false);
  assert.equal(missingConfig.status, 503);
  assert.match(missingConfig.error, /secret.*configured/i);
  assert.equal(invalidSecret.allowed, false);
  assert.equal(invalidSecret.status, 401);
  assert.match(invalidSecret.error, /secret/i);
});

test('bus ingress allows only observer telemetry events', () => {
  const allowed = evaluateBusIngressPolicy({
    enabled: 'true',
    expectedSecret: 'operator-secret',
    providedSecret: 'operator-secret',
    event: { event_type: 'signal.observed' },
  });
  const blocked = evaluateBusIngressPolicy({
    enabled: 'true',
    expectedSecret: 'operator-secret',
    providedSecret: 'operator-secret',
    event: { event_type: 'order.submitted' },
  });

  assert.deepEqual(allowed, { allowed: true });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.status, 403);
  assert.match(blocked.error, /observer/i);
});

test('bus ingress blocks observer telemetry carrying structured execution controls', () => {
  const decision = evaluateBusIngressPolicy({
    enabled: 'true',
    expectedSecret: 'operator-secret',
    providedSecret: 'operator-secret',
    event: {
      event_type: 'signal.observed',
      payload: {
        raw_text: '$QQQ breakout alert',
        command: 'start',
        risk: { trailing_stop: true },
      },
    },
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.status, 403);
  assert.match(decision.error, /execution|control|directive/i);
});

test('sentinel-core direct bus route uses the ingress policy before publish', () => {
  const source = fs.readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

  assert.match(source, /evaluateBusIngressPolicy/);
  assert.match(source, /X-Sentinel-Core-Bus-Secret/);
});
