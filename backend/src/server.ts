import { createApp } from './app';
import { env } from './config/env';
import { initFirebase } from './config/firebase';
import { logger } from './utils/logger';

initFirebase();

const app = createApp();

const listening = () =>
  logger.info(
    `🚀 Server running on http://${env.bindHost ?? 'localhost'}:${env.port} [${env.nodeEnv}]`
  );

if (env.bindHost) {
  app.listen(env.port, env.bindHost, listening);
} else {
  app.listen(env.port, listening);
}
