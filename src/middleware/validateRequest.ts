import type { FastifyRequest } from 'fastify';
import { ZodError, type ZodType } from 'zod';

export function validateBody<T>(request: FastifyRequest, schema: ZodType<T>): T {
  try {
    return schema.parse(request.body ?? {});
  } catch (error) {
    if (error instanceof ZodError) {
      const details = error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      const validationError = new Error('Invalid authorize payload');
      (validationError as Error & { statusCode?: number; details?: unknown }).statusCode = 400;
      (validationError as Error & { statusCode?: number; details?: unknown }).details = details;
      throw validationError;
    }

    throw error;
  }
}
