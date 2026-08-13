/**
 * Deterministic verifier payload returned by the Python Visual Tutor service.
 * AI teaching text is intentionally not part of this contract.
 */
export type VisualTutorVerificationStatus =
  | 'correct'
  | 'mathematically_valid_but_inefficient'
  | 'invalid'
  | 'incomplete'
  | 'cannot_verify';

export type VisualTutorVerification = {
  status: VisualTutorVerificationStatus;
  verified: boolean;
  normalized_expression?: string | null;
  student_message: string;
  solution?: string | null;
  evidence: Record<string, unknown>;
};
