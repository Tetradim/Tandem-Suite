import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('sentinel-core server binds to a resolved host instead of all interfaces by default', () => {
  const source = fs.readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

  assert.match(source, /resolveListenHost/);
  assert.match(source, /app\.listen\(port,\s*host,/);
  assert.doesNotMatch(source, /app\.listen\(port\)/);
});

test('local dev dashboard does not expose the API proxy on all interfaces by default', () => {
  const packageJson = fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  const viteConfig = fs.readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(packageJson, /vite --host 0\.0\.0\.0/);
  assert.doesNotMatch(viteConfig, /host:\s*['"]0\.0\.0\.0['"]/);
});

test('local dotenv values do not override explicit process env', () => {
  const source = fs.readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /dotenv\.config\(\{\s*path:\s*['"]\.env\.local['"],\s*override:\s*true\s*\}\)/);
});

test('broker account mirrors use the slow upstream timeout', () => {
  const source = fs.readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

  assert.match(source, /SLOW_REQUEST_TIMEOUT_MS/);
  assert.match(source, /edgeSlow<Record<string, unknown>>\('\/api\/pulse\/account'\)/);
  assert.match(source, /pulseEdgeSlow<PulseAccount>\('\/api\/edge\/account\/status'\)/);
  assert.match(source, /pulseEdgeSlow<AnyPayload>\('\/api\/edge\/orders'\)/);
});
