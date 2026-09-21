type FirebaseUser = { uid: string };

type AuthMock = {
  createUser: jest.Mock<Promise<FirebaseUser>, [Record<string, unknown>]>;
  getUserByEmail: jest.Mock<Promise<FirebaseUser>, [string]>;
};

async function runSeedAdmin(options: { existingUser?: FirebaseUser; existingCredential?: boolean } = {}): Promise<{
  auth: AuthMock;
  credentialSet: jest.Mock;
}> {
  jest.resetModules();

  const auth: AuthMock = {
    createUser: jest.fn().mockResolvedValue({ uid: 'new-admin-uid' }),
    getUserByEmail: options.existingUser
      ? jest.fn().mockResolvedValue(options.existingUser)
      : jest.fn().mockRejectedValue({ code: 'auth/user-not-found' }),
  };
  const userSet = jest.fn().mockResolvedValue(undefined);
  const credentialSet = jest.fn().mockResolvedValue(undefined);
  const existingSnapshot = options.existingUser
    ? {
        empty: false,
        docs: [
          {
            data: () => ({ user_id: 'existing-admin-uid', full_name: 'Existing Admin' }),
            ref: { set: userSet },
          },
        ],
      }
    : { empty: true, docs: [] };

  jest.doMock('../../config/env', () => ({
    env: {
      seedAdmin: {
        email: 'admin@example.test',
        fullName: 'Seed Admin',
        password: 'test-seed-password',
      },
    },
  }));
  jest.doMock('../../config/firebase', () => ({
    initFirebase: jest.fn(),
    getAuth: () => auth,
    getFirestore: () => ({
      collection: (name: string) => ({
        withConverter: () => ({
          ...(name === 'users'
            ? {
                where: () => ({
                  limit: () => ({ get: jest.fn().mockResolvedValue(existingSnapshot) }),
                }),
                doc: () => ({ id: 'new-admin-uid', set: userSet }),
              }
            : {
                doc: () => ({
                  get: jest.fn().mockResolvedValue(
                    options.existingCredential
                      ? { exists: true, data: () => ({ created_at: 'created-before', last_login_at: 'last-login' }) }
                      : { exists: false },
                  ),
                  set: credentialSet,
                }),
              }),
        }),
      }),
    }),
  }));
  jest.doMock('../../config/firestore-converters', () => ({ userConverter: {}, authCredentialConverter: {} }));
  jest.doMock('bcryptjs', () => ({ __esModule: true, default: { hash: jest.fn().mockResolvedValue('password-hash') } }));
  jest.doMock('firebase-admin/firestore', () => ({ Timestamp: { now: () => 'now' } }));

  jest.isolateModules(() => {
    // The script intentionally starts seeding when invoked by npm.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../seed-admin');
  });
  await new Promise<void>((resolve) => setImmediate(resolve));

  return { auth, credentialSet };
}

describe('seed-admin', () => {
  it('creates an admin user and its hashed password credential', async () => {
    const { auth, credentialSet } = await runSeedAdmin();

    expect(auth.createUser).toHaveBeenCalledWith({
      email: 'admin@example.test',
      displayName: 'Seed Admin',
      emailVerified: true,
    });
    expect(credentialSet).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'new-admin-uid',
      email: 'admin@example.test',
      password_hash: 'password-hash',
      failed_login_attempts: 0,
    }));
  });

  it('resets credentials for an existing seeded admin', async () => {
    const { auth, credentialSet } = await runSeedAdmin({
      existingUser: { uid: 'existing-admin-uid' },
      existingCredential: true,
    });

    expect(auth.createUser).not.toHaveBeenCalled();
    expect(credentialSet).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'existing-admin-uid',
      created_at: 'created-before',
      last_login_at: 'last-login',
      password_hash: 'password-hash',
    }));
  });
});
