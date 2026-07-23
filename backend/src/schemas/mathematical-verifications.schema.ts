import { z } from 'zod';

const verificationDetailsSchema = z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]));

export const createMathematicalVerificationSchema = z.object({
  tutor_session_id: z.string().min(1),
  tutor_turn_id: z.string().min(1),
  verification_type: z.string().min(1),
  input_expression: z.string().min(1),
  expected_result: z.string().min(1),
  generated_result: z.string().min(1),
  verification_status: z.string().min(1),
  verification_details: verificationDetailsSchema,
});

export const updateMathematicalVerificationSchema = createMathematicalVerificationSchema.partial().strict();

export type CreateMathematicalVerificationInput = z.infer<typeof createMathematicalVerificationSchema>;
export type UpdateMathematicalVerificationInput = z.infer<typeof updateMathematicalVerificationSchema>;
