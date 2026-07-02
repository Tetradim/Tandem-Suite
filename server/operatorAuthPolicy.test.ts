import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { evaluateOperatorAuthPolicy } from './operatorAuthPolicy.js';

test('operator auth is not required for default local development host', () => {
  const decision = evaluateOperatorAuthPolicy({
    host: '127.0.0.1',
    nodeEnv: 'development',
  });

  assert.deepEqual(decision, { allowed: true });
});

test('operator auth fails closed when Sentinel Core is bound to a non-local host', () => {
  const missing = evaluateOperatorAuthPolicy({
    host: '0.0.0.0',
    nodeEnv: 'development',
    providedSecret: 'operator-secret',
  });
  const wrong = evaluateOperatorAuthPolicy({
    host: '0.0.0.0',
    nodeEnv: 'development',
    expectedSecret: 'operator-secret',
    providedSecret: 'wrong-secret',
  });
  const allowed = evaluateOperatorAuthPolicy({
    host: '0.0.0.0',
    nodeEnv: 'development',
    expectedSecret: 'operator-secret',
    providedSecret: 'operator-secret',
  });

  assert.equal(missing.allowed, false);
  assert.equal(missing.status, 503);
  assert.match(missing.error, /operator secret.*configured/i);
  assert.equal(wrong.allowed, false);
  assert.equal(wrong.status, 401);
  assert.match(wrong.error, /operator secret/i);
  assert.deepEqual(allowed, { allowed: true });
});

test('operator auth is required in production even on localhost', () => {
  const decision = evaluateOperatorAuthPolicy({
    host: '127.0.0.1',
    nodeEnv: 'production',
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.status, 503);
});

test('sentinel-core API routes use operator auth middleware', () => {
  const source = fs.readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

  assert.match(source, /requireOperatorAccess/);
  assert.match(source, /X-Sentinel-Core-Operator-Secret/);
  assert.match(source, /app\.use\('\/api', requireOperatorAccess\)/);
});
