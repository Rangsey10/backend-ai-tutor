import { Timestamp } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { getFirestore } from '../config/firebase';
import type { ReportedAiResponse } from '../models/reported-ai-responses.model';
import type { CreateStudentTutorReportInput } from '../schemas/reported-ai-responses.schema';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { assertTutorSessionOwnership } from './tutor.service';

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE = /\b(?:\+?\d[\d\s().-]{6,}\d)\b/g;

function redactDetails(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.replace(EMAIL, '[redacted email]').replace(PHONE, '[redacted phone]');
}

export async function createStudentTutorReport(
  userId: string,
  input: CreateStudentTutorReportInput,
): Promise<{ report_id: string; review_status: 'pending'; created_at: string }> {
  // The session check is the ownership boundary. The report never accepts a
  // student ID, AI response text, audio, image, RAG chunk, or solver data.
  await assertTutorSessionOwnership(input.tutor_session_id, userId);
  const now = Timestamp.now();
  const report: ReportedAiResponse = {
    report_id: `tutor-report-${randomUUID()}`,
    student_profile_id: userId,
    tutor_session_id: input.tutor_session_id,
    tutor_turn_id: input.tutor_turn_id,
    report_type: input.reason,
    redacted_details: redactDetails(input.details),
    review_status: 'pending',
    review_history: [{ status: 'pending', changed_at: now, reviewer_id: null }],
    created_at: now,
  };
  try {
    await getFirestore().collection('reported_ai_responses').doc(report.report_id).set(report);
  } catch {
    throw new AppError('Student report storage is unavailable', 503, true, 'TUTOR_REPORT_UNAVAILABLE');
  }
  logger.info('Visual Tutor safety metric', {
    metric: 'student_report_created', user_id: userId, session_id: input.tutor_session_id,
    turn_id: input.tutor_turn_id, reason: input.reason,
  });
  return { report_id: report.report_id, review_status: 'pending', created_at: now.toDate().toISOString() };
}

function iso(value: unknown): string | null {
  return value && typeof (value as { toDate?: unknown }).toDate === 'function'
    ? (value as { toDate: () => Date }).toDate().toISOString() : null;
}

/** Student-safe status list: never return Admin notes, reviewer data, or evidence. */
export async function listStudentTutorReports(userId: string) {
  const snapshot = await getFirestore().collection('reported_ai_responses').where('student_profile_id', '==', userId).get();
  return snapshot.docs.map((doc) => {
    const report = doc.data() as Record<string, unknown>;
    return { report_id: doc.id, tutor_session_id: String(report.tutor_session_id ?? ''), tutor_turn_id: String(report.tutor_turn_id ?? ''), reason: String(report.report_type ?? 'other'), status: String(report.review_status ?? 'pending'), public_resolution_message: typeof report.public_resolution_message === 'string' ? report.public_resolution_message : null, created_at: iso(report.created_at), updated_at: iso(report.updated_at ?? report.created_at) };
  });
}

export async function listStudentNotifications(userId: string) {
  const snapshot = await getFirestore().collection('student_notifications').where('student_id', '==', userId).get();
  return snapshot.docs.map((doc) => {
    const value = doc.data() as Record<string, unknown>;
    return { notification_id: doc.id, type: String(value.type ?? 'general'), title: String(value.title ?? 'Update'), body: String(value.body ?? ''), read_at: iso(value.read_at), created_at: iso(value.created_at) };
  }).sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
}
