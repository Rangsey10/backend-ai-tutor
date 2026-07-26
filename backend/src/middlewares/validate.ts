import { NextFunction, Request, RequestHandler, Response } from 'express';
import { type ZodError, type ZodTypeAny } from 'zod';
import { AppError } from '../utils/AppError';

type ValidationTarget = 'body' | 'params' | 'query';

type ValidationSchemas = Partial<Record<ValidationTarget, ZodTypeAny>>;

function formatZodError(error: ZodError): string {
  return error.issues.map((issue) => issue.message).join('; ');
}

export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    for (const [target, schema] of Object.entries(schemas) as Array<
      [ValidationTarget, ZodTypeAny]
    >) {
      const parsed = schema.safeParse(req[target]);

      if (!parsed.success) {
        next(new AppError(formatZodError(parsed.error), 400));
        return;
      }

      req[target] = parsed.data as never;
    }

    next();
  };
}
