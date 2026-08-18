import { z } from 'zod';

const visualStyles = ['diagram', 'animation', 'flashcard', 'step_by_step', 'real_world'] as const;
const learningPaces = ['slow', 'balanced', 'fast'] as const;

export const updateOnboardingRequestSchema = z
  .object({
    current_step: z.string().min(1),
    completed_steps: z.array(z.string().min(1)).default([]),
    is_completed: z.boolean().default(false),
  })
  .strict();

export const upsertPreferencesRequestSchema = z
  .object({
    preferred_visual_styles: z.array(z.enum(visualStyles)).min(1),
    learning_pace: z.enum(learningPaces),
    preferred_subject_ids: z.array(z.string().min(1)),
    notification_settings: z
      .object({
        reminders_enabled: z.boolean(),
        daily_goal_enabled: z.boolean(),
        weekly_summary_enabled: z.boolean(),
      })
      .strict(),
  })
  .strict();
