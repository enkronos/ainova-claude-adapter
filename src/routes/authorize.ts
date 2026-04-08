import type { FastifyInstance } from 'fastify';
import { readCapabilityToken } from '../middleware/capabilityToken.js';
import { validateBody } from '../middleware/validateRequest.js';
import { authorizeRequestSchema } from '../types/action.js';
import type { AinovaClient } from '../services/ainovaClient.js';

export type RegisterAuthorizeRouteOptions = {
  ainovaClient: AinovaClient;
  capabilityTokenSecret?: string;
};

export async function registerAuthorizeRoute(
  app: FastifyInstance,
  options: RegisterAuthorizeRouteOptions,
) {
  app.post('/authorize', async (request, reply) => {
    const startedAt = performance.now();
    const payload = validateBody(request, authorizeRequestSchema);
    const rawCapabilityTokenHeader = request.headers['x-capability-token'];
    const capabilityToken = Array.isArray(rawCapabilityTokenHeader)
      ? rawCapabilityTokenHeader[0]
      : rawCapabilityTokenHeader;

    await readCapabilityToken(request, {
      secret: options.capabilityTokenSecret,
    });

    const decision = await options.ainovaClient.authorize(payload, {
      capabilityToken,
    });

    const latencyMs = Math.round((performance.now() - startedAt) * 100) / 100;
    const auditEvent = {
      timestamp: new Date().toISOString(),
      agent_id: payload.agent_id,
      action: payload.action,
      decision: decision.status,
      latency_ms: latencyMs,
      reason: decision.reason,
    };

    request.log.info(auditEvent, 'authorize_decision');
    void options.ainovaClient.audit(auditEvent);

    return reply.code(200).send(decision);
  });
}
