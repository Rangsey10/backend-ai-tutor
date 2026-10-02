import { Timestamp } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';
import { getFirestore } from '../config/firebase';
import { AppError } from '../utils/AppError';
import { incrementMetric } from './observability.service';

const allowed = new Set(['mark_reviewed', 'resolve', 'escalate', 'restrict_student', 'restore_student_access']);
function safe(value: unknown, max = 500): string | null { return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null; }
function iso(value: unknown): string | null { return value && typeof (value as { toDate?: unknown }).toDate === 'function' ? (value as { toDate: () => Date }).toDate().toISOString() : null; }
export async function listAdminAiReviews(filters: Record<string, unknown>) {
  const snapshot = await getFirestore().collection('reported_ai_responses').get();
  return snapshot.docs.map((doc) => {
    const report = doc.data() as Record<string, unknown>;
    const severity = report.report_type === 'unsafe_unhelpful' ? 'red' : 'amber';
    return { review_id: doc.id, tutor_session_id: safe(report.tutor_session_id), tutor_turn_id: safe(report.tutor_turn_id), student_id: safe(report.student_profile_id), grade_level_id: safe(report.grade_level_id), subject_id: safe(report.subject_id), topic_id: safe(report.topic_id), reason: safe(report.report_type), severity, status: safe(report.review_status) ?? 'pending', evidence: safe(report.redacted_details), created_at: iso(report.created_at), updated_at: iso(report.updated_at ?? report.created_at) };
  }).filter((item) => (!filters.severity || item.severity === filters.severity) && (!filters.status || item.status === filters.status) && (!filters.grade_level_id || item.grade_level_id === filters.grade_level_id) && (!filters.subject_id || item.subject_id === filters.subject_id));
}
export async function decideAdminAiReview(reviewId: string, decision: string, idempotencyKey: string, adminId: string, note?: string) {
  if (!allowed.has(decision)) throw new AppError('Unsupported review decision', 400);
  const db = getFirestore(); const ref = db.collection('reported_ai_responses').doc(reviewId); const doc = await ref.get(); if (!doc.exists) throw new AppError('AI review item not found', 404);
  const idem = db.collection('admin_ai_review_idempotency').doc(`${reviewId}-${idempotencyKey}`); const prior = await idem.get(); if (prior.exists) return doc.data();
  const report = doc.data() as Record<string, unknown>; const status = decision === 'resolve' ? 'resolved' : decision === 'escalate' ? 'escalated' : decision === 'mark_reviewed' ? 'triaged' : String(report.review_status ?? 'pending'); const now = Timestamp.now();
  const studentId = safe(report.student_profile_id); if ((decision === 'restrict_student' || decision === 'restore_student_access') && !studentId) throw new AppError('Review has no student context', 400);
  if (decision === 'restrict_student' || decision === 'restore_student_access') {
    clearStudentAiRestrictionCache(studentId!);
    await db.collection('student_ai_restrictions').doc(studentId!).set({ student_id: studentId, restricted: decision === 'restrict_student', reason: safe(note), updated_by: adminId, updated_at: now }, { merge: true });
    clearStudentAiRestrictionCache(studentId!);
    incrementMetric('student_restriction_events_total');
    await db.collection('student_notifications').doc(`restriction-${reviewId}-${decision}`).set({ student_id: studentId, type: decision, title: decision === 'restrict_student' ? 'Tutor access temporarily unavailable' : 'Tutor access restored', body: decision === 'restrict_student' ? 'Your Tutor access is temporarily unavailable. Please contact your teacher for support.' : 'You can use the Tutor again.', created_at: now, read_at: null }, { merge: true });
  }
  const publicResolution = decision === 'resolve' && safe(note) ? safe(note) : undefined;
  await ref.set({ review_status: status, updated_at: now, review_history: [...(Array.isArray(report.review_history) ? report.review_history : []), { status, changed_at: now, reviewer_id: adminId }], last_review_note: safe(note), ...(publicResolution ? { public_resolution_message: publicResolution } : {}) }, { merge: true });
  if (decision === 'resolve' && studentId) await db.collection('student_notifications').doc(`report-${reviewId}-resolved`).set({ student_id: studentId, type: 'report_resolved', title: 'Your Tutor report was reviewed', body: publicResolution ?? 'Your report has been reviewed. Thank you for helping improve the Tutor.', created_at: now, read_at: null }, { merge: true });
  await idem.set({ review_id: reviewId, decision, idempotency_key: idempotencyKey, admin_id: adminId, created_at: now });
  await db.collection('admin_audit_logs').doc(`ai-review-${reviewId}-${decision}-${randomUUID()}`).set({ actor_id: adminId, action: `ai_review.${decision}`, resource_type: 'ai_review', resource_id: reviewId, student_id: studentId, created_at: now });
  return { ...report, review_status: status, updated_at: now };
}

interface RestrictionCacheEntry {
  restricted: boolean;
  reason: string | null;
  restrictedAt: string | null;
  expiresAt: number;
}
const restrictionCache = new Map<string, RestrictionCacheEntry>();

export function clearStudentAiRestrictionCache(userId?: string): void {
  if (userId) {
    restrictionCache.delete(userId);
  } else {
    restrictionCache.clear();
  }
}

export async function assertStudentAiAccess(userId: string): Promise<void> {
  const cached = restrictionCache.get(userId);
  if (process.env.NODE_ENV !== 'test' && cached && Date.now() < cached.expiresAt) {
    if (cached.restricted) {
      throw new AppError('AI Tutor access is temporarily restricted. Please contact your teacher.', 403, true, 'AI_FEATURE_RESTRICTED');
    }
    return;
  }

  try {
    const doc = await getFirestore().collection('student_ai_restrictions').doc(userId).get();
    const isRestricted = doc.exists && doc.data()?.restricted === true;
    const updatedAt = doc.exists ? (doc.data() as Record<string, unknown>).updated_at : null;
    const reason = isRestricted ? 'Tutor access is temporarily unavailable. Please contact your teacher for support.' : null;

    restrictionCache.set(userId, {
      restricted: isRestricted,
      reason,
      restrictedAt: iso(updatedAt),
      expiresAt: Date.now() + 60_000,
    });

    if (isRestricted) {
      throw new AppError('AI Tutor access is temporarily restricted. Please contact your teacher.', 403, true, 'AI_FEATURE_RESTRICTED');
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    // Log warning and fail open so quota limits or transient db errors do not lock out students
    console.warn(`[assertStudentAiAccess] Firestore check failed for user ${userId}, failing open:`, (error as Error)?.message || error);
    restrictionCache.set(userId, {
      restricted: false,
      reason: null,
      restrictedAt: null,
      expiresAt: Date.now() + 30_000,
    });
  }
}

export async function getStudentAiRestrictionStatus(userId: string) {
  const cached = restrictionCache.get(userId);
  if (process.env.NODE_ENV !== 'test' && cached && Date.now() < cached.expiresAt) {
    return {
      restricted: cached.restricted,
      reason: cached.reason,
      restricted_at: cached.restrictedAt,
      support_guidance: cached.restricted ? 'Contact your teacher or school support team.' : null,
    };
  }

  try {
    const doc = await getFirestore().collection('student_ai_restrictions').doc(userId).get();
    const value = doc.exists ? (doc.data() as Record<string, unknown>) : {};
    const updatedAt = value.updated_at;
    const isRestricted = value.restricted === true;
    const reason = isRestricted ? 'Tutor access is temporarily unavailable. Please contact your teacher for support.' : null;
    const restrictedAt = iso(updatedAt);

    restrictionCache.set(userId, {
      restricted: isRestricted,
      reason,
      restrictedAt,
      expiresAt: Date.now() + 60_000,
    });

    return {
      restricted: isRestricted,
      reason,
      restricted_at: restrictedAt,
      support_guidance: isRestricted ? 'Contact your teacher or school support team.' : null,
    };
  } catch (error) {
    console.warn(`[getStudentAiRestrictionStatus] Firestore check failed for user ${userId}, returning unrestricted status:`, (error as Error)?.message || error);
    return { restricted: false, reason: null, restricted_at: null, support_guidance: null };
  }
}
