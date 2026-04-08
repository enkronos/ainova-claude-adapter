import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { registerAuthorizeRoute } from './routes/authorize.js';
import { AinovaClient, type AinovaClientOptions } from './services/ainovaClient.js';
import { createBasicRateLimiter } from './middleware/rateLimit.js';

export type BuildAppOptions = {
  logger?: FastifyBaseLogger | boolean;
  ainovaClient?: AinovaClient;
  ainovaClientOptions?: AinovaClientOptions;
  capabilityTokenSecret?: string;
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
};

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? true,
  });

  const ainovaClient = options.ainovaClient
    ?? new AinovaClient(
      options.ainovaClientOptions ?? {
        baseUrl: process.env.AINOVA_BASE_URL ?? 'http://localhost:3000',
        authorizePath: process.env.AINOVA_AUTHORIZE_PATH ?? '/v1/authorize',
        auditPath: process.env.AINOVA_AUDIT_PATH,
        bearerToken: process.env.AINOVA_BEARER_TOKEN,
        timeoutMs: Number(process.env.AINOVA_TIMEOUT_MS ?? 2000),
        maxRetries: Number(process.env.AINOVA_MAX_RETRIES ?? 2),
      },
    );

  app.get('/health', async () => ({
    status: 'ok',
  }));

  app.addHook(
    'preHandler',
    createBasicRateLimiter(options.rateLimit ?? {
      maxRequests: Number(process.env.RATE_LIMIT_MAX ?? 60),
      windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
    }),
  );

  app.setErrorHandler((error, _request, reply) => {
    const statusCode =
      typeof (error as Error & { statusCode?: unknown }).statusCode === 'number'
        ? ((error as Error & { statusCode?: number }).statusCode ?? 500)
        : 500;
    const details = (error as Error & { details?: unknown }).details;

    reply.code(statusCode).send({
      status: 'denied',
      reason: error instanceof Error ? error.message : 'Unexpected error',
      ...(details ? { details } : {}),
    });
  });

  void registerAuthorizeRoute(app, {
    ainovaClient,
    capabilityTokenSecret: options.capabilityTokenSecret ?? process.env.CAPABILITY_TOKEN_SECRET,
  });

  return app;
}
