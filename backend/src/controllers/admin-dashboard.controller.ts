import type { Request, Response } from 'express';
import { getFirestore } from '../config/firebase';
import { userConverter } from '../config/firestore-converters';
import { normalizeUserRole } from '../types/user-role';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/ApiResponse';
import { AppError } from '../utils/AppError';

type DashboardMetric = {
  value: number;
  display: string;
  accent: string;
};

type StudentActivityPoint = {
  label: string;
  value: number;
};

type CurriculumStatusItem = {
  subject_id: string;
  label: string;
  selected_students: number;
  average_progress: number;
  value: number;
  color: string;
};

type FlaggedAiSession = {
  id: string;
  name: string;
  subject: string;
  grade: string;
  reason: string;
  status: 'Amber' | 'Red';
  time: string;
};

type DashboardNotification = {
  id: string;
  title: string;
  body: string;
  time: string;
  tone: 'amber' | 'rose' | 'blue';
};

type DashboardUserLookup = {
  full_name?: string | null;
};

type DashboardPayload = {
  admin: {
    user_id: string;
    firebase_uid: string;
    email: string;
    full_name: string;
    role: string;
    profile_image_url?: string | null;
  };
  metrics: Record<string, DashboardMetric>;
  insights: {
    student_activity: {
      last_7_days: StudentActivityPoint[];
      last_30_days: StudentActivityPoint[];
    };
    curriculum_status: {
      overall_progress: number;
      subjects: CurriculumStatusItem[];
    };
    flagged_ai_sessions: FlaggedAiSession[];
    notifications: DashboardNotification[];
  };
};

const SUBJECT_COLORS = ['#5368ff', '#1fc7e9', '#7a4dff', '#22c55e', '#f59e0b'];
const DASHBOARD_CACHE_TTL_MS = 20_000;
const dashboardCache = new Map<string, { expiresAt: number; payload: DashboardPayload }>();

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function formatQualityScore(value: number | null): string {
  return value === null ? '0.0' : value.toFixed(1);
}

function isActiveSession(status: unknown): boolean {
  return typeof status === 'string' && ['active', 'in_progress', 'live'].includes(status.toLowerCase());
}

function isVerifiedGoodSession(status: unknown): boolean {
  return (
    typeof status === 'string' &&
    ['verified', 'passed', 'approved', 'correct', 'safe'].includes(status.toLowerCase())
  );
}

function qualityAccent(score: number | null): string {
  if (score === null) return 'No reviews yet';
  if (score >= 4.5) return 'Excellent';
  if (score >= 3.5) return 'Good';
  if (score >= 2.5) return 'Needs review';
  return 'Needs attention';
}

function getDateFromValue(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate();
  }
  return null;
}

function getDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function thirtyDaysAgo(): Date {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  date.setHours(0, 0, 0, 0);
  return date;
}

async function getCount(query: FirebaseFirestore.Query): Promise<number> {
  const snapshot = await query.count().get();
  return snapshot.data().count;
}

function buildStudentActivity(
  progressEvents: FirebaseFirestore.QueryDocumentSnapshot[],
  sessions: Record<string, unknown>[],
  rangeDays: 7 | 30
): StudentActivityPoint[] {
  const now = new Date();
  const days = Array.from({ length: rangeDays }, (_item, index) => {
    const day = new Date(now);
    day.setDate(now.getDate() - (rangeDays - 1 - index));
    return day;
  });
  const counts = new Map(days.map((day) => [getDayKey(day), 0]));

  for (const doc of progressEvents) {
    const createdAt = getDateFromValue(doc.data().created_at);
    if (!createdAt) continue;
    const key = getDayKey(createdAt);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  for (const session of sessions) {
    const createdAt = getDateFromValue(session.created_at);
    if (!createdAt) continue;
    const key = getDayKey(createdAt);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return days.map((day) => ({
    label:
      rangeDays === 7
        ? day.toLocaleDateString('en-US', { weekday: 'short' })
        : day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: counts.get(getDayKey(day)) ?? 0,
  }));
}

function getSubjectName(subject: Record<string, unknown> | undefined, subjectId: string): string {
  const name = subject?.subject_name;
  if (typeof name === 'string' && name.trim()) return name;
  return subjectId
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Unknown';
}

function formatGrade(value: unknown): string {
  if (typeof value !== 'string' || !value) return 'Unknown';
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => (part.toLowerCase() === 'grade' ? 'Grade' : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');
}

function formatRelativeTime(date: Date | null): string {
  if (!date) return 'Unknown time';
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function getFlagReason(session: Record<string, unknown>): string {
  const verification = typeof session.verification_status === 'string' ? session.verification_status.toLowerCase() : '';
  const status = typeof session.session_status === 'string' ? session.session_status.toLowerCase() : '';
  const intent = typeof session.detected_intent === 'string' ? session.detected_intent : '';
  const problemType = typeof session.detected_problem_type === 'string' ? session.detected_problem_type : '';

  if (['failed', 'rejected', 'unsafe', 'incorrect', 'hallucinated'].includes(verification)) {
    return 'AI response failed verification';
  }
  if (['pending', 'needs_review', 'review_required'].includes(verification)) {
    return 'Needs teacher review';
  }
  if (['flagged', 'escalated'].includes(status)) {
    return 'Session escalated for review';
  }
  if (intent || problemType) {
    return [intent, problemType].filter(Boolean).join(' / ');
  }
  return 'Review recommended';
}

function getFlagStatus(session: Record<string, unknown>): 'Amber' | 'Red' {
  const verification = typeof session.verification_status === 'string' ? session.verification_status.toLowerCase() : '';
  const status = typeof session.session_status === 'string' ? session.session_status.toLowerCase() : '';
  if (['failed', 'rejected', 'unsafe', 'incorrect', 'hallucinated'].includes(verification)) return 'Red';
  if (['flagged', 'escalated'].includes(status)) return 'Red';
  return 'Amber';
}

function isFlaggedSession(session: Record<string, unknown>): boolean {
  const verification = typeof session.verification_status === 'string' ? session.verification_status.toLowerCase() : '';
  const status = typeof session.session_status === 'string' ? session.session_status.toLowerCase() : '';
  return (
    ['pending', 'needs_review', 'review_required', 'failed', 'rejected', 'unsafe', 'incorrect', 'hallucinated'].includes(
      verification
    ) || ['flagged', 'escalated'].includes(status)
  );
}

function buildFlaggedSessions(
  sessions: FirebaseFirestore.QueryDocumentSnapshot[],
  profilesById: Map<string, Record<string, unknown>>,
  usersByFirebaseUid: Map<string, DashboardUserLookup>,
  subjectsById: Map<string, Record<string, unknown>>
): FlaggedAiSession[] {
  return sessions
    .map((doc) => ({ id: doc.id, data: doc.data() }))
    .filter(({ data }) => isFlaggedSession(data))
    .sort((left, right) => {
      const leftDate = getDateFromValue(left.data.updated_at) ?? getDateFromValue(left.data.created_at);
      const rightDate = getDateFromValue(right.data.updated_at) ?? getDateFromValue(right.data.created_at);
      return (rightDate?.getTime() ?? 0) - (leftDate?.getTime() ?? 0);
    })
    .slice(0, 20)
    .map(({ id, data }) => {
      const profile = typeof data.student_profile_id === 'string' ? profilesById.get(data.student_profile_id) : undefined;
      const user = typeof profile?.user_id === 'string' ? usersByFirebaseUid.get(profile.user_id) : undefined;
      const subjectId = typeof data.subject_id === 'string' ? data.subject_id : '';
      const updatedAt = getDateFromValue(data.updated_at) ?? getDateFromValue(data.created_at);

      return {
        id: data.tutor_session_id === id || typeof data.tutor_session_id !== 'string' ? `#${id.slice(0, 8)}` : `#${data.tutor_session_id}`,
        name:
          (typeof profile?.display_name === 'string' && profile.display_name) ||
          user?.full_name ||
          'Unknown student',
        subject: getSubjectName(subjectsById.get(subjectId), subjectId || 'unknown'),
        grade: formatGrade(profile?.grade_level_id),
        reason: getFlagReason(data),
        status: getFlagStatus(data),
        time: formatRelativeTime(updatedAt),
      };
    });
}

function buildCurriculumStatus(
  selectedSubjects: Record<string, unknown>[],
  subjectsById: Map<string, Record<string, unknown>>,
  sessionDocs: Record<string, unknown>[],
  progressEvents: FirebaseFirestore.QueryDocumentSnapshot[]
): CurriculumStatusItem[] {
  const stats = new Map<
    string,
    {
      selected: number;
      progressTotal: number;
      progressCount: number;
      performanceTotal: number;
      performanceCount: number;
      activityCount: number;
    }
  >();

  function ensure(subjectId: string) {
    if (!stats.has(subjectId)) {
      stats.set(subjectId, {
        selected: 0,
        progressTotal: 0,
        progressCount: 0,
        performanceTotal: 0,
        performanceCount: 0,
        activityCount: 0,
      });
    }
    return stats.get(subjectId)!;
  }

  for (const item of selectedSubjects) {
    if (typeof item.subject_id !== 'string' || !item.subject_id) continue;
    const stat = ensure(item.subject_id);
    stat.selected += 1;
    if (typeof item.current_progress === 'number') {
      stat.progressTotal += item.current_progress;
      stat.progressCount += 1;
    }
  }

  for (const session of sessionDocs) {
    if (typeof session.subject_id !== 'string' || !session.subject_id) continue;
    ensure(session.subject_id).activityCount += 1;
  }

  for (const doc of progressEvents) {
    const event = doc.data();
    if (typeof event.subject_id !== 'string' || !event.subject_id) continue;
    const stat = ensure(event.subject_id);
    stat.activityCount += 1;
    if (typeof event.score === 'number') {
      stat.performanceTotal += event.score;
      stat.performanceCount += 1;
    } else if (typeof event.is_correct === 'boolean') {
      stat.performanceTotal += event.is_correct ? 100 : 0;
      stat.performanceCount += 1;
    }
  }

  return Array.from(stats.entries())
    .map(([subjectId, stat], index) => {
      const progressAverage =
        stat.progressCount === 0 ? 0 : Math.round(stat.progressTotal / stat.progressCount);
      const performanceAverage =
        stat.performanceCount === 0 ? progressAverage : Math.round(stat.performanceTotal / stat.performanceCount);
      const insightScore =
        stat.performanceCount === 0
          ? progressAverage
          : Math.round(progressAverage * 0.45 + performanceAverage * 0.45 + Math.min(stat.activityCount, 10) * 1);

      return {
        subject_id: subjectId,
        label: getSubjectName(subjectsById.get(subjectId), subjectId),
        selected_students: stat.selected,
        average_progress: progressAverage,
        value: Math.max(0, Math.min(100, insightScore)),
        color: SUBJECT_COLORS[index % SUBJECT_COLORS.length],
      };
    })
    .sort((left, right) => right.selected_students - left.selected_students || right.value - left.value)
    .slice(0, 5);
}

function buildNotifications(
  flaggedSessions: FlaggedAiSession[],
  curriculumSubjects: CurriculumStatusItem[],
  activity: StudentActivityPoint[],
  activeSessions: number
): DashboardNotification[] {
  const notifications: DashboardNotification[] = [];
  const redFlags = flaggedSessions.filter((session) => session.status === 'Red').length;

  if (flaggedSessions.length > 0) {
    notifications.push({
      id: 'ai-review-queue',
      title: 'AI review queue',
      body:
        redFlags > 0
          ? `${redFlags} high-priority AI session${redFlags === 1 ? '' : 's'} need review`
          : `${flaggedSessions.length} AI session${flaggedSessions.length === 1 ? '' : 's'} need review`,
      time: flaggedSessions[0]?.time ?? 'Just now',
      tone: redFlags > 0 ? 'rose' : 'amber',
    });
  }

  const weakestSubject = [...curriculumSubjects].sort((left, right) => left.value - right.value)[0];
  if (weakestSubject && weakestSubject.value < 50) {
    notifications.push({
      id: `curriculum-risk-${weakestSubject.subject_id}`,
      title: 'Curriculum risk alert',
      body: `${weakestSubject.label} is at ${weakestSubject.value}% across selected students`,
      time: 'Updated now',
      tone: 'rose',
    });
  }

  const todayActivity = activity.at(-1)?.value ?? 0;
  if (todayActivity > 0) {
    notifications.push({
      id: 'student-activity',
      title: 'Student activity',
      body: `${todayActivity} learning event${todayActivity === 1 ? '' : 's'} recorded today`,
      time: 'Today',
      tone: 'blue',
    });
  }

  if (activeSessions > 0) {
    notifications.push({
      id: 'active-ai-sessions',
      title: 'Active AI sessions',
      body: `${activeSessions} AI session${activeSessions === 1 ? '' : 's'} currently active`,
      time: 'Live now',
      tone: 'blue',
    });
  }

  return notifications.slice(0, 6);
}

export const getAdminDashboard = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.userId || normalizeUserRole(req.user.role ?? 'student') !== 'admin') {
    throw new AppError('Admin access is required', 403);
  }

  const cached = dashboardCache.get(req.user.userId);
  if (cached && cached.expiresAt > Date.now()) {
    sendSuccess(res, cached.payload, 'Admin dashboard loaded');
    return;
  }

  const db = getFirestore();
  const usersRef = db.collection('users').withConverter(userConverter);
  const adminDoc = await usersRef.doc(req.user.userId).get();

  if (!adminDoc.exists) {
    throw new AppError('Admin account not found', 404);
  }

  const admin = adminDoc.data()!;
  if (normalizeUserRole(admin.role) !== 'admin') {
    throw new AppError('Admin access is required', 403);
  }

  const [
    studentUserCount,
    profileCount,
    profilesSnapshot,
    sessionsSnapshot,
    totalTopicCount,
    activeTopicCount,
    subjectsSnapshot,
    studentSubjectsSnapshot,
    progressEventsSnapshot,
  ] = await Promise.all([
    getCount(usersRef.where('role', '==', 'student')),
    getCount(db.collection('student_profiles')),
    db.collection('student_profiles').limit(500).get(),
    db.collection('tutor_sessions').orderBy('updated_at', 'desc').limit(250).get(),
    getCount(db.collection('topics')),
    getCount(db.collection('topics').where('status', '==', 'active')),
    db.collection('subjects').get(),
    db.collection('student_subjects').get(),
    db.collection('student_progress_events').where('created_at', '>=', thirtyDaysAgo()).get(),
  ]);

  const totalStudents = Math.max(studentUserCount, profileCount);
  const sessionDocs = sessionsSnapshot.docs.map((doc) => doc.data());
  const activeSessions = sessionDocs.filter((session) => isActiveSession(session.session_status)).length;
  const totalTopics = totalTopicCount;
  const activeTopics = activeTopicCount;
  const curriculumProgress = totalTopics === 0 ? 0 : (activeTopics / totalTopics) * 100;
  const reviewedSessions = sessionDocs.filter((session) => typeof session.verification_status === 'string');
  const goodSessions = reviewedSessions.filter((session) => isVerifiedGoodSession(session.verification_status));
  const qualityScore =
    reviewedSessions.length === 0 ? null : Math.max(0, Math.min(5, (goodSessions.length / reviewedSessions.length) * 5));
  const subjectsById = new Map(
    subjectsSnapshot.docs
      .map((doc) => doc.data())
      .filter((subject) => typeof subject.subject_id === 'string')
      .map((subject) => [subject.subject_id as string, subject])
  );
  const profilesById = new Map(
    profilesSnapshot.docs
      .map((doc) => doc.data())
      .filter((profile) => typeof profile.student_profile_id === 'string')
      .map((profile) => [profile.student_profile_id as string, profile])
  );
  const usersByFirebaseUid = new Map(
    [admin]
      .filter((user) => typeof user.firebase_uid === 'string')
      .map((user) => [user.firebase_uid as string, user])
  );
  const selectedSubjectDocs = studentSubjectsSnapshot.docs.map((doc) => doc.data());
  const studentActivity = {
    last_7_days: buildStudentActivity(progressEventsSnapshot.docs, sessionDocs, 7),
    last_30_days: buildStudentActivity(progressEventsSnapshot.docs, sessionDocs, 30),
  };
  const curriculumStatus = {
    overall_progress:
      selectedSubjectDocs.length === 0
        ? Math.round(curriculumProgress)
        : Math.round(
            selectedSubjectDocs.reduce(
              (total, item) => total + (typeof item.current_progress === 'number' ? item.current_progress : 0),
              0
            ) / selectedSubjectDocs.length
          ),
    subjects: buildCurriculumStatus(selectedSubjectDocs, subjectsById, sessionDocs, progressEventsSnapshot.docs),
  };
  const flaggedAiSessions = buildFlaggedSessions(
    sessionsSnapshot.docs,
    profilesById,
    usersByFirebaseUid,
    subjectsById
  );
  const notifications = buildNotifications(
    flaggedAiSessions,
    curriculumStatus.subjects,
    studentActivity.last_7_days,
    activeSessions
  );
  const selectedSubjectCount = selectedSubjectDocs.length;
  const curriculumMetricAccent =
    selectedSubjectCount > 0
      ? `${formatNumber(selectedSubjectCount)} selected subjects`
      : totalTopics === 0
        ? 'No student subjects yet'
        : `${activeTopics}/${totalTopics} active topics`;

  const metrics: Record<string, DashboardMetric> = {
    total_students: {
      value: totalStudents,
      display: formatNumber(totalStudents),
      accent: totalStudents === 1 ? '1 learner' : `${formatNumber(totalStudents)} learners`,
    },
    active_ai_sessions: {
      value: activeSessions,
      display: formatNumber(activeSessions),
      accent: activeSessions > 0 ? 'Live now' : 'No live sessions',
    },
    curriculum_progress: {
      value: curriculumStatus.overall_progress,
      display: formatPercent(curriculumStatus.overall_progress),
      accent: curriculumMetricAccent,
    },
    ai_quality_score: {
      value: qualityScore ?? 0,
      display: formatQualityScore(qualityScore),
      accent: qualityAccent(qualityScore),
    },
  };

  const payload: DashboardPayload = {
      admin: {
        user_id: admin.user_id,
        firebase_uid: admin.firebase_uid,
        email: admin.email,
        full_name: admin.full_name,
        role: admin.role,
        profile_image_url: admin.profile_image_url,
      },
      metrics,
      insights: {
        student_activity: studentActivity,
        curriculum_status: curriculumStatus,
        flagged_ai_sessions: flaggedAiSessions,
        notifications,
      },
    };

  dashboardCache.set(req.user.userId, {
    expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS,
    payload,
  });

  sendSuccess(res, payload, 'Admin dashboard loaded');
});
