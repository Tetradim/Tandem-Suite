import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type BotEvent = {
  schema_version: 'bot-event.v1';
  event_id: string;
  event_type: string;
  source: string;
  target?: string | null;
  created_at: string;
  payload: Record<string, unknown>;
};

export type EventInput = {
  event_type?: unknown;
  source?: unknown;
  target?: unknown;
  payload?: unknown;
};

const EVENT_SCHEMA_VERSION = 'bot-event.v1';

function nowUtc() {
  return new Date().toISOString();
}

function eventRoot() {
  return process.env.BOT_EVENT_BUS_DIR || path.resolve(process.cwd(), 'data', 'event-bus');
}

function eventPath(createdAt = nowUtc()) {
  return path.join(eventRoot(), `${createdAt.slice(0, 10)}.jsonl`);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function buildEvent(input: EventInput): BotEvent {
  const eventType = String(input.event_type || '').trim();
  if (!eventType) {
    throw new Error('event_type is required');
  }
  const target = input.target === undefined || input.target === null ? null : String(input.target);
  return {
    schema_version: EVENT_SCHEMA_VERSION,
    event_id: randomUUID(),
    event_type: eventType,
    source: String(input.source || 'tandem-suite'),
    target,
    created_at: nowUtc(),
    payload: asRecord(input.payload),
  };
}

export function publishEvent(input: EventInput): BotEvent & { path: string } {
  const event = buildEvent(input);
  const filePath = eventPath(event.created_at);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`, 'utf8');
  return { ...event, path: filePath };
}

export function listEvents(limit = 100, target?: string | null): BotEvent[] {
  const root = eventRoot();
  if (!fs.existsSync(root) || limit <= 0) {
    return [];
  }
  const files = fs
    .readdirSync(root)
    .filter((file) => file.endsWith('.jsonl'))
    .sort()
    .reverse();
  const events: BotEvent[] = [];
  for (const file of files) {
    const lines = fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/).filter(Boolean).reverse();
    for (const line of lines) {
      try {
        const event = JSON.parse(line) as BotEvent;
        if (target && event.target !== target && event.target !== null && event.target !== undefined) {
          continue;
        }
        events.push(event);
        if (events.length >= limit) {
          return events;
        }
      } catch {
        continue;
      }
    }
  }
  return events;
}
