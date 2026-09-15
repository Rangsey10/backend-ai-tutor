import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';
export function requireAdminCsrf(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path === '/login' || req.path === '/google' || req.path === '/password-reset/request' || req.path === '/password-reset/confirm') return next();
  if (req.header('authorization')?.startsWith('Bearer ')) return next();
  const csrfCookie = req.header('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith('rean_admin_csrf='))?.slice('rean_admin_csrf='.length);
  if (!csrfCookie || req.header('x-csrf-token') !== csrfCookie) return next(new AppError('CSRF validation failed', 403));
  next();
}
