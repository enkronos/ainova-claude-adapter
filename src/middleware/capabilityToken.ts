import { createSecretKey } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { jwtVerify } from 'jose';
import {
  capabilityTokenClaimsSchema,
  type CapabilityTokenClaims,
} from '../types/action.js';

export type CapabilityTokenOptions = {
  secret?: string;
};

export async function readCapabilityToken(
  request: FastifyRequest,
  options: CapabilityTokenOptions,
): Promise<CapabilityTokenClaims | null> {
  const rawHeader = request.headers['x-capability-token'];
  if (!rawHeader) {
    return null;
  }

  const token = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (!token) {
    return null;
  }

  if (!options.secret) {
    const error = new Error('Capability token support is not configured');
    (error as Error & { statusCode?: number }).statusCode = 503;
    throw error;
  }

  try {
    const { payload } = await jwtVerify(
      token,
      createSecretKey(Buffer.from(options.secret)),
    );

    const claims = capabilityTokenClaimsSchema.parse(payload);
    const ttlDate = normalizeTtl(claims.ttl);
    if (ttlDate.getTime() <= Date.now()) {
      const error = new Error('Capability token expired');
      (error as Error & { statusCode?: number }).statusCode = 403;
      throw error;
    }

    return claims;
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      throw error;
    }

    const tokenError = new Error('Invalid capability token');
    (tokenError as Error & { statusCode?: number }).statusCode = 401;
    throw tokenError;
  }
}

function normalizeTtl(ttl: CapabilityTokenClaims['ttl']) {
  if (typeof ttl === 'number') {
    return new Date(ttl * 1000);
  }

  return new Date(ttl);
}
