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

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return false;
  const clean = origin.trim().replace(/\/+$/, '').toLowerCase();
  for (const allowed of env.cors.allowedOrigins) {
    const cleanAllowed = allowed.trim().replace(/\/+$/, '').toLowerCase();
    if (clean === cleanAllowed) return true;
    if (clean.replace(/^https?:\/\//, '') === cleanAllowed.replace(/^https?:\/\//, '')) return true;
  }
  return false;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message = err.message || 'Internal Server Error';

  const origin = req.header('origin');
  if (origin && isOriginAllowed(origin) && !res.headersSent) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

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
