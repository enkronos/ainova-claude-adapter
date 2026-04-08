import { setTimeout as delay } from 'node:timers/promises';
import {
  authorizeDecisionSchema,
  type AuthorizeDecision,
  type AuthorizeRequest,
  type CapabilityTokenClaims,
} from '../types/action.js';

type FetchLike = typeof fetch;

export type AinovaClientOptions = {
  baseUrl: string;
  authorizePath?: string;
  auditPath?: string;
  bearerToken?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchFn?: FetchLike;
};

export type AinovaAuthorizePayload = AuthorizeRequest & {
  capability?: CapabilityTokenClaims | null;
};

export type AuditEvent = {
  timestamp: string;
  agent_id: string;
  action: string;
  decision: AuthorizeDecision['status'];
  latency_ms: number;
  reason?: string;
};

const SAFE_MODE_DECISION: AuthorizeDecision = {
  status: 'denied',
  reason: 'denied_safe_mode',
};

export class AinovaClient {
  private readonly baseUrl: string;
  private readonly authorizePath: string;
  private readonly auditPath?: string;
  private readonly bearerToken?: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchFn: FetchLike;

  constructor(options: AinovaClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.authorizePath = options.authorizePath ?? '/v1/authorize';
    this.auditPath = options.auditPath;
    this.bearerToken = options.bearerToken;
    this.timeoutMs = options.timeoutMs ?? 2000;
    this.maxRetries = Math.min(options.maxRetries ?? 2, 2);
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async authorize(payload: AinovaAuthorizePayload): Promise<AuthorizeDecision> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await this.fetchWithTimeout(this.authorizePath, {
          method: 'POST',
          headers: this.buildHeaders(),
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`Ainova authorize failed with ${response.status}`);
        }

        const body = await response.json();
        return authorizeDecisionSchema.parse(body);
      } catch (error) {
        if (attempt >= this.maxRetries || !isRetryable(error)) {
          return SAFE_MODE_DECISION;
        }

        await delay(100 * (attempt + 1));
      }
    }

    return SAFE_MODE_DECISION;
  }

  async audit(event: AuditEvent): Promise<void> {
    if (!this.auditPath) {
      return;
    }

    try {
      await this.fetchWithTimeout(this.auditPath, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(event),
      });
    } catch {
      // Best effort only. Logging path must not affect authorization flow.
    }
  }

  private buildHeaders() {
    return {
      'content-type': 'application/json',
      ...(this.bearerToken ? { authorization: `Bearer ${this.bearerToken}` } : {}),
    };
  }

  private async fetchWithTimeout(path: string, init: RequestInit) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await this.fetchFn(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function isRetryable(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === 'AbortError'
    || /network|timeout|fetch|ECONN|ENOTFOUND|5\d\d/i.test(error.message);
}
