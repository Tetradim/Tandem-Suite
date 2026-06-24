import type { ServiceTone } from './types';

export type ExecutionLifecyclePhase = 'pending' | 'requested' | 'accepted' | 'submitted' | 'filled' | 'rejected';

export type ExecutionLifecycle = {
  phase: ExecutionLifecyclePhase;
  owner: 'Sentinel Edge' | 'Sentinel Pulse' | 'Tandem';
  title: string;
  note: string;
  tone: ServiceTone;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : value === undefined || value === null ? '' : String(value).trim();
}

function normalizedStatus(handoff: Record<string, unknown>) {
  const candidates = [
    handoff.status,
    handoff.handoff_status,
    handoff.execution_status,
    handoff.order_status,
    asRecord(handoff.execution_report).status,
    asRecord(handoff.report).status,
    asRecord(handoff.pulse_report).status,
    asRecord(handoff.payload).status,
  ];
  return text(candidates.find((candidate) => text(candidate))).toLowerCase().replace(/[\s-]+/g, '_');
}

function brokerOrderId(handoff: Record<string, unknown>) {
  const candidates = [
    handoff.broker_order_id,
    handoff.brokerOrderId,
    handoff.external_order_id,
    asRecord(handoff.execution_report).broker_order_id,
    asRecord(handoff.report).broker_order_id,
    asRecord(handoff.pulse_report).broker_order_id,
    asRecord(handoff.payload).broker_order_id,
  ];
  return text(candidates.find((candidate) => text(candidate)));
}

function handoffSymbol(handoff: Record<string, unknown>) {
  return text(handoff.symbol || asRecord(handoff.execution_intent).symbol || asRecord(handoff.payload).symbol);
}

function rejectReason(handoff: Record<string, unknown>) {
  return text(handoff.reject_reason || handoff.error || handoff.reason || asRecord(handoff.execution_report).reject_reason || asRecord(handoff.payload).reject_reason);
}

function requestedLifecycle(handoff: Record<string, unknown>): ExecutionLifecycle {
  const symbol = handoffSymbol(handoff);
  return {
    phase: 'requested',
    owner: 'Sentinel Edge',
    title: 'Edge requested',
    note: `Edge requested Pulse action${symbol ? ` for ${symbol}` : ''}; not a Pulse execution or broker fill.`,
    tone: 'neutral',
  };
}

export function normalizeExecutionLifecycle(handoff?: Record<string, unknown> | null): ExecutionLifecycle {
  const record = asRecord(handoff);
  if (!Object.keys(record).length) {
    return {
      phase: 'pending',
      owner: 'Tandem',
      title: 'No handoff',
      note: 'No Edge-to-Pulse handoff has been reported.',
      tone: 'warn',
    };
  }

  const status = normalizedStatus(record);
  if (!status || status === 'requested' || status === 'queued' || status === 'recorded') {
    return requestedLifecycle(record);
  }

  if (status === 'accepted') {
    return {
      phase: 'accepted',
      owner: 'Sentinel Pulse',
      title: 'Pulse accepted',
      note: 'Pulse accepted the Edge intent; broker submission is still pending.',
      tone: 'neutral',
    };
  }

  if (status === 'submitted' || status === 'partial' || status === 'partially_filled') {
    return {
      phase: 'submitted',
      owner: 'Sentinel Pulse',
      title: 'Pulse submitted',
      note: 'Pulse submitted the order path; Tandem is waiting for a broker-confirmed fill report.',
      tone: 'neutral',
    };
  }

  if (status === 'filled') {
    const id = brokerOrderId(record);
    if (!id) {
      return {
        phase: 'submitted',
        owner: 'Sentinel Pulse',
        title: 'Pulse submitted',
        note: 'Pulse reported filled without a broker order id; waiting for broker-confirmed ExecutionReport.',
        tone: 'warn',
      };
    }
    return {
      phase: 'filled',
      owner: 'Sentinel Pulse',
      title: 'Pulse filled',
      note: `Broker-confirmed fill reported by Pulse (${id}).`,
      tone: 'good',
    };
  }

  if (status === 'rejected' || status === 'failed' || status === 'blocked') {
    const reason = rejectReason(record);
    return {
      phase: 'rejected',
      owner: 'Sentinel Pulse',
      title: 'Pulse rejected',
      note: reason ? `Pulse rejected the intent: ${reason}` : 'Pulse rejected or blocked the intent.',
      tone: 'bad',
    };
  }

  return requestedLifecycle(record);
}
