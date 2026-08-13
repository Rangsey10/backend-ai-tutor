import { Router, Request, Response } from 'express';
import { env } from '../config/env';
import { isFirebaseInitialized } from '../config/firebase';

const router = Router();

type DependencyState = 'healthy' | 'degraded' | 'unavailable';

async function getAiServiceState(): Promise<DependencyState> {
  if (!env.aiService.visualTutorInternalToken) return 'unavailable';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_500);
  try {
    const response = await fetch(`${env.aiService.baseUrl.replace(/\/$/, '')}/api/v1/visual_tutor/readiness`, {
      headers: { 'x-visual-tutor-internal-token': env.aiService.visualTutorInternalToken },
      signal: controller.signal,
    });
    if (!response.ok) return 'unavailable';
    const body = (await response.json()) as { status?: DependencyState };
    return body.status === 'healthy' || body.status === 'degraded' ? body.status : 'unavailable';
  } catch {
    return 'unavailable';
  } finally {
    clearTimeout(timeout);
  }
}

router.get('/', async (_req: Request, res: Response) => {
  const firebase = isFirebaseInitialized() ? 'healthy' : 'unavailable';
  const visualTutorAi = await getAiServiceState();
  const overall: DependencyState =
    firebase === 'unavailable' || visualTutorAi === 'unavailable'
      ? 'unavailable'
      : visualTutorAi === 'degraded'
        ? 'degraded'
        : 'healthy';

  res.status(overall === 'unavailable' ? 503 : 200).json({
    success: true,
    message: 'Backend is up and running',
    status: overall,
    dependencies: { firebase, visual_tutor_ai: visualTutorAi },
    timestamp: new Date().toISOString(),
  });
});

export default router;
