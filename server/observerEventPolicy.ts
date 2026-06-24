const EXECUTION_CONTROL_KEYS = new Set([
  'action',
  'broker',
  'broker_order_id',
  'command',
  'command_type',
  'cooldown',
  'daily_loss_limit',
  'directive',
  'disable_trading',
  'enable_trading',
  'execution',
  'execution_intent',
  'handoff',
  'intent',
  'kill_switch',
  'limit_price',
  'live_trade',
  'live_trading',
  'max_daily_loss',
  'max_order_size',
  'max_position',
  'notional',
  'order',
  'order_id',
  'order_type',
  'orders',
  'qty',
  'quantity',
  'risk',
  'risk_control',
  'risk_controls',
  'shares',
  'side',
  'start',
  'stop',
  'stop_loss',
  'stop_price',
  'take_profit',
  'trade',
  'trailing_enabled',
  'trailing_percent',
  'trailing_stop',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function normalizedKey(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function findExecutionControlKey(value: unknown): string | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  for (const [key, child] of Object.entries(record)) {
    const normalized = normalizedKey(key);
    if (EXECUTION_CONTROL_KEYS.has(normalized)) {
      return key;
    }
    const nested = findExecutionControlKey(child);
    if (nested) {
      return nested;
    }
  }

  return null;
}

export function observerEventControlDirectiveError(event: unknown): string | null {
  const key = findExecutionControlKey(event);
  return key ? `observer events cannot carry structured execution or control directives (${key})` : null;
}
