import type { EventInput } from './botEventBus.js';

type ChromeBridgeEmbed = {
  author_name?: unknown;
  title?: unknown;
  description?: unknown;
  fields?: unknown;
  footer_text?: unknown;
};

export type ChromeBridgeMessage = {
  event_id?: unknown;
  channel_id?: unknown;
  channel_name?: unknown;
  channel_url?: unknown;
  author_id?: unknown;
  author_name?: unknown;
  content?: unknown;
  embeds?: unknown;
  url?: unknown;
  observed_at?: unknown;
  source?: unknown;
  bridge_target_id?: unknown;
  bridge_target_name?: unknown;
};

export type ChromeBridgeHeartbeat = {
  status?: unknown;
  bridge_enabled?: unknown;
  url?: unknown;
  channel_id?: unknown;
  channel_name?: unknown;
  channel_url?: unknown;
  observed_at?: unknown;
  last_forward_at?: unknown;
  last_forward_status?: unknown;
  bridge_target_id?: unknown;
  bridge_target_name?: unknown;
  details?: unknown;
};

export type ChromeBridgeEventInput = EventInput & {
  payload: Record<string, unknown>;
};

const DEFAULT_TARGET = 'tandem-suite';
const LOCAL_BRIDGE_ADDRESSES = new Set(['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1']);

function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : value === undefined || value === null ? fallback : String(value);
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function isLocalBridgeAddress(value: unknown) {
  const address = text(value).trim().toLowerCase();
  return LOCAL_BRIDGE_ADDRESSES.has(address);
}

function rawText(payload: ChromeBridgeMessage) {
  const parts = [text(payload.content)];
  const embeds = Array.isArray(payload.embeds) ? (payload.embeds as ChromeBridgeEmbed[]) : [];
  for (const embed of embeds) {
    parts.push(text(embed.author_name), text(embed.title), text(embed.description));
    const fields = Array.isArray(embed.fields) ? (embed.fields as Record<string, unknown>[]) : [];
    for (const field of fields) {
      parts.push(`${text(field.name)} ${text(field.value)}`);
    }
    parts.push(text(embed.footer_text));
  }
  return parts.map((part) => part.trim()).filter(Boolean).join('\n');
}

export function buildChromeBridgeMessageEvent(payload: ChromeBridgeMessage): ChromeBridgeEventInput {
  const bridgeTargetId = text(payload.bridge_target_id, DEFAULT_TARGET) || DEFAULT_TARGET;
  const source = text(payload.source, 'chrome-discord-bridge') || 'chrome-discord-bridge';
  return {
    event_type: 'signal.observed',
    source,
    target: bridgeTargetId,
    payload: {
      contract_version: 'chrome.discord.message.v1',
      event_id: text(payload.event_id),
      source,
      channel_id: text(payload.channel_id, 'chrome-visible-discord') || 'chrome-visible-discord',
      channel_name: text(payload.channel_name, 'chrome-visible-discord') || 'chrome-visible-discord',
      channel_url: text(payload.channel_url),
      url: text(payload.url),
      observed_at: text(payload.observed_at),
      bridge_target_id: bridgeTargetId,
      bridge_target_name: text(payload.bridge_target_name),
      author_id: text(payload.author_id),
      author_name: text(payload.author_name, 'Discord Chrome') || 'Discord Chrome',
      raw_text: rawText(payload),
    },
  };
}

export function buildChromeBridgeHealthEvent(payload: ChromeBridgeHeartbeat): ChromeBridgeEventInput {
  const bridgeTargetId = text(payload.bridge_target_id, DEFAULT_TARGET) || DEFAULT_TARGET;
  const status = text(payload.status, 'ok') || 'ok';
  const bridgeEnabled = Boolean(payload.bridge_enabled);
  return {
    event_type: 'bridge.health',
    source: 'chrome-discord-bridge',
    target: bridgeTargetId,
    payload: {
      status,
      bridge_enabled: bridgeEnabled,
      healthy: status === 'ok' && bridgeEnabled,
      url: text(payload.url),
      channel_id: text(payload.channel_id),
      channel_name: text(payload.channel_name),
      channel_url: text(payload.channel_url),
      observed_at: text(payload.observed_at, new Date().toISOString()),
      last_forward_at: text(payload.last_forward_at),
      last_forward_status: text(payload.last_forward_status),
      bridge_target_id: bridgeTargetId,
      bridge_target_name: text(payload.bridge_target_name),
      details: objectRecord(payload.details),
    },
  };
}
