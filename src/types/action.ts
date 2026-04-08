import { z } from 'zod';

const trimmedString = z.string().trim().min(1);

export const authorizeRequestSchema = z.object({
  agent_id: trimmedString,
  holding_id: trimmedString,
  action: trimmedString,
  resource: trimmedString,
  estimated_cost: z.number().finite().nonnegative().optional(),
  context: z.object({
    session_id: trimmedString.optional(),
    step_id: trimmedString.optional(),
  }).optional(),
});

export const capabilityTokenClaimsSchema = z.object({
  agent_id: trimmedString.optional(),
  run_id: trimmedString,
  scope: z.array(trimmedString).default([]),
  ttl: z.union([z.number().int(), z.string().datetime()]),
});

export const authorizeDecisionSchema = z.object({
  status: z.enum(['authorized', 'denied', 'modified']),
  reason: z.string().optional(),
  constraints: z.object({
    max_tokens: z.number().int().positive().optional(),
    budget_remaining: z.number().finite().optional(),
  }).optional(),
});

export type AuthorizeRequest = z.infer<typeof authorizeRequestSchema>;
export type CapabilityTokenClaims = z.infer<typeof capabilityTokenClaimsSchema>;
export type AuthorizeDecision = z.infer<typeof authorizeDecisionSchema>;
