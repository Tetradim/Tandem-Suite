import compression from 'compression';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import type {
  EdgeAutomation,
  EdgeDecisionFeed,
  EdgeReadiness,
  PulseAccount,
  PulseEdgeStatus,
  PulseTickerResponse,
  ServiceResult,
  SuiteConfig,
  SuiteSnapshot,
} from '../src/types.js';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const DEFAULT_EDGE_URL = 'http://localhost:8000';
const DEFAULT_PULSE_URL = 'http://localhost:8001';
const DEFAULT_REFRESH_MS = 5000;
const DEFAULT_PRODUCTION_PORT = 3005;
const DEFAULT_API_PORT = 8005;
const REQUEST_TIMEOUT_MS = 4500;

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function cliValue(name: string) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return undefined;
}

function numberFrom(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function suiteConfig(): SuiteConfig {
  return {
    edgeBaseUrl: stripTrailingSlash(process.env.EDGE_API_URL || DEFAULT_EDGE_URL),
    pulseBaseUrl: stripTrailingSlash(process.env.PULSE_API_URL || DEFAULT_PULSE_URL),
    pulseKeyConfigured: Boolean(process.env.PULSE_EDGE_API_KEY),
    refreshMs: numberFrom(process.env.REFRESH_MS, DEFAULT_REFRESH_MS),
  };
}

function configError<T>(error: string): ServiceResult<T> {
  return {
    ok: false,
    error,
    updatedAt: new Date().toISOString(),
  };
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const detail = record.detail;
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object' && typeof (detail as Record<string, unknown>).message === 'string') {
      return String((detail as Record<string, unknown>).message);
    }
    if (typeof record.error === 'string') return record.error;
    if (typeof record.message === 'string') return record.message;
  }
  return fallback;
}

async function fetchJson<T>(baseUrl: string, endpoint: string, headers: HeadersInit = {}): Promise<ServiceResult<T>> {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...headers,
      },
    });

    const latencyMs = Math.round(performance.now() - started);
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : undefined;

    if (!response.ok) {
      return {
        ok: false,
        data: payload as T,
        status: response.status,
        latencyMs,
        updatedAt: new Date().toISOString(),
        error: getErrorMessage(payload, `${response.status} ${response.statusText}`),
      };
    }

    return {
      ok: true,
      data: payload as T,
      status: response.status,
      latencyMs,
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === 'AbortError';
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - started),
      updatedAt: new Date().toISOString(),
      error: isAbort ? `Request timed out after ${REQUEST_TIMEOUT_MS} ms` : error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function pulseEdgeHeaders(): HeadersInit | null {
  const apiKey = process.env.PULSE_EDGE_API_KEY;
  return apiKey ? { 'X-API-Key': apiKey } : null;
}

async function loadSnapshot(): Promise<SuiteSnapshot> {
  const config = suiteConfig();
  const pulseHeaders = pulseEdgeHeaders();
  const missingPulseKey = 'PULSE_EDGE_API_KEY is not configured on the Tandem server.';

  const [
    edgeLive,
    edgeReady,
    edgeAutomation,
    edgeDecisions,
    edgeHandoffSchema,
    edgePulseAccount,
    edgePulsePositions,
    pulseHealth,
    pulseEdgeStatus,
    pulseAccount,
    pulseTickers,
  ] = await Promise.all([
    fetchJson<Record<string, unknown>>(config.edgeBaseUrl, '/api/live'),
    fetchJson<EdgeReadiness>(config.edgeBaseUrl, '/api/ready'),
    fetchJson<EdgeAutomation>(config.edgeBaseUrl, '/api/automation'),
    fetchJson<EdgeDecisionFeed>(config.edgeBaseUrl, '/api/decisions'),
    fetchJson<Record<string, unknown>>(config.edgeBaseUrl, '/api/pulse/handoff/schema'),
    fetchJson<Record<string, unknown>>(config.edgeBaseUrl, '/api/pulse/account'),
    fetchJson<Record<string, unknown>>(config.edgeBaseUrl, '/api/pulse/positions'),
    fetchJson<Record<string, unknown>>(config.pulseBaseUrl, '/api/health'),
    pulseHeaders ? fetchJson<PulseEdgeStatus>(config.pulseBaseUrl, '/api/edge/status', pulseHeaders) : Promise.resolve(configError<PulseEdgeStatus>(missingPulseKey)),
    pulseHeaders ? fetchJson<PulseAccount>(config.pulseBaseUrl, '/api/edge/account/status', pulseHeaders) : Promise.resolve(configError<PulseAccount>(missingPulseKey)),
    pulseHeaders ? fetchJson<PulseTickerResponse>(config.pulseBaseUrl, '/api/edge/tickers', pulseHeaders) : Promise.resolve(configError<PulseTickerResponse>(missingPulseKey)),
  ]);

  return {
    config,
    edgeLive,
    edgeReady,
    edgeAutomation,
    edgeDecisions,
    edgeHandoffSchema,
    edgePulseAccount,
    edgePulsePositions,
    pulseHealth,
    pulseEdgeStatus,
    pulseAccount,
    pulseTickers,
  };
}

const app = express();
const distPath = path.resolve(process.cwd(), 'dist');
const distIndex = path.join(distPath, 'index.html');
const port = numberFrom(cliValue('--port') || process.env.PORT, process.env.NODE_ENV === 'production' ? DEFAULT_PRODUCTION_PORT : DEFAULT_API_PORT);

app.disable('x-powered-by');
app.use(compression());
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      },
    },
  }),
);

app.get('/api/tandem/config', (_request, response) => {
  response.json(suiteConfig());
});

app.get('/api/tandem/snapshot', async (_request, response) => {
  response.json(await loadSnapshot());
});

if (fs.existsSync(distIndex)) {
  app.use(express.static(distPath));
  app.get(/.*/, (_request, response) => {
    response.sendFile(distIndex);
  });
}

app.listen(port, () => {
  process.stdout.write(`Tandem Suite listening on http://127.0.0.1:${port}\n`);
});
