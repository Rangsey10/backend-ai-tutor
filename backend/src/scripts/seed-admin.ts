import { Timestamp } from 'firebase-admin/firestore';
import { env } from '../config/env';
import { initFirebase, getAuth, getFirestore } from '../config/firebase';
import { userConverter } from '../config/firestore-converters';
import type { User } from '../models/users.model';

async function findOrCreateFirebaseUid(email: string, displayName: string): Promise<string> {
  const auth = getAuth();

  try {
    const existing = await auth.getUserByEmail(email);
    return existing.uid;
  } catch (error) {
    const authError = error as { code?: string };
    if (authError.code !== 'auth/user-not-found') {
      throw error;
    }
  }

  const created = await auth.createUser({
    email,
    displayName,
    emailVerified: true,
  });
  return created.uid;
}

async function seedAdmin(): Promise<void> {
  const email = env.seedAdmin.email.trim().toLowerCase();
  const fullName = env.seedAdmin.fullName.trim();

  if (!email) {
    throw new Error('Set SEED_ADMIN_EMAIL in .env before running npm.cmd run seed:admin');
  }

  initFirebase();

  const firebaseUid = await findOrCreateFirebaseUid(email, fullName);
  const db = getFirestore();
  const users = db.collection('users').withConverter(userConverter);
  const existing = await users.where('email', '==', email).limit(1).get();
  const now = Timestamp.now();

  if (!existing.empty) {
    const doc = existing.docs[0];
    await doc.ref.set(
      {
        ...doc.data(),
        firebase_uid: firebaseUid,
        full_name: doc.data().full_name || fullName,
        role: 'admin',
        account_status: 'active',
      },
      { merge: true }
    );
    console.log(`Updated admin user for ${email}`);
    return;
  }

  const doc = users.doc(firebaseUid);
  const user: User = {
    user_id: doc.id,
    firebase_uid: firebaseUid,
    full_name: fullName,
    email,
    role: 'admin',
    profile_image_url: null,
    account_status: 'active',
    preferred_language: null,
    created_at: now,
  };

  await doc.set(user);
  console.log(`Created admin user for ${email}`);
}

seedAdmin().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
