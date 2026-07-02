import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('Windows launcher supports installed and source modes', () => {
  const batch = read('Launch-Sentinel-Core.bat');
  const script = read('Launch-Sentinel-Core.ps1');

  assert.match(batch, /Launch-Sentinel-Core\.ps1/);
  assert.match(batch, /SentinelCore-Setup/);
  assert.match(batch.toLowerCase(), /if not exist/);
  assert.match(batch, /%\*/);
  assert.match(script, /Sentinel Core - Installed App/);
  assert.match(script, /runtime\\node\.exe/);
  assert.match(script, /Start-InstalledSentinelCore/);
  assert.match(script, /Start-SourceSentinelCore/);
  assert.match(script, /Ensure-InstalledRuntimeDependencies/);
  assert.match(script, /Test-VcRuntimeInstalled/);
  assert.match(script, /vc_redist\.x64\.exe/);
  assert.match(script, /api\/sentinel-core\/snapshot/);
});

test('Windows workflow packages bundled Node installer', () => {
  const workflow = read('.github/workflows/build.yml');

  assert.match(workflow, /Build Sentinel Core Windows Installer/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /runtime\\node\.exe/);
  assert.match(workflow, /dist-server\\server\\index\.js/);
  assert.match(workflow, /Launch-Sentinel-Core\.bat/);
  assert.match(workflow, /Launch-Sentinel-Core\.ps1/);
  assert.match(workflow, /SentinelCore-Setup-\{#MyAppVersion\}/);
  assert.match(workflow, /Filename: "\{app\}\\Launch-Sentinel-Core\.bat"/);
  assert.match(workflow, /Minionguyjpro\/Inno-Setup-Action/);
});

test('README documents beta installer first-run behavior', () => {
  const readme = read('README.md');

  assert.match(readme, /SentinelCore-Setup-<version>\.exe/);
  assert.match(readme, /downloads missing runtime dependencies on first launch/);
  assert.match(readme, /Visual C\+\+ Runtime/);
  assert.match(readme, /Sentinel-Core\.log/);
  assert.match(readme, /Node\.js, npm, or Vite/);
});
