import { SignJWT } from 'jose';
import { createSecretKey } from 'node:crypto';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { AinovaClient } from '../src/services/ainovaClient.js';
import { clearRateLimiterState } from '../src/middleware/rateLimit.js';
import { authorizeRequestSchema } from '../src/types/action.js';

describe('authorize adapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearRateLimiterState();
  });

  test('validates request payload with zod', () => {
    expect(() =>
      authorizeRequestSchema.parse({
        holding_id: 'holding-1',
        action: 'tool.call',
        resource: 'contacts',
      }),
    ).toThrow();
  });

  test('returns authorized decision from Ainova unchanged', async () => {
    const ainovaClient = new AinovaClient({
      baseUrl: 'https://ainova.example',
      fetchFn: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'authorized',
            constraints: {
              max_tokens: 1200,
              budget_remaining: 42,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    });

    const app = buildApp({
      logger: false,
      ainovaClient,
      rateLimit: { maxRequests: 100, windowMs: 60_000 },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/authorize',
      payload: {
        agent_id: 'claude-agent-1',
        holding_id: 'holding-1',
        action: 'tool.call',
        resource: 'contacts.read',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'authorized',
      constraints: {
        max_tokens: 1200,
        budget_remaining: 42,
      },
    });

    await app.close();
  });

  test('fails safe when Ainova is unavailable', async () => {
    const ainovaClient = new AinovaClient({
      baseUrl: 'https://ainova.example',
      fetchFn: vi.fn().mockRejectedValue(new Error('network timeout')),
    });

    const app = buildApp({
      logger: false,
      ainovaClient,
      rateLimit: { maxRequests: 100, windowMs: 60_000 },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/authorize',
      payload: {
        agent_id: 'claude-agent-1',
        holding_id: 'holding-1',
        action: 'tool.call',
        resource: 'contacts.read',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'denied',
      reason: 'denied_safe_mode',
    });

    await app.close();
  });

  test('validates capability token and forwards raw token to Ainova', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'modified',
          constraints: { max_tokens: 300 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const ainovaClient = new AinovaClient({
      baseUrl: 'https://ainova.example',
      fetchFn,
    });

    const secret = 'super-secret-test-key';
    const token = await new SignJWT({
      run_id: 'run-123',
      scope: ['tool.call'],
      ttl: Math.floor(Date.now() / 1000) + 3600,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(createSecretKey(Buffer.from(secret)));

    const app = buildApp({
      logger: false,
      ainovaClient,
      capabilityTokenSecret: secret,
      rateLimit: { maxRequests: 100, windowMs: 60_000 },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/authorize',
      headers: {
        'x-capability-token': token,
      },
      payload: {
        agent_id: 'claude-agent-1',
        holding_id: 'holding-1',
        action: 'tool.call',
        resource: 'contacts.read',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'modified',
      constraints: { max_tokens: 300 },
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
    });
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({
        'x-capability-token': token,
      }),
    });
    expect(String(fetchFn.mock.calls[0]?.[1]?.body)).not.toContain('"capability"');

    await app.close();
  });
});
