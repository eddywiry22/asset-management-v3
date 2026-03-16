import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from './errors';

/**
 * Express middleware factory that validates req.body against a Zod schema.
 * Throws ValidationError on failure so the global error middleware handles it.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const messages = result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
      return next(new ValidationError(messages));
    }
    req.body = result.data;
    next();
  };
}

/**
 * Parse and validate data directly. Throws ZodError on failure.
 */
export function parseData<T>(schema: ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}
