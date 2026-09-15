import morgan from 'morgan';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { logger } from '../utils/logger';

export function correlationId(req: Request, res: Response, next: () => void): void {
  const supplied = req.header('x-request-id')?.trim();
  const requestId = supplied && /^[A-Za-z0-9._:-]{8,128}$/.test(supplied) ? supplied : randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}

export const requestLogger = morgan((tokens, req, res) => JSON.stringify({
  event: 'http_request', request_id: (res as Response).locals.requestId,
  method: tokens.method(req, res), path: tokens.url(req, res)?.split('?')[0],
  status: Number(tokens.status(req, res) ?? 0), duration_ms: Number(tokens['response-time'](req, res) ?? 0),
}), { stream: { write: (message: string) => logger.info('HTTP request completed', JSON.parse(message) as Record<string, unknown>) } });
