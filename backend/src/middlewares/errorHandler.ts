import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message = err.message || 'Internal Server Error';

  logger.error(message, {
    path: req.originalUrl,
    method: req.method,
    stack: env.isDev ? err.stack : undefined,
  });

  res.status(statusCode).json({
    success: false,
    message,
    error: {
      code: err instanceof AppError ? err.code : 'INTERNAL_SERVER_ERROR',
      ...(err instanceof AppError && err.details !== undefined && { details: err.details }),
    },
    ...(env.isDev && { stack: err.stack }),
  });
}
