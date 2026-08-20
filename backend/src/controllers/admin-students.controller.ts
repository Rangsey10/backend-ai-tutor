import type { Request, Response } from 'express';
import { getFirestore } from '../config/firebase';
import { userConverter } from '../config/firestore-converters';
import { normalizeUserRole } from '../types/user-role';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/ApiResponse';
import { AppError } from '../utils/AppError';

type AdminStudentStatus = 'Active' | 'Needs Review' | 'At Risk';

type AdminStudentRow = {
  id: string;
  name: string;
  grade: string;
  focus: string;
  progress: number;
  sessions: number;
  status: AdminStudentStatus;
  lastSeen: string;
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
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

function formatGrade(value: unknown): string {
  if (typeof value !== 'string' || !value) return 'Unknown';
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => (part.toLowerCase() === 'grade' ? 'Grade' : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');
}

function formatRelativeTime(date: Date | null): string {
  if (!date) return 'No activity yet';
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

function getSubjectName(subject: Record<string, unknown> | undefined, subjectId: string): string {
  const name = subject?.subject_name;
  if (typeof name === 'string' && name.trim()) return name;
  return subjectId
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'No subject';
}

function isNeedsReviewSession(session: Record<string, unknown>): boolean {
  const verification = typeof session.verification_status === 'string' ? session.verification_status.toLowerCase() : '';
  const status = typeof session.session_status === 'string' ? session.session_status.toLowerCase() : '';
  return (
    ['pending', 'needs_review', 'review_required', 'failed', 'rejected', 'unsafe', 'incorrect', 'hallucinated'].includes(
      verification
    ) || ['flagged', 'escalated'].includes(status)
  );
}

function getStatus(progress: number, reviewCount: number, accountStatus: unknown): AdminStudentStatus {
  if (accountStatus === 'suspended' || progress < 50) return 'At Risk';
  if (reviewCount > 0 || progress < 70) return 'Needs Review';
  return 'Active';
}

export const getAdminStudents = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.userId || normalizeUserRole(req.user.role ?? 'student') !== 'admin') {
    throw new AppError('Admin access is required', 403);
  }

  const db = getFirestore();
  const usersRef = db.collection('users').withConverter(userConverter);
  const adminDoc = await usersRef.doc(req.user.userId).get();
  if (!adminDoc.exists || normalizeUserRole(adminDoc.data()!.role) !== 'admin') {
    throw new AppError('Admin access is required', 403);
  }

  const [usersSnapshot, profilesSnapshot, studentSubjectsSnapshot, subjectsSnapshot, sessionsSnapshot, eventsSnapshot] =
    await Promise.all([
      usersRef.get(),
      db.collection('student_profiles').get(),
      db.collection('student_subjects').get(),
      db.collection('subjects').get(),
      db.collection('tutor_sessions').get(),
      db.collection('student_progress_events').get(),
    ]);

  const studentUsers = usersSnapshot.docs.map((doc) => doc.data()).filter((user) => normalizeUserRole(user.role) === 'student');
  const profiles = profilesSnapshot.docs.map((doc) => doc.data());
  const profilesByUserId = new Map(
    profiles.filter((profile) => typeof profile.user_id === 'string').map((profile) => [profile.user_id as string, profile])
  );
  const subjectsById = new Map(
    subjectsSnapshot.docs
      .map((doc) => doc.data())
      .filter((subject) => typeof subject.subject_id === 'string')
      .map((subject) => [subject.subject_id as string, subject])
  );

  const subjectSelectionsByProfile = new Map<string, Record<string, unknown>[]>();
  for (const doc of studentSubjectsSnapshot.docs) {
    const selection = doc.data();
    if (typeof selection.student_profile_id !== 'string') continue;
    const current = subjectSelectionsByProfile.get(selection.student_profile_id) ?? [];
    current.push(selection);
    subjectSelectionsByProfile.set(selection.student_profile_id, current);
  }

  const sessionsByProfile = new Map<string, Record<string, unknown>[]>();
  for (const doc of sessionsSnapshot.docs) {
    const session = doc.data();
    if (typeof session.student_profile_id !== 'string') continue;
    const current = sessionsByProfile.get(session.student_profile_id) ?? [];
    current.push(session);
    sessionsByProfile.set(session.student_profile_id, current);
  }

  const lastEventByUserId = new Map<string, Date>();
  for (const doc of eventsSnapshot.docs) {
    const event = doc.data();
    if (typeof event.user_id !== 'string') continue;
    const createdAt = getDateFromValue(event.created_at);
    if (!createdAt) continue;
    const current = lastEventByUserId.get(event.user_id);
    if (!current || createdAt > current) lastEventByUserId.set(event.user_id, createdAt);
  }

  const rows: AdminStudentRow[] = studentUsers.map((user) => {
    const profile = profilesByUserId.get(user.firebase_uid);
    const profileId = typeof profile?.student_profile_id === 'string' ? profile.student_profile_id : '';
    const selections = profileId ? subjectSelectionsByProfile.get(profileId) ?? [] : [];
    const sessions = profileId ? sessionsByProfile.get(profileId) ?? [] : [];
    const averageProgress =
      selections.length === 0
        ? 0
        : Math.round(
            selections.reduce(
              (total, item) => total + (typeof item.current_progress === 'number' ? item.current_progress : 0),
              0
            ) / selections.length
          );
    const focusSelection =
      [...selections].sort(
        (left, right) =>
          (typeof right.current_progress === 'number' ? right.current_progress : 0) -
          (typeof left.current_progress === 'number' ? left.current_progress : 0)
      )[0] ?? null;
    const focusSubjectId = typeof focusSelection?.subject_id === 'string' ? focusSelection.subject_id : '';
    const lastSessionDate = sessions
      .map((session) => getDateFromValue(session.updated_at) ?? getDateFromValue(session.created_at))
      .filter((date): date is Date => Boolean(date))
      .sort((left, right) => right.getTime() - left.getTime())[0];
    const lastEventDate = lastEventByUserId.get(user.firebase_uid);
    const lastSeen =
      lastSessionDate && lastEventDate
        ? lastSessionDate > lastEventDate
          ? lastSessionDate
          : lastEventDate
        : lastSessionDate ?? lastEventDate ?? null;
    const reviewCount = sessions.filter(isNeedsReviewSession).length;

    return {
      id: profileId ? `STU-${profileId.slice(0, 8)}` : `STU-${user.user_id.slice(0, 8)}`,
      name: (typeof profile?.display_name === 'string' && profile.display_name) || user.full_name,
      grade: formatGrade(profile?.grade_level_id),
      focus: focusSubjectId ? getSubjectName(subjectsById.get(focusSubjectId), focusSubjectId) : 'No subject',
      progress: averageProgress,
      sessions: sessions.length,
      status: getStatus(averageProgress, reviewCount, profile?.account_status ?? user.account_status),
      lastSeen: formatRelativeTime(lastSeen),
    };
  });

  rows.sort((left, right) => left.name.localeCompare(right.name));

  const totalStudents = rows.length;
  const activeToday = rows.filter((student) => ['Just now', 'min ago', 'hr ago'].some((part) => student.lastSeen.includes(part))).length;
  const averageProgress =
    rows.length === 0 ? 0 : Math.round(rows.reduce((total, student) => total + student.progress, 0) / rows.length);
  const needReview = rows.filter((student) => student.status !== 'Active').length;

  sendSuccess(
    res,
    {
      metrics: {
        total_students: {
          value: totalStudents,
          display: formatNumber(totalStudents),
          accent: totalStudents === 1 ? '1 learner' : `${formatNumber(totalStudents)} learners`,
        },
        active_today: {
          value: activeToday,
          display: formatNumber(activeToday),
          accent: activeToday > 0 ? 'Live engagement' : 'No activity today',
        },
        average_progress: {
          value: averageProgress,
          display: formatPercent(averageProgress),
          accent: rows.length > 0 ? 'Across students' : 'No progress yet',
        },
        need_review: {
          value: needReview,
          display: formatNumber(needReview),
          accent: needReview > 0 ? 'Teacher follow-up' : 'No follow-up needed',
        },
      },
      students: rows,
      filters: {
        grades: ['All Grades', ...Array.from(new Set(rows.map((student) => student.grade))).filter((grade) => grade !== 'Unknown')],
        statuses: ['All Status', 'Active', 'Needs Review', 'At Risk'],
      },
    },
    'Admin students loaded'
  );
});
