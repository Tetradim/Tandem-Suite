import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('repository package uses the Sentinel Core identity', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    name?: string;
  };

  assert.equal(packageJson.name, 'sentinel-core');
});

test('static shell title uses Sentinel Core', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /<title>Sentinel Core<\/title>/);
});
