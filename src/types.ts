export type ServiceTone = 'good' | 'warn' | 'bad' | 'neutral' | 'pending';

export type ServiceResult<T> = {
  ok: boolean;
  data?: T;
  error?: string;
  latencyMs?: number;
  status?: number;
  updatedAt?: string;
};

export type EdgeReadiness = {
  ready?: boolean;
  status?: string;
  failing_checks?: string[];
  failing_check_details?: Array<{ label?: string; name?: string; description?: string }>;
};

export type EdgeAutomation = {
  settings?: {
    enabled?: boolean;
    mode?: string;
    min_confidence?: number;
    per_ticker_enabled?: Record<string, boolean>;
  };
  last_handoff?: Record<string, unknown>;
};

export type EdgeDecisionFeed = {
  decisions?: Array<Record<string, unknown>>;
  entries?: Array<Record<string, unknown>>;
  data?: Array<Record<string, unknown>> | Record<string, unknown>;
};

export type PulseEdgeStatus = {
  api_key_configured?: boolean;
  signals_cached?: number;
  max_retry_attempts?: number;
  timestamp?: string;
  mongo?: Record<string, unknown>;
};

export type PulseAccount = {
  account?: Record<string, unknown>;
  account_balance?: number;
  total_equity?: number;
  available?: number;
  buying_power?: number;
  day_pnl_dollar?: number;
  day_pnl_pct?: number;
  open_positions?: number;
  positions?: PulsePosition[];
};

export type PulsePosition = {
  symbol?: string;
  qty?: number;
  quantity?: number;
  avg_entry?: number;
  average_entry?: number;
  entry_price?: number;
  current_price?: number;
  market_price?: number;
  last_price?: number;
  pnl?: number;
  pnl_pct?: number;
  unrealized_pnl?: number;
  unrealized_pnl_pct?: number;
  trailing_enabled?: boolean;
  trailing_percent?: number;
};

export type PulseTicker = {
  symbol?: string;
  enabled?: boolean;
  trailing_enabled?: boolean;
  trailing_percent?: number;
  auto_stop_reason?: string;
};

export type PulseTickerResponse =
  | PulseTicker[]
  | {
      tickers?: PulseTicker[];
      data?: PulseTicker[];
      results?: PulseTicker[];
    };

export type SuiteConfig = {
  edgeBaseUrl: string;
  pulseBaseUrl: string;
  pulseKeyConfigured: boolean;
  refreshMs: number;
};

export type SuiteSnapshot = {
  config: SuiteConfig;
  edgeLive: ServiceResult<Record<string, unknown>>;
  edgeReady: ServiceResult<EdgeReadiness>;
  edgeAutomation: ServiceResult<EdgeAutomation>;
  edgeDecisions: ServiceResult<EdgeDecisionFeed>;
  edgeHandoffSchema: ServiceResult<Record<string, unknown>>;
  edgePulseAccount: ServiceResult<Record<string, unknown>>;
  edgePulsePositions: ServiceResult<Record<string, unknown>>;
  pulseHealth: ServiceResult<Record<string, unknown>>;
  pulseEdgeStatus: ServiceResult<PulseEdgeStatus>;
  pulseAccount: ServiceResult<PulseAccount>;
  pulseTickers: ServiceResult<PulseTickerResponse>;
};
