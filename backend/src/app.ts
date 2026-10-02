import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes';
import { correlationId, requestLogger } from './middlewares/requestLogger';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { env } from './config/env';

export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  const clean = origin.trim().replace(/\/+$/, '').toLowerCase();
  for (const allowed of env.cors.allowedOrigins) {
    const cleanAllowed = allowed.trim().replace(/\/+$/, '').toLowerCase();
    if (clean === cleanAllowed) return true;
    if (clean.replace(/^https?:\/\//, '') === cleanAllowed.replace(/^https?:\/\//, '')) return true;
  }
  return false;
}

export function createApp(): Application {
  const app = express();

  // Core middleware
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Non-browser callers (mobile apps, server-to-server probes) do not
        // send Origin and still authenticate normally. Browser origins must be
        // explicitly supplied through CORS_ALLOWED_ORIGINS.
        if (isOriginAllowed(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('Origin is not allowed by CORS policy'));
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(correlationId);
  app.use(requestLogger);

  // API routes
  app.use('/api/v1', routes);

  // Root
  app.get('/', (_req, res) => {
    res.json({ success: true, message: 'API root — see /api/v1/health' });
  });

  // 404 + error handling (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
