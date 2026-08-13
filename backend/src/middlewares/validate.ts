import { NextFunction, Request, RequestHandler, Response } from 'express';
import { type ZodError, type ZodTypeAny } from 'zod';
import { AppError } from '../utils/AppError';

type ValidationTarget = 'body' | 'params' | 'query';

type ValidationSchemas = Partial<Record<ValidationTarget, ZodTypeAny>>;

function formatZodError(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    for (const [target, schema] of Object.entries(schemas) as Array<
      [ValidationTarget, ZodTypeAny]
    >) {
      const parsed = schema.safeParse(req[target]);

      if (!parsed.success) {
        const details = formatZodError(parsed.error);
        next(new AppError('Request validation failed', 400, true, 'VALIDATION_ERROR', details));
        return;
      }

      req[target] = parsed.data as never;
    }

    next();
  };
}
