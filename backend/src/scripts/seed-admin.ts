import bcrypt from 'bcryptjs';
import { Timestamp } from 'firebase-admin/firestore';
import { env } from '../config/env';
import { initFirebase, getAuth, getFirestore } from '../config/firebase';
import { authCredentialConverter, userConverter } from '../config/firestore-converters';
import type { AuthCredential } from '../models/auth-credentials.model';
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
  const password = env.seedAdmin.password;

  if (!email) {
    throw new Error('Set SEED_ADMIN_EMAIL in .env before running npm.cmd run seed:admin');
  }
  if (password.length < 8) {
    throw new Error('Set SEED_ADMIN_PASSWORD to at least 8 characters before running npm run seed:admin');
  }

  initFirebase();

  const firebaseUid = await findOrCreateFirebaseUid(email, fullName);
  const db = getFirestore();
  const users = db.collection('users').withConverter(userConverter);
  const credentials = db.collection('auth_credentials').withConverter(authCredentialConverter);
  const existing = await users.where('email', '==', email).limit(1).get();
  const now = Timestamp.now();
  const passwordHash = await bcrypt.hash(password, 12);
  let userId: string;

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
    userId = doc.data().user_id;
  } else {
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
    userId = user.user_id;
  }

  const credentialRef = credentials.doc(userId);
  const existingCredential = await credentialRef.get();
  const credential: AuthCredential = {
    auth_credential_id: userId,
    user_id: userId,
    email,
    password_hash: passwordHash,
    email_verified: true,
    failed_login_attempts: 0,
    locked_until: null,
    last_login_at: existingCredential.exists ? existingCredential.data()!.last_login_at : null,
    created_at: existingCredential.exists ? existingCredential.data()!.created_at : now,
    updated_at: now,
  };
  await credentialRef.set(credential);
  console.log(`Seeded admin user and credentials for ${email}`);
}

seedAdmin().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
