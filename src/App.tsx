import React from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  RadioTower,
  ShieldCheck,
  ShieldQuestion,
  TrendingUp,
} from 'lucide-react';
import { loadSuiteSnapshot } from './api';
import type {
  EdgeDecisionFeed,
  PulseAccount,
  PulsePosition,
  PulseTicker,
  PulseTickerResponse,
  ServiceResult,
  ServiceTone,
  SuiteSnapshot,
} from './types';

function formatMoney(value: unknown) {
  const number = numberFrom(value);
  if (!Number.isFinite(number)) return 'Unavailable';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(number);
}

function formatPct(value: unknown) {
  const number = numberFrom(value);
  if (!Number.isFinite(number)) return 'Unavailable';
  return `${number.toFixed(2)}%`;
}

function formatNumber(value: unknown) {
  const number = numberFrom(value);
  if (!Number.isFinite(number)) return 'Unavailable';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(number);
}

function numberFrom(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function serviceTone(service?: ServiceResult<unknown>): ServiceTone {
  if (!service) return 'pending';
  return service.ok ? 'good' : 'bad';
}

function decisionList(feed?: EdgeDecisionFeed) {
  if (!feed) return [];
  if (Array.isArray(feed.decisions)) return feed.decisions;
  if (Array.isArray(feed.entries)) return feed.entries;
  if (Array.isArray(feed.data)) return feed.data;
  const nested = asRecord(feed.data);
  if (Array.isArray(nested.decisions)) return nested.decisions as Array<Record<string, unknown>>;
  if (Array.isArray(nested.entries)) return nested.entries as Array<Record<string, unknown>>;
  return [];
}

function latestDecision(snapshot: SuiteSnapshot | null) {
  return decisionList(snapshot?.edgeDecisions.data)[0] ?? null;
}

function normalizeAccount(account?: PulseAccount) {
  const accountRecord = asRecord(account);
  const nested = asRecord(account?.account);
  return { ...nested, ...accountRecord } as PulseAccount;
}

function extractPositions(value: unknown): PulsePosition[] {
  if (Array.isArray(value)) return value as PulsePosition[];
  const record = asRecord(value);
  const nestedAccount = asRecord(record.account);
  const candidates = [record.positions, record.data, record.results, nestedAccount.positions, nestedAccount.data];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as PulsePosition[];
    const candidateRecord = asRecord(candidate);
    if (Array.isArray(candidateRecord.positions)) return candidateRecord.positions as PulsePosition[];
  }
  return [];
}

function extractTickers(value?: PulseTickerResponse): PulseTicker[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (Array.isArray(record.tickers)) return record.tickers as PulseTicker[];
  if (Array.isArray(record.data)) return record.data as PulseTicker[];
  if (Array.isArray(record.results)) return record.results as PulseTicker[];
  return [];
}

function positionQuantity(position: PulsePosition) {
  return numberFrom(position.qty ?? position.quantity ?? 0);
}

function priceFromPosition(position?: PulsePosition | null) {
  return numberFrom(position?.current_price ?? position?.market_price ?? position?.last_price ?? position?.entry_price ?? position?.avg_entry ?? position?.average_entry);
}

function entryFromPosition(position?: PulsePosition | null) {
  return numberFrom(position?.entry_price ?? position?.avg_entry ?? position?.average_entry);
}

function positionPnl(position: PulsePosition) {
  return numberFrom(position.pnl ?? position.unrealized_pnl ?? 0);
}

function positionPnlPct(position: PulsePosition) {
  return numberFrom(position.pnl_pct ?? position.unrealized_pnl_pct ?? 0);
}

function choosePrimaryPosition(positions: PulsePosition[]) {
  return positions
    .filter((position) => positionQuantity(position) > 0)
    .sort((a, b) => Math.abs(positionPnl(b)) - Math.abs(positionPnl(a)))[0] ?? null;
}

function countProtected(positions: PulsePosition[], tickers: PulseTicker[]) {
  const protectedSymbols = new Set(
    tickers.filter((ticker) => ticker.trailing_enabled).map((ticker) => String(ticker.symbol || '').toUpperCase()),
  );
  return positions.filter((position) => Boolean(position.trailing_enabled) || protectedSymbols.has(String(position.symbol || '').toUpperCase())).length;
}

function decisionPrice(decision: Record<string, unknown> | null) {
  if (!decision) return Number.NaN;
  return numberFrom(decision.price ?? decision.market_price ?? decision.current_price ?? decision.last_price ?? decision.entry_price);
}

function matchingPosition(symbol: string, positions: PulsePosition[]) {
  const normalized = symbol.toUpperCase();
  return positions.find((position) => String(position.symbol || '').toUpperCase() === normalized) ?? null;
}

function priceAgreement(position: PulsePosition | null, edgePosition: PulsePosition | null, decision: Record<string, unknown> | null) {
  if (!position) return { label: 'No position', tone: 'neutral' as ServiceTone };
  const pulsePrice = priceFromPosition(position);
  const edgePrice = priceFromPosition(edgePosition) || decisionPrice(decision);
  if (!Number.isFinite(pulsePrice) || !Number.isFinite(edgePrice)) {
    return { label: 'Price pending', tone: 'warn' as ServiceTone };
  }
  const driftPct = Math.abs((pulsePrice - edgePrice) / edgePrice) * 100;
  if (driftPct <= 0.2) return { label: `${driftPct.toFixed(2)}% drift`, tone: 'good' as ServiceTone };
  if (driftPct <= 1) return { label: `${driftPct.toFixed(2)}% drift`, tone: 'warn' as ServiceTone };
  return { label: `${driftPct.toFixed(2)}% drift`, tone: 'bad' as ServiceTone };
}

function useSuiteSnapshot() {
  const [snapshot, setSnapshot] = React.useState<SuiteSnapshot | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [appError, setAppError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    try {
      const next = await loadSuiteSnapshot();
      setSnapshot(next);
      setAppError(null);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    const refreshMs = snapshot?.config.refreshMs;
    const intervalMs = Number.isFinite(refreshMs) && refreshMs && refreshMs > 1000 ? refreshMs : 5000;
    const id = window.setInterval(refresh, intervalMs);
    return () => window.clearInterval(id);
  }, [refresh, snapshot?.config.refreshMs]);

  return { snapshot, loading, appError, refresh };
}

export function App() {
  const { snapshot, loading, appError, refresh } = useSuiteSnapshot();
  const config = snapshot?.config;
  const account = normalizeAccount(snapshot?.pulseAccount.data);
  const positions = extractPositions(snapshot?.pulseAccount.data);
  const edgePositions = extractPositions(snapshot?.edgePulsePositions.data);
  const tickers = extractTickers(snapshot?.pulseTickers.data);
  const primary = choosePrimaryPosition(positions);
  const decision = latestDecision(snapshot);
  const symbol = String(primary?.symbol || decision?.symbol || '');
  const edgePosition = symbol ? matchingPosition(symbol, edgePositions) : null;
  const agreement = priceAgreement(primary, edgePosition, decision);
  const edgeOk = Boolean(snapshot?.edgeLive.ok && snapshot.edgeReady.ok);
  const pulseOk = Boolean(snapshot?.pulseHealth.ok && snapshot.pulseEdgeStatus.ok);
  const protectedCount = countProtected(positions, tickers);
  const failedChecks = snapshot?.edgeReady.data?.failing_check_details ?? [];
  const lastHandoff = snapshot?.edgeAutomation.data?.last_handoff;

  return (
    <div className="app-shell">
      <div className="page-pattern" />
      <header className="topbar">
        <div className="brand">
          <span className="brand-title">Sentinel Tandem</span>
          <span className="brand-subtitle">Edge eyes / Pulse hands</span>
        </div>
        <div className="status-cluster">
          <StatusPill label="Edge" tone={edgeOk ? 'good' : 'bad'} detail={snapshot?.edgeLive.latencyMs ? `${snapshot.edgeLive.latencyMs} ms` : 'checking'} />
          <StatusPill label="Pulse" tone={pulseOk ? 'good' : 'bad'} detail={snapshot?.pulseHealth.latencyMs ? `${snapshot.pulseHealth.latencyMs} ms` : 'checking'} />
          <StatusPill label="Agreement" tone={agreement.tone} detail={agreement.label} />
          <StatusPill label="Refresh" tone="neutral" detail={`${Math.round((config?.refreshMs ?? 5000) / 1000)} sec`} />
        </div>
        <button className="refresh-button" type="button" onClick={refresh}>
          <RadioTower size={14} />
          Refresh
        </button>
      </header>

      <nav className="tabbar" aria-label="Sentinel Suite sections">
        <span className="tab active">Tandem</span>
        <span className="tab">Edge</span>
        <span className="tab">Pulse</span>
        <span className="tab">Orders</span>
        <span className="tab">Risk</span>
        <span className="tab">Logs</span>
      </nav>

      <main className="layout">
        <aside className="stack">
          <Panel title="System Pair" caption="service status">
            <KeyValue label="Edge API" value={config?.edgeBaseUrl ?? 'Unavailable'} tone={edgeOk ? 'good' : 'bad'} />
            <KeyValue label="Pulse API" value={config?.pulseBaseUrl ?? 'Unavailable'} tone={pulseOk ? 'good' : 'bad'} />
            <KeyValue label="Edge ready" value={snapshot?.edgeReady.data?.status ?? 'Unavailable'} tone={snapshot?.edgeReady.data?.ready ? 'good' : 'warn'} />
            <KeyValue label="Pulse key" value={config?.pulseKeyConfigured ? 'Configured server-side' : 'Missing'} tone={config?.pulseKeyConfigured ? 'good' : 'bad'} />
            <KeyValue label="Mongo stream" value={String(snapshot?.pulseEdgeStatus.data?.mongo?.status ?? 'Unavailable')} />
          </Panel>

          <Panel title="Risk Gate" caption="blocking reasons" variant="edge">
            <KeyValue label="Automation" value={snapshot?.edgeAutomation.data?.settings?.enabled ? 'Enabled' : 'Unavailable'} tone={snapshot?.edgeAutomation.data?.settings?.enabled ? 'good' : 'warn'} />
            <KeyValue label="Mode" value={snapshot?.edgeAutomation.data?.settings?.mode ?? 'Unavailable'} />
            <KeyValue label="Min confidence" value={formatNumber(snapshot?.edgeAutomation.data?.settings?.min_confidence)} />
            <KeyValue label="Failed checks" value={failedChecks.length ? String(failedChecks.length) : '0'} tone={failedChecks.length ? 'warn' : 'good'} />
          </Panel>

          <Panel title="Protection Tape" caption="active broker safeguards">
            <div className="mini-grid">
              <MiniStat label="Open positions" value={formatNumber(account.open_positions ?? positions.length)} />
              <MiniStat label="Protected" value={formatNumber(protectedCount)} tone={protectedCount ? 'good' : 'warn'} />
              <MiniStat label="Enabled tickers" value={formatNumber(tickers.filter((ticker) => ticker.enabled !== false).length)} />
              <MiniStat label="Stopped tickers" value={formatNumber(tickers.filter((ticker) => Boolean(ticker.auto_stop_reason)).length)} tone="warn" />
            </div>
          </Panel>
        </aside>

        <section className="center">
          {appError ? (
            <div className="app-error">
              <AlertTriangle size={16} />
              <span>{appError}</span>
            </div>
          ) : null}

          <div className="metrics">
            <Metric label="Edge readiness" value={snapshot?.edgeReady.data?.ready ? 'Ready' : 'Not ready'} tone={snapshot?.edgeReady.data?.ready ? 'good' : 'warn'} note={snapshot?.edgeReady.error ?? 'From Edge /api/ready'} icon={<ShieldCheck size={17} />} />
            <Metric label="Pulse acceptance" value={snapshot?.pulseEdgeStatus.ok ? 'Reachable' : 'Unavailable'} tone={snapshot?.pulseEdgeStatus.ok ? 'good' : 'bad'} note={snapshot?.pulseEdgeStatus.error ?? 'From Pulse /api/edge/status'} icon={<CheckCircle2 size={17} />} />
            <Metric label="Account equity" value={formatMoney(account.total_equity ?? account.account_balance)} note="Pulse broker-backed status" icon={<CircleDollarSign size={17} />} />
            <Metric label="Protected PnL" value={formatMoney(positions.reduce((sum, position) => sum + (Number.isFinite(positionPnl(position)) ? positionPnl(position) : 0), 0))} tone={positions.length ? 'good' : 'neutral'} note={`${protectedCount} trailing stop positions`} icon={<TrendingUp size={17} />} />
          </div>

          <Panel title="Shared Trade State" caption="Edge intent compared with Pulse broker truth">
            {loading ? (
              <EmptyState title="Loading services" body="Waiting for Tandem's server-side connector to return Edge and Pulse responses." />
            ) : primary ? (
              <TradeState position={primary} edgePosition={edgePosition} decision={decision} lastHandoff={lastHandoff} />
            ) : (
              <EmptyState
                title="No open Pulse position"
                body={snapshot?.pulseAccount.ok ? 'Pulse returned no open positions. This area populates when Pulse reports broker-backed positions.' : snapshot?.pulseAccount.error ?? 'Pulse account endpoint is unavailable.'}
              />
            )}
          </Panel>

          <div className="split">
            <Panel title="Edge Eyes" caption="decision pressure" variant="edge">
              <KeyValue label="Latest decision" value={String(decision?.decision ?? decision?.action ?? 'Unavailable')} />
              <KeyValue label="Symbol" value={String(decision?.symbol ?? 'Unavailable')} />
              <KeyValue label="Confidence" value={formatNumber(decision?.confidence)} />
              <KeyValue label="Handoff result" value={String(decision?.handoff_status ?? decision?.handoff_reason ?? 'Unavailable')} />
            </Panel>
            <Panel title="Pulse Hands" caption="execution truth">
              <KeyValue label="Broker balance" value={formatMoney(account.buying_power ?? account.available)} />
              <KeyValue label="Open positions" value={formatNumber(account.open_positions ?? positions.length)} />
              <KeyValue label="Signals cached" value={formatNumber(snapshot?.pulseEdgeStatus.data?.signals_cached)} />
              <KeyValue label="Retry attempts" value={formatNumber(snapshot?.pulseEdgeStatus.data?.max_retry_attempts)} />
            </Panel>
          </div>

          <Panel title="Unified Event Journal" caption="real responses only">
            <EventJournal snapshot={snapshot} />
          </Panel>
        </section>

        <aside className="stack">
          <Panel title="Drift Monitor" caption="price agreement" variant="edge">
            <DriftMonitor position={primary} edgePosition={edgePosition} decision={decision} />
          </Panel>

          <Panel title="Handoff Contract" caption="Edge to Pulse">
            <KeyValue label="Schema route" value={snapshot?.edgeHandoffSchema.ok ? 'Reachable' : 'Unavailable'} tone={snapshot?.edgeHandoffSchema.ok ? 'good' : 'warn'} />
            <KeyValue label="Pulse account via Edge" value={snapshot?.edgePulseAccount.ok ? 'Reachable' : 'Unavailable'} tone={snapshot?.edgePulseAccount.ok ? 'good' : 'warn'} />
            <KeyValue label="Pulse positions via Edge" value={snapshot?.edgePulsePositions.ok ? 'Reachable' : 'Unavailable'} tone={snapshot?.edgePulsePositions.ok ? 'good' : 'warn'} />
          </Panel>

          <Panel title="Handoff Inbox" caption="last Edge handoff">
            {lastHandoff ? (
              <div className="kv-stack">
                {Object.entries(lastHandoff).slice(0, 6).map(([key, value]) => (
                  <KeyValue key={key} label={key} value={String(value)} />
                ))}
              </div>
            ) : (
              <EmptyState title="No handoff recorded" body="Edge /api/automation did not return last_handoff." compact />
            )}
          </Panel>
        </aside>
      </main>
    </div>
  );
}

function StatusPill({ label, detail, tone }: { label: string; detail: string; tone: ServiceTone }) {
  return (
    <span className={`status-pill ${tone}`}>
      <span className="status-dot" />
      {label}: {detail}
    </span>
  );
}

function Panel({ title, caption, children, variant = 'default' }: { title: string; caption?: string; children: React.ReactNode; variant?: 'default' | 'edge' }) {
  return (
    <section className={`panel ${variant}`}>
      <div className="panel-header">
        <h2>{title}</h2>
        {caption ? <span>{caption}</span> : null}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function Metric({ label, value, note, icon, tone = 'neutral' }: { label: string; value: string; note?: string; icon?: React.ReactNode; tone?: ServiceTone }) {
  return (
    <div className={`metric ${tone}`}>
      <div className="metric-top">
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      {note ? <p>{note}</p> : null}
    </div>
  );
}

function KeyValue({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: ServiceTone }) {
  return (
    <div className="key-value">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}

function MiniStat({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: ServiceTone }) {
  return (
    <div className="mini-stat">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}

function EmptyState({ title, body, compact = false }: { title: string; body: string; compact?: boolean }) {
  return (
    <div className={`empty-state ${compact ? 'compact' : ''}`}>
      <ShieldQuestion size={compact ? 18 : 28} />
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

function TradeState({
  position,
  edgePosition,
  decision,
  lastHandoff,
}: {
  position: PulsePosition;
  edgePosition: PulsePosition | null;
  decision: Record<string, unknown> | null;
  lastHandoff?: Record<string, unknown>;
}) {
  const symbol = String(position.symbol || decision?.symbol || 'Position');
  const price = priceFromPosition(position);
  const pnl = positionPnl(position);
  const pnlPct = positionPnlPct(position);
  const entry = entryFromPosition(position);
  const quantity = positionQuantity(position);
  const agreement = priceAgreement(position, edgePosition, decision);

  return (
    <div className="trade-state">
      <div className="trade-main">
        <div className="trade-head">
          <div>
            <div className="ticker">{symbol}</div>
            <div className="trade-sub">Pulse broker-backed open position</div>
          </div>
          <div className="trade-price">
            <strong>{formatMoney(price)}</strong>
            <span className={pnl >= 0 ? 'good' : 'bad'}>
              {formatMoney(pnl)} / {formatPct(pnlPct)}
            </span>
          </div>
        </div>

        <div className="timeline">
          <TimelineItem icon={<Activity size={14} />} title="Edge signal" note={decision ? `Latest decision: ${String(decision.decision ?? decision.action ?? 'recorded')}` : 'No Edge decision feed entry available.'} tone={decision ? 'good' : 'warn'} />
          <TimelineItem icon={<ArrowRightLeft size={14} />} title="Handoff" note={lastHandoff ? `Last handoff status: ${String(lastHandoff.handoff_status ?? lastHandoff.status ?? 'recorded')}` : 'No last_handoff returned by Edge automation.'} tone={lastHandoff ? 'good' : 'warn'} />
          <TimelineItem icon={<Bot size={14} />} title="Pulse position" note={`${formatNumber(quantity)} shares/contracts at ${formatMoney(entry)}`} tone="good" />
          <TimelineItem icon={<ShieldCheck size={14} />} title="Protection" note={position.trailing_enabled ? `Trailing stop active at ${formatPct(position.trailing_percent)}` : 'No trailing stop flag reported for this position.'} tone={position.trailing_enabled ? 'good' : 'warn'} />
        </div>
      </div>

      <div className="trade-side">
        <KeyValue label="Quantity" value={formatNumber(quantity)} />
        <KeyValue label="Average entry" value={formatMoney(entry)} />
        <KeyValue label="Current price" value={formatMoney(price)} />
        <KeyValue label="Price agreement" value={agreement.label} tone={agreement.tone} />
        <KeyValue label="Trailing stop" value={position.trailing_enabled ? 'Active' : 'Not reported'} tone={position.trailing_enabled ? 'good' : 'warn'} />
      </div>
    </div>
  );
}

function TimelineItem({ icon, title, note, tone }: { icon: React.ReactNode; title: string; note: string; tone: ServiceTone }) {
  return (
    <div className={`timeline-item ${tone}`}>
      <span className="timeline-icon">{icon}</span>
      <div>
        <strong>{title}</strong>
        <p>{note}</p>
      </div>
    </div>
  );
}

function DriftMonitor({
  position,
  edgePosition,
  decision,
}: {
  position: PulsePosition | null;
  edgePosition: PulsePosition | null;
  decision: Record<string, unknown> | null;
}) {
  if (!position) {
    return <EmptyState title="No drift target" body="Pulse has not reported an open position to compare." compact />;
  }

  const pulsePrice = priceFromPosition(position);
  const edgePrice = priceFromPosition(edgePosition) || decisionPrice(decision);
  const drift = Number.isFinite(pulsePrice) && Number.isFinite(edgePrice) ? Math.abs((pulsePrice - edgePrice) / edgePrice) * 100 : Number.NaN;

  return (
    <div className="kv-stack">
      <KeyValue label="Symbol" value={String(position.symbol ?? 'Unavailable')} />
      <KeyValue label="Pulse price" value={formatMoney(pulsePrice)} />
      <KeyValue label="Edge price" value={formatMoney(edgePrice)} />
      <KeyValue label="Drift" value={formatPct(drift)} tone={Number.isFinite(drift) && drift <= 0.2 ? 'good' : 'warn'} />
    </div>
  );
}

function EventJournal({ snapshot }: { snapshot: SuiteSnapshot | null }) {
  const rows = [
    {
      time: snapshot?.edgeLive.updatedAt,
      source: 'EDGE_LIVE',
      message: snapshot?.edgeLive.ok ? 'Edge liveness endpoint responded.' : snapshot?.edgeLive.error,
      tone: serviceTone(snapshot?.edgeLive),
    },
    {
      time: snapshot?.edgeReady.updatedAt,
      source: 'EDGE_READY',
      message: snapshot?.edgeReady.ok ? `Readiness: ${snapshot.edgeReady.data?.status ?? 'reported'}` : snapshot?.edgeReady.error,
      tone: serviceTone(snapshot?.edgeReady),
    },
    {
      time: snapshot?.pulseHealth.updatedAt,
      source: 'PULSE_HEALTH',
      message: snapshot?.pulseHealth.ok ? 'Pulse health endpoint responded.' : snapshot?.pulseHealth.error,
      tone: serviceTone(snapshot?.pulseHealth),
    },
    {
      time: snapshot?.pulseAccount.updatedAt,
      source: 'PULSE_ACCOUNT',
      message: snapshot?.pulseAccount.ok ? `Positions: ${extractPositions(snapshot.pulseAccount.data).length}` : snapshot?.pulseAccount.error,
      tone: serviceTone(snapshot?.pulseAccount),
    },
  ];

  return (
    <div className="journal">
      {rows.map((row) => (
        <div className="journal-row" key={row.source}>
          <span>{row.time ? new Date(row.time).toLocaleTimeString() : '--:--:--'}</span>
          <strong>{row.source}</strong>
          <span>{row.message || 'No response recorded.'}</span>
          <em className={row.tone}>{row.tone}</em>
        </div>
      ))}
    </div>
  );
}
