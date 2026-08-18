export const USER_ROLES = ['student', 'tutor', 'admin', 'teacher', 'administrator'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export function normalizeUserRole(role: UserRole): 'student' | 'tutor' | 'admin' {
  if (role === 'teacher') {
    return 'tutor';
  }

  if (role === 'administrator') {
    return 'admin';
  }

  return role;
}
