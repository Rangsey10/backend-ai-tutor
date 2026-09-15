import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { env } from './env';
import { logger } from '../utils/logger';

let initialized = false;

// Firebase Auth currently reaches an ESM-only dependency. Loading it lazily
// keeps route/unit tests independent of that runtime implementation while the
// production server still loads the official Admin SDK when authentication is
// actually required.
function firebaseAppSdk(): typeof import('firebase-admin/app') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('firebase-admin/app') as typeof import('firebase-admin/app');
}

function firebaseAuthSdk(): typeof import('firebase-admin/auth') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('firebase-admin/auth') as typeof import('firebase-admin/auth');
}

function firebaseFirestoreSdk(): typeof import('firebase-admin/firestore') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('firebase-admin/firestore') as typeof import('firebase-admin/firestore');
}

/** True only after Firebase Admin has been configured with credentials or an emulator. */
export function isFirebaseInitialized(): boolean {
  return initialized;
}

export function initFirebase(): void {
  if (initialized) return;

  if (env.firebase.firestoreEmulatorHost && env.firebase.projectId) {
    firebaseAppSdk().initializeApp({
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

  firebaseAppSdk().initializeApp({
    credential: firebaseAppSdk().cert({
      projectId: env.firebase.projectId,
      clientEmail: env.firebase.clientEmail,
      privateKey: env.firebase.privateKey,
    }),
  });

  initialized = true;
  logger.info('Firebase Admin initialized');
}

export function getFirestore(): Firestore {
  if (!initialized) initFirebase();
  if (!initialized) {
    throw new Error('Firebase Admin is not initialized. Add Firebase credentials or enable a local fallback path.');
  }
  return firebaseFirestoreSdk().getFirestore();
}

export function getAuth(): Auth {
  if (!initialized) initFirebase();
  if (!initialized) {
    throw new Error('Firebase Admin is not initialized. Add Firebase credentials or enable a local fallback path.');
  }
  return firebaseAuthSdk().getAuth();
}
