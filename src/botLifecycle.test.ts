import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeExecutionLifecycle } from './botLifecycle.js';

test('labels an Edge handoff request separately from Pulse execution', () => {
  const lifecycle = normalizeExecutionLifecycle({
    intent_id: 'intent-1',
    handoff_status: 'requested',
    symbol: 'SPY',
  });

  assert.equal(lifecycle.phase, 'requested');
  assert.equal(lifecycle.owner, 'Sentinel Edge');
  assert.equal(lifecycle.title, 'Edge requested');
  assert.match(lifecycle.note, /not a Pulse execution/i);
});

test('labels Pulse lifecycle states without collapsing them into filled', () => {
  assert.equal(normalizeExecutionLifecycle({ status: 'accepted' }).title, 'Pulse accepted');
  assert.equal(normalizeExecutionLifecycle({ status: 'submitted' }).title, 'Pulse submitted');
  assert.equal(normalizeExecutionLifecycle({ status: 'filled', broker_order_id: 'alpaca-123' }).title, 'Pulse filled');
  assert.equal(normalizeExecutionLifecycle({ status: 'rejected' }).title, 'Pulse rejected');
});

test('requires broker evidence before a filled label looks complete', () => {
  const unconfirmed = normalizeExecutionLifecycle({ status: 'filled' });
  const confirmed = normalizeExecutionLifecycle({ status: 'filled', broker_order_id: 'alpaca-123' });

  assert.equal(unconfirmed.phase, 'submitted');
  assert.equal(unconfirmed.title, 'Pulse submitted');
  assert.match(unconfirmed.note, /broker order id/i);
  assert.equal(confirmed.phase, 'filled');
  assert.equal(confirmed.title, 'Pulse filled');
  assert.equal(confirmed.tone, 'good');
});
