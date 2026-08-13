import './types/express';
import { createApp } from './app';
import { env } from './config/env';
import { initFirebase } from './config/firebase';
import { logger } from './utils/logger';

initFirebase();

const app = createApp();

app.listen(env.port, () => {
  logger.info(`🚀 Server running on http://localhost:${env.port} [${env.nodeEnv}]`);
});
