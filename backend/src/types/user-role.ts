export const USER_ROLES = ['student', 'administrator', 'teacher'] as const;

export type UserRole = (typeof USER_ROLES)[number];
