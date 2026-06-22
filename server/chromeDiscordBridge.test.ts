import assert from 'node:assert/strict';
import test from 'node:test';

import { buildChromeBridgeHealthEvent, buildChromeBridgeMessageEvent, isLocalBridgeAddress } from './chromeDiscordBridge.js';

test('buildChromeBridgeMessageEvent maps Discord payload to signal.observed bus event', () => {
  const event = buildChromeBridgeMessageEvent({
    event_id: 'tandem-chrome-1',
    channel_id: '123',
    channel_name: 'mike-alerts',
    channel_url: 'https://discord.com/channels/1/123',
    bridge_target_id: 'tandem-suite',
    bridge_target_name: 'Tandem Suite',
    author_name: 'MikeInvesting [MIKE]',
    content: '$SPY\n$744 PUTS\nEXPIRATION 6/22/2026\n$.4 Entry\n@everyone alert',
    observed_at: '2026-06-22T14:23:00+00:00',
  });

  assert.equal(event.event_type, 'signal.observed');
  assert.equal(event.source, 'chrome-discord-bridge');
  assert.equal(event.target, 'tandem-suite');
  assert.equal(event.payload.contract_version, 'chrome.discord.message.v1');
  assert.equal(event.payload.bridge_target_id, 'tandem-suite');
  assert.match(String(event.payload.raw_text), /\$SPY/);
});

test('buildChromeBridgeHealthEvent preserves target metadata', () => {
  const event = buildChromeBridgeHealthEvent({
    status: 'ok',
    bridge_enabled: true,
    channel_id: '123',
    channel_url: 'https://discord.com/channels/1/123',
    bridge_target_id: 'tandem-suite',
    observed_at: '2026-06-22T14:23:30+00:00',
  });

  assert.equal(event.event_type, 'bridge.health');
  assert.equal(event.source, 'chrome-discord-bridge');
  assert.equal(event.target, 'tandem-suite');
  assert.equal(event.payload.bridge_target_id, 'tandem-suite');
  assert.equal(event.payload.healthy, true);
});

test('isLocalBridgeAddress only accepts loopback callers', () => {
  assert.equal(isLocalBridgeAddress('127.0.0.1'), true);
  assert.equal(isLocalBridgeAddress('::1'), true);
  assert.equal(isLocalBridgeAddress('::ffff:127.0.0.1'), true);
  assert.equal(isLocalBridgeAddress('192.168.1.25'), false);
});
