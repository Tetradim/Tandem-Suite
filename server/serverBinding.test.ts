import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('tandem server binds to a resolved host instead of all interfaces by default', () => {
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
