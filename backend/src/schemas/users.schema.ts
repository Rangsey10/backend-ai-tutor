import { z } from 'zod';
import { USER_ROLES } from '@types/user-role';

const accountStatuses = ['active', 'inactive', 'suspended', 'pending'] as const;

export const createUserSchema = z.object({
  firebase_uid: z.string().min(1),
  full_name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(USER_ROLES),
  profile_image_url: z.string().url().nullable().optional(),
  account_status: z.enum(accountStatuses).default('active'),
  preferred_language: z.string().min(1).nullable().optional(),
});

export const updateUserSchema = createUserSchema.partial().strict();

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
