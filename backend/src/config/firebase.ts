import admin from 'firebase-admin';
import { env } from './env';
import { logger } from '../utils/logger';

let initialized = false;

/** True only after Firebase Admin has been configured with credentials or an emulator. */
export function isFirebaseInitialized(): boolean {
  return initialized;
}

export function initFirebase(): void {
  if (initialized) return;

  if (env.firebase.firestoreEmulatorHost && env.firebase.projectId) {
    admin.initializeApp({
      projectId: env.firebase.projectId,
    });
    initialized = true;
    logger.info(
      `Firebase Admin initialized with Firestore emulator at ${env.firebase.firestoreEmulatorHost}`
    );
    return;
  }

  // Skip real init if credentials aren't set yet (early scaffolding stage)
  if (!env.firebase.projectId || !env.firebase.privateKey) {
    if (env.isProductionLike) {
      throw new Error('Firebase Admin credentials are required in staging and production');
    }
    logger.warn('Firebase credentials not set — skipping Firebase Admin init (add them to .env)');
    return;
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: env.firebase.projectId,
      clientEmail: env.firebase.clientEmail,
      privateKey: env.firebase.privateKey,
    }),
  });

  initialized = true;
  logger.info('Firebase Admin initialized');
}

export function getFirestore() {
  if (!initialized) initFirebase();
  return admin.firestore();
}

export function getAuth() {
  if (!initialized) initFirebase();
  return admin.auth();
}

export default admin;
