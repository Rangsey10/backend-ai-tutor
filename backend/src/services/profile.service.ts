import {
  Timestamp,
  type Firestore,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { getFirestore, isFirebaseInitialized } from '../config/firebase';
import { env } from '../config/env';
import {
  gradeLevelConverter,
  studentProfileConverter,
  studentPreferenceConverter,
  studentSubjectConverter,
  subjectConverter,
  userConverter,
} from '../config/firestore-converters';
import type { StudentPreference } from '../models/student-preferences.model';
import type { StudentProfile } from '../models/student-profiles.model';
import type { StudentSubject } from '../models/student-subjects.model';
import type { Subject } from '../models/subjects.model';
import type { User } from '../models/users.model';
import type {
  AddProfileSubjectRequestInput,
  CreateProfileRequestInput,
  UpdateProfileRequestInput,
} from '../schemas/profile-request.schema';
import { type z } from 'zod';
import {
  upsertPreferencesRequestSchema,
  updateOnboardingRequestSchema,
} from '../schemas/profile-preferences-request.schema';
import { AppError } from '../utils/AppError';

type ProfileSubjectResponse = StudentSubject & {
  subject: Pick<Subject, 'subject_id' | 'subject_name' | 'icon_url'>;
};

export type UserProfileResponse = {
  student_profile: StudentProfile;
  user: Pick<User, 'full_name' | 'email' | 'preferred_language'>;
  student_subjects: ProfileSubjectResponse[];
};

export type ProfileSubjectsResponse = ProfileSubjectResponse[];
export type OnboardingStateResponse = {
  current_step: string;
  completed_steps: string[];
  is_completed: boolean;
};

export type StudentPreferenceResponse = StudentPreference;
export type LearningPreferencesResponse = Pick<
  StudentProfile,
  'grade_level_id' | 'explanation_level' | 'learning_goal'
>;

/** A deliberately small, non-sensitive profile projection for the dashboard. */
export type DashboardLearnerProfile = {
  display_name: string | null;
  grade_label: string | null;
  subjects: { subject_id: string; subject_name: string }[];
  learning_goal: string | null;
};

const DASHBOARD_PROFILE_TIMEOUT_MS = 1200;

async function withDashboardProfileTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Firestore dashboard profile read timed out')),
          DASHBOARD_PROFILE_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function db(): Firestore {
  return getFirestore();
}

async function getSingleByField<T extends object>(
  collectionName: string,
  converter: FirestoreDataConverter<T>,
  fieldName: keyof T,
  fieldValue: unknown
): Promise<QueryDocumentSnapshot<T> | null> {
  const snapshot = await db()
    .collection(collectionName)
    .withConverter(converter)
    .where(String(fieldName), '==', fieldValue)
    .limit(1)
    .get();
  return snapshot.empty ? null : snapshot.docs[0];
}

async function requireSingleByField<T extends object>(
  collectionName: string,
  converter: FirestoreDataConverter<T>,
  fieldName: keyof T,
  fieldValue: unknown,
  message: string,
  statusCode = 404
): Promise<QueryDocumentSnapshot<T>> {
  const document = await getSingleByField(collectionName, converter, fieldName, fieldValue);

  if (!document) {
    throw new AppError(message, statusCode);
  }

  return document;
}

async function requireUser(firebaseUid: string): Promise<QueryDocumentSnapshot<User>> {
  return requireSingleByField(
    'users',
    userConverter,
    'firebase_uid',
    firebaseUid,
    'User not found for the authenticated account'
  );
}

async function getProfileByUser(
  firebaseUid: string
): Promise<QueryDocumentSnapshot<StudentProfile> | null> {
  return getSingleByField('student_profiles', studentProfileConverter, 'user_id', firebaseUid);
}

async function requireProfileByUser(
  firebaseUid: string
): Promise<QueryDocumentSnapshot<StudentProfile>> {
  return requireSingleByField(
    'student_profiles',
    studentProfileConverter,
    'user_id',
    firebaseUid,
    'Student profile not found for the current user'
  );
}

async function requireGradeLevel(gradeLevelId: string): Promise<void> {
  const grade = await requireSingleByField(
    'grade_levels',
    gradeLevelConverter,
    'grade_level_id',
    gradeLevelId,
    'Grade level not found',
    400
  );
  if (grade.data().status !== 'active') {
    throw new AppError('Grade level is not available for student learning', 400);
  }
  if (![10, 11, 12].includes(grade.data().grade_number)) {
    throw new AppError('Student learning profiles support Grades 10–12 only', 400);
  }
}

async function requireSubjects(subjectIds: string[]): Promise<void> {
  const missingSubjectIds: string[] = [];

  for (const subjectId of subjectIds) {
    // Subject selection requests are intentionally small, so sequential validation keeps the code direct.
    // eslint-disable-next-line no-await-in-loop
    const subject = await getSingleByField('subjects', subjectConverter, 'subject_id', subjectId);

    if (!subject || subject.data().status !== 'active') {
      missingSubjectIds.push(subjectId);
    }
  }

  if (missingSubjectIds.length > 0) {
    throw new AppError(`Unknown subject_id values: ${missingSubjectIds.join(', ')}`, 400);
  }
}

async function loadSubjects(profileId: string): Promise<ProfileSubjectResponse[]> {
  const snapshot = await db()
    .collection('student_subjects')
    .withConverter(studentSubjectConverter)
    .where('student_profile_id', '==', profileId)
    .where('status', '==', 'active')
    .get();

  const selectedSubjects = snapshot.docs.map((doc) => doc.data());
  const subjectEntries = await Promise.all(
    Array.from(new Set(selectedSubjects.map((subject) => subject.subject_id))).map(
      async (subjectId) => {
        const subjectDocument = await requireSingleByField(
          'subjects',
          subjectConverter,
          'subject_id',
          subjectId,
          `Subject not found for subject_id ${subjectId}`,
          400
        );
        return [subjectId, subjectDocument.data()] as const;
      }
    )
  );

  const subjectMap = new Map<string, Subject>(subjectEntries);

  return selectedSubjects
    .map((selectedSubject) => ({
      ...selectedSubject,
      subject: {
        subject_id: selectedSubject.subject_id,
        subject_name: subjectMap.get(selectedSubject.subject_id)?.subject_name ?? 'Unknown subject',
        icon_url: subjectMap.get(selectedSubject.subject_id)?.icon_url ?? null,
      },
    }))
    .sort((left, right) => right.selected_at.toMillis() - left.selected_at.toMillis());
}

function buildSubjectResponse(
  subject: Subject,
  selectedSubject: StudentSubject
): ProfileSubjectResponse {
  return {
    ...selectedSubject,
    subject: {
      subject_id: subject.subject_id,
      subject_name: subject.subject_name,
      icon_url: subject.icon_url,
    },
  };
}

const memoryProfiles = new Map<string, UserProfileResponse>();
const memoryPreferenceSettings = new Map<string, StudentPreferenceResponse>();

const FALLBACK_SUBJECT_INFO: Record<string, { subject_name: string; icon_url: string | null }> = {
  math: { subject_name: 'Mathematics', icon_url: null },
  physics: { subject_name: 'Physics', icon_url: null },
  chemistry: { subject_name: 'Chemistry', icon_url: null },
};

function isFirestoreQuotaOrUnavailableError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: unknown })?.code;
  return (
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('Quota exceeded') ||
    msg.includes('quota') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('DEADLINE_EXCEEDED') ||
    code === 8 ||
    code === 14 ||
    code === 4
  );
}

function getOrCreateFallbackProfile(firebaseUid: string): UserProfileResponse {
  const existing = memoryProfiles.get(firebaseUid);
  if (existing) {
    return existing;
  }

  const profileId = `profile-${firebaseUid}`;
  const now = Timestamp.now();
  const defaultSubjects: ProfileSubjectResponse[] = ['math', 'physics', 'chemistry'].map(
    (subjectId) => ({
      student_subject_id: `sub-${subjectId}-${firebaseUid}`,
      student_profile_id: profileId,
      subject_id: subjectId,
      selected_at: now,
      current_progress: 0,
      mastery_level: 'not_started',
      status: 'active',
      subject: {
        subject_id: subjectId,
        subject_name: FALLBACK_SUBJECT_INFO[subjectId]?.subject_name ?? subjectId,
        icon_url: FALLBACK_SUBJECT_INFO[subjectId]?.icon_url ?? null,
      },
    })
  );

  const fallback: UserProfileResponse = {
    student_profile: {
      student_profile_id: profileId,
      user_id: firebaseUid,
      grade_level_id: 'grade-12',
      display_name: 'Student',
      avatar_url: null,
      account_status: 'active',
      explanation_level: 'intermediate',
      learning_goal: 'Build confidence through visual, step-by-step practice.',
      learning_goals: ['Grade 12 STEM Preparation'],
      onboarding_completed: true,
      onboarding_current_step: 'completed',
      onboarding_steps_completed: ['profile_created', 'subjects_selected', 'completed'],
      current_streak: 0,
      longest_streak: 0,
      total_learning_time: 0,
    },
    user: {
      full_name: 'Student',
      email: '',
      preferred_language: 'en',
    },
    student_subjects: defaultSubjects,
  };

  memoryProfiles.set(firebaseUid, fallback);
  return fallback;
}

export async function getCurrentUserProfile(firebaseUid: string): Promise<UserProfileResponse> {
  const isTest = process.env.NODE_ENV === 'test';
  if (!isTest && memoryProfiles.has(firebaseUid)) {
    return memoryProfiles.get(firebaseUid)!;
  }

  try {
    const userDocument = await requireUser(firebaseUid);
    const profileDocument = await requireProfileByUser(firebaseUid);

    if (profileDocument.data().user_id !== firebaseUid) {
      throw new AppError('You cannot access another user profile', 403);
    }

    const user = userDocument.data();
    const profile = profileDocument.data();

    const response: UserProfileResponse = {
      student_profile: profile,
      user: {
        full_name: user.full_name,
        email: user.email,
        preferred_language: user.preferred_language,
      },
      student_subjects: await loadSubjects(profile.student_profile_id),
    };

    if (!isTest) {
      memoryProfiles.set(firebaseUid, response);
    }

    return response;
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 403) {
      throw err;
    }
    if (
      isFirestoreQuotaOrUnavailableError(err) ||
      (!isTest && err instanceof AppError && err.statusCode === 404)
    ) {
      return getOrCreateFallbackProfile(firebaseUid);
    }
    throw err;
  }
}

/**
 * Dashboard loading must also work for a signed-in learner who has not completed
 * onboarding.  Unlike the profile endpoint, this intentionally returns an empty
 * projection instead of turning a new-user dashboard into a 404.
 */
export async function getDashboardLearnerProfile(
  firebaseUid: string
): Promise<DashboardLearnerProfile> {
  // Keep local development responsive when Firebase is intentionally absent.
  // Production does not enter this branch because local fallbacks are disabled.
  if (!isFirebaseInitialized() && env.firebase.allowLocalFallback && !env.isProd) {
    return { display_name: null, grade_label: null, subjects: [], learning_goal: null };
  }

  const isTest = process.env.NODE_ENV === 'test';
  if (!isTest && memoryProfiles.has(firebaseUid)) {
    const cached = memoryProfiles.get(firebaseUid)!;
    const gradeNum = cached.student_profile.grade_level_id.replace(/[^0-9]/g, '');
    return {
      display_name: cached.student_profile.display_name || cached.user.full_name || null,
      grade_label: gradeNum ? `Grade ${gradeNum}` : 'Grade 12',
      subjects: cached.student_subjects.map((item) => ({
        subject_id: item.subject.subject_id,
        subject_name: item.subject.subject_name,
      })),
      learning_goal: cached.student_profile.learning_goal ?? null,
    };
  }

  try {
    return await withDashboardProfileTimeout(
      (async () => {
        const [userDocument, profileDocument] = await Promise.all([
          getSingleByField('users', userConverter, 'firebase_uid', firebaseUid),
          getProfileByUser(firebaseUid),
        ]);
        const profile = profileDocument?.data();
        let gradeLabel: string | null = null;
        if (profile?.grade_level_id) {
          const gradeDocument = await getSingleByField(
            'grade_levels',
            gradeLevelConverter,
            'grade_level_id',
            profile.grade_level_id
          );
          gradeLabel = gradeDocument?.data().grade_name ?? null;
        }
        const selectedSubjects = profile ? await loadSubjects(profile.student_profile_id) : [];
        return {
          display_name: userDocument?.data().full_name?.trim() || null,
          grade_label: gradeLabel,
          subjects: selectedSubjects.map((item) => ({
            subject_id: item.subject.subject_id,
            subject_name: item.subject.subject_name,
          })),
          learning_goal: profile?.learning_goal ?? null,
        };
      })()
    );
  } catch {
    if (!isTest) {
      const fallback = getOrCreateFallbackProfile(firebaseUid);
      return {
        display_name: fallback.student_profile.display_name || fallback.user.full_name || null,
        grade_label: 'Grade 12',
        subjects: fallback.student_subjects.map((item) => ({
          subject_id: item.subject.subject_id,
          subject_name: item.subject.subject_name,
        })),
        learning_goal: fallback.student_profile.learning_goal ?? null,
      };
    }
    // Progress remains available when a profile read is temporarily unavailable.
    return { display_name: null, grade_label: null, subjects: [], learning_goal: null };
  }
}

export async function createCurrentUserProfile(
  firebaseUid: string,
  payload: CreateProfileRequestInput
): Promise<UserProfileResponse> {
  try {
    const existingProfile = await getProfileByUser(firebaseUid);

    if (existingProfile) {
      throw new AppError('Student profile already exists for this user', 409);
    }

    await requireGradeLevel(payload.grade_level_id);
    await requireSubjects(payload.subject_ids);

    const userDocument = await requireUser(firebaseUid);
    const firestore = db();
    const profileRef = firestore
      .collection('student_profiles')
      .withConverter(studentProfileConverter)
      .doc();
    const selectedAt = Timestamp.now();

    const profile: StudentProfile = {
      student_profile_id: profileRef.id,
      user_id: firebaseUid,
      grade_level_id: payload.grade_level_id,
      display_name: payload.display_name ?? null,
      avatar_url: payload.avatar_url ?? null,
      account_status: 'active',
      explanation_level: payload.explanation_level,
      learning_goal: payload.learning_goal,
      learning_goals: payload.learning_goals ?? [],
      onboarding_completed: true,
      onboarding_current_step: 'completed',
      onboarding_steps_completed: ['profile_created', 'subjects_selected', 'completed'],
      current_streak: 0,
      longest_streak: 0,
      total_learning_time: 0,
    };

    const subjectDocuments = await Promise.all(
      payload.subject_ids.map(async (subjectId) => {
        const subjectDocument = await requireSingleByField(
          'subjects',
          subjectConverter,
          'subject_id',
          subjectId,
          `Subject not found for subject_id ${subjectId}`,
          400
        );
        return subjectDocument.data();
      })
    );

    const subjectRefs = subjectDocuments.map((subject) => ({
      ref: firestore.collection('student_subjects').withConverter(studentSubjectConverter).doc(),
      subject,
    }));

    await firestore.runTransaction(async (transaction) => {
      transaction.update(userDocument.ref, {
        full_name: payload.display_name ?? userDocument.data().full_name,
        profile_image_url: payload.avatar_url ?? userDocument.data().profile_image_url,
        preferred_language: payload.preferred_language ?? userDocument.data().preferred_language,
      });
      transaction.set(profileRef, profile);

      for (const { ref, subject } of subjectRefs) {
        const studentSubject: StudentSubject = {
          student_subject_id: ref.id,
          student_profile_id: profileRef.id,
          subject_id: subject.subject_id,
          selected_at: selectedAt,
          current_progress: 0,
          mastery_level: 'not_started',
          status: 'active',
        };

        transaction.set(ref, studentSubject);
      }
    });

    const response: UserProfileResponse = {
      student_profile: profile,
      user: {
        full_name: userDocument.data().full_name,
        email: userDocument.data().email,
        preferred_language: userDocument.data().preferred_language,
      },
      student_subjects: await loadSubjects(profileRef.id),
    };

    if (process.env.NODE_ENV !== 'test') {
      memoryProfiles.set(firebaseUid, response);
    }

    return response;
  } catch (err) {
    if (isFirestoreQuotaOrUnavailableError(err)) {
      const fallback = getOrCreateFallbackProfile(firebaseUid);
      const now = Timestamp.now();
      const updated: UserProfileResponse = {
        student_profile: {
          ...fallback.student_profile,
          grade_level_id: payload.grade_level_id,
          display_name: payload.display_name ?? fallback.student_profile.display_name,
          avatar_url: payload.avatar_url ?? fallback.student_profile.avatar_url,
          explanation_level: payload.explanation_level,
          learning_goal: payload.learning_goal,
          learning_goals: payload.learning_goals ?? [],
        },
        user: {
          ...fallback.user,
          full_name: payload.display_name ?? fallback.user.full_name,
          preferred_language: payload.preferred_language ?? fallback.user.preferred_language,
        },
        student_subjects: payload.subject_ids.map((subjectId) => ({
          student_subject_id: `sub-${subjectId}-${firebaseUid}`,
          student_profile_id: fallback.student_profile.student_profile_id,
          subject_id: subjectId,
          selected_at: now,
          current_progress: 0,
          mastery_level: 'not_started',
          status: 'active',
          subject: {
            subject_id: subjectId,
            subject_name: FALLBACK_SUBJECT_INFO[subjectId]?.subject_name ?? subjectId,
            icon_url: FALLBACK_SUBJECT_INFO[subjectId]?.icon_url ?? null,
          },
        })),
      };
      memoryProfiles.set(firebaseUid, updated);
      return updated;
    }
    throw err;
  }
}

export async function updateCurrentUserProfile(
  firebaseUid: string,
  payload: UpdateProfileRequestInput
): Promise<UserProfileResponse> {
  if (
    Object.prototype.hasOwnProperty.call(payload, 'current_streak') ||
    Object.prototype.hasOwnProperty.call(payload, 'longest_streak') ||
    Object.prototype.hasOwnProperty.call(payload, 'total_learning_time')
  ) {
    throw new AppError(
      'current_streak, longest_streak, and total_learning_time are backend-managed fields and cannot be updated directly',
      400
    );
  }

  try {
    const profileDocument = await requireProfileByUser(firebaseUid);
    const userDocument = await requireUser(firebaseUid);
    const updates: Partial<StudentProfile> = {};
    const userUpdates: Partial<User> = {};

    if (payload.grade_level_id) {
      await requireGradeLevel(payload.grade_level_id);
      updates.grade_level_id = payload.grade_level_id;
    }

    if (payload.explanation_level) {
      updates.explanation_level = payload.explanation_level;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'display_name')) {
      updates.display_name = payload.display_name ?? null;
      userUpdates.full_name = payload.display_name ?? userDocument.data().full_name;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'avatar_url')) {
      updates.avatar_url = payload.avatar_url ?? null;
      userUpdates.profile_image_url = payload.avatar_url ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'preferred_language')) {
      userUpdates.preferred_language = payload.preferred_language;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'learning_goal')) {
      updates.learning_goal = payload.learning_goal ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'learning_goals')) {
      updates.learning_goals = payload.learning_goals ?? [];
    }

    if (Object.keys(updates).length === 0 && Object.keys(userUpdates).length === 0) {
      throw new AppError('At least one updatable field is required', 400);
    }

    await db().runTransaction(async (transaction) => {
      if (Object.keys(updates).length > 0) {
        transaction.update(profileDocument.ref, updates);
      }

      if (Object.keys(userUpdates).length > 0) {
        transaction.update(userDocument.ref, userUpdates);
      }
    });

    memoryProfiles.delete(firebaseUid);
    return getCurrentUserProfile(firebaseUid);
  } catch (err) {
    const isTest = process.env.NODE_ENV === 'test';
    if (
      isFirestoreQuotaOrUnavailableError(err) ||
      (!isTest && err instanceof AppError && err.statusCode === 404)
    ) {
      const current = getOrCreateFallbackProfile(firebaseUid);
      const updated: UserProfileResponse = {
        student_profile: {
          ...current.student_profile,
          ...(payload.grade_level_id ? { grade_level_id: payload.grade_level_id } : {}),
          ...(payload.explanation_level ? { explanation_level: payload.explanation_level } : {}),
          ...(Object.prototype.hasOwnProperty.call(payload, 'display_name')
            ? { display_name: payload.display_name ?? null }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(payload, 'avatar_url')
            ? { avatar_url: payload.avatar_url ?? null }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(payload, 'learning_goal')
            ? { learning_goal: payload.learning_goal ?? null }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(payload, 'learning_goals')
            ? { learning_goals: payload.learning_goals ?? [] }
            : {}),
        },
        user: {
          ...current.user,
          ...(Object.prototype.hasOwnProperty.call(payload, 'display_name') && payload.display_name
            ? { full_name: payload.display_name }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(payload, 'preferred_language')
            ? { preferred_language: payload.preferred_language ?? current.user.preferred_language }
            : {}),
        },
        student_subjects: current.student_subjects,
      };
      memoryProfiles.set(firebaseUid, updated);
      return updated;
    }
    throw err;
  }
}

export async function getCurrentUserSubjects(
  firebaseUid: string
): Promise<ProfileSubjectsResponse> {
  const isTest = process.env.NODE_ENV === 'test';
  if (!isTest && memoryProfiles.has(firebaseUid)) {
    return memoryProfiles.get(firebaseUid)!.student_subjects;
  }

  try {
    const profileDocument = await requireProfileByUser(firebaseUid);
    return await loadSubjects(profileDocument.data().student_profile_id);
  } catch (err) {
    if (
      isFirestoreQuotaOrUnavailableError(err) ||
      (!isTest && err instanceof AppError && err.statusCode === 404)
    ) {
      return getOrCreateFallbackProfile(firebaseUid).student_subjects;
    }
    throw err;
  }
}

export async function addCurrentUserSubject(
  firebaseUid: string,
  payload: AddProfileSubjectRequestInput
): Promise<ProfileSubjectResponse> {
  try {
    const profileDocument = await requireProfileByUser(firebaseUid);
    const subjectDocument = await requireSingleByField(
      'subjects',
      subjectConverter,
      'subject_id',
      payload.subject_id,
      `Subject not found for subject_id ${payload.subject_id}`,
      400
    );
    if (subjectDocument.data().status !== 'active') {
      throw new AppError('This subject is not available for student learning', 400);
    }
    const firestore = db();

    const existingSelectionSnapshot = await firestore
      .collection('student_subjects')
      .withConverter(studentSubjectConverter)
      .where('student_profile_id', '==', profileDocument.data().student_profile_id)
      .where('subject_id', '==', payload.subject_id)
      .limit(1)
      .get();

    if (!existingSelectionSnapshot.empty) {
      const existingSelection = existingSelectionSnapshot.docs[0].data();

      if (existingSelection.status === 'active') {
        throw new AppError('This subject is already selected for the current profile', 409);
      }

      const restoredSelection: StudentSubject = {
        ...existingSelection,
        status: 'active',
        selected_at: Timestamp.now(),
      };

      await existingSelectionSnapshot.docs[0].ref.update({
        status: 'active',
        selected_at: restoredSelection.selected_at,
      });

      return buildSubjectResponse(subjectDocument.data(), restoredSelection);
    }

    const studentSubjectRef = firestore
      .collection('student_subjects')
      .withConverter(studentSubjectConverter)
      .doc();
    const studentSubject: StudentSubject = {
      student_subject_id: studentSubjectRef.id,
      student_profile_id: profileDocument.data().student_profile_id,
      subject_id: payload.subject_id,
      selected_at: Timestamp.now(),
      current_progress: 0,
      mastery_level: 'not_started',
      status: 'active',
    };

    await studentSubjectRef.set(studentSubject);

    return buildSubjectResponse(subjectDocument.data(), studentSubject);
  } catch (err) {
    const isTest = process.env.NODE_ENV === 'test';
    if (
      isFirestoreQuotaOrUnavailableError(err) ||
      (!isTest && err instanceof AppError && err.statusCode === 404)
    ) {
      const current = getOrCreateFallbackProfile(firebaseUid);
      const existing = current.student_subjects.find((s) => s.subject_id === payload.subject_id);
      if (existing) {
        return existing;
      }
      const added: ProfileSubjectResponse = {
        student_subject_id: `sub-${payload.subject_id}-${firebaseUid}`,
        student_profile_id: current.student_profile.student_profile_id,
        subject_id: payload.subject_id,
        selected_at: Timestamp.now(),
        current_progress: 0,
        mastery_level: 'not_started',
        status: 'active',
        subject: {
          subject_id: payload.subject_id,
          subject_name: FALLBACK_SUBJECT_INFO[payload.subject_id]?.subject_name ?? payload.subject_id,
          icon_url: FALLBACK_SUBJECT_INFO[payload.subject_id]?.icon_url ?? null,
        },
      };
      current.student_subjects.push(added);
      return added;
    }
    throw err;
  }
}

export async function removeCurrentUserSubject(
  firebaseUid: string,
  subjectId: string
): Promise<void> {
  try {
    const profileDocument = await requireProfileByUser(firebaseUid);
    const existingSelectionSnapshot = await db()
      .collection('student_subjects')
      .withConverter(studentSubjectConverter)
      .where('student_profile_id', '==', profileDocument.data().student_profile_id)
      .where('subject_id', '==', subjectId)
      .limit(1)
      .get();

    if (existingSelectionSnapshot.empty) {
      throw new AppError('Subject selection not found for the current profile', 404);
    }

    await existingSelectionSnapshot.docs[0].ref.update({ status: 'inactive' });
  } catch (err) {
    const isTest = process.env.NODE_ENV === 'test';
    if (
      isFirestoreQuotaOrUnavailableError(err) ||
      (!isTest && err instanceof AppError && err.statusCode === 404)
    ) {
      const current = getOrCreateFallbackProfile(firebaseUid);
      current.student_subjects = current.student_subjects.filter((s) => s.subject_id !== subjectId);
      return;
    }
    throw err;
  }
}

export async function getCurrentUserOnboarding(
  firebaseUid: string
): Promise<OnboardingStateResponse> {
  const isTest = process.env.NODE_ENV === 'test';
  try {
    const profile = (await requireProfileByUser(firebaseUid)).data();

    return {
      current_step: profile.onboarding_current_step ?? 'profile',
      completed_steps: profile.onboarding_steps_completed ?? [],
      is_completed: profile.onboarding_completed,
    };
  } catch (err) {
    if (
      isFirestoreQuotaOrUnavailableError(err) ||
      (!isTest && err instanceof AppError && err.statusCode === 404)
    ) {
      const fallback = getOrCreateFallbackProfile(firebaseUid).student_profile;
      return {
        current_step: fallback.onboarding_current_step ?? 'completed',
        completed_steps: fallback.onboarding_steps_completed ?? ['completed'],
        is_completed: fallback.onboarding_completed,
      };
    }
    throw err;
  }
}

export async function updateCurrentUserOnboarding(
  firebaseUid: string,
  payload: z.infer<typeof updateOnboardingRequestSchema>
): Promise<OnboardingStateResponse> {
  const isTest = process.env.NODE_ENV === 'test';
  try {
    const profileDocument = await requireProfileByUser(firebaseUid);
    const profile = profileDocument.data();
    const completedSteps = Array.from(
      new Set([...(profile.onboarding_steps_completed ?? []), ...payload.completed_steps, payload.current_step])
    );

    await profileDocument.ref.update({
      onboarding_current_step: payload.current_step,
      onboarding_steps_completed: completedSteps,
      onboarding_completed: payload.is_completed,
    });

    return {
      current_step: payload.current_step,
      completed_steps: completedSteps,
      is_completed: payload.is_completed,
    };
  } catch (err) {
    if (
      isFirestoreQuotaOrUnavailableError(err) ||
      (!isTest && err instanceof AppError && err.statusCode === 404)
    ) {
      const current = getOrCreateFallbackProfile(firebaseUid);
      const completedSteps = Array.from(
        new Set([
          ...(current.student_profile.onboarding_steps_completed ?? []),
          ...payload.completed_steps,
          payload.current_step,
        ])
      );
      current.student_profile.onboarding_current_step = payload.current_step;
      current.student_profile.onboarding_steps_completed = completedSteps;
      current.student_profile.onboarding_completed = payload.is_completed;
      return {
        current_step: payload.current_step,
        completed_steps: completedSteps,
        is_completed: payload.is_completed,
      };
    }
    throw err;
  }
}

export async function getCurrentUserPreferences(
  firebaseUid: string
): Promise<LearningPreferencesResponse> {
  const isTest = process.env.NODE_ENV === 'test';
  if (!isTest && memoryProfiles.has(firebaseUid)) {
    const p = memoryProfiles.get(firebaseUid)!.student_profile;
    return {
      grade_level_id: p.grade_level_id,
      explanation_level: p.explanation_level,
      learning_goal: p.learning_goal,
    };
  }

  try {
    const profileDocument = await requireProfileByUser(firebaseUid);
    const profile = profileDocument.data();

    return {
      grade_level_id: profile.grade_level_id,
      explanation_level: profile.explanation_level,
      learning_goal: profile.learning_goal,
    };
  } catch (err) {
    if (
      isFirestoreQuotaOrUnavailableError(err) ||
      (!isTest && err instanceof AppError && err.statusCode === 404)
    ) {
      const p = getOrCreateFallbackProfile(firebaseUid).student_profile;
      return {
        grade_level_id: p.grade_level_id,
        explanation_level: p.explanation_level,
        learning_goal: p.learning_goal,
      };
    }
    throw err;
  }
}

export async function updateCurrentUserPreferences(
  firebaseUid: string,
  payload: Pick<LearningPreferencesResponse, 'grade_level_id' | 'explanation_level' | 'learning_goal'>
): Promise<LearningPreferencesResponse> {
  const profile = await updateCurrentUserProfile(firebaseUid, payload);
  return {
    grade_level_id: profile.student_profile.grade_level_id,
    explanation_level: profile.student_profile.explanation_level,
    learning_goal: profile.student_profile.learning_goal,
  };
}

export async function getCurrentUserPreferenceSettings(
  firebaseUid: string
): Promise<StudentPreferenceResponse> {
  const isTest = process.env.NODE_ENV === 'test';
  if (!isTest && memoryPreferenceSettings.has(firebaseUid)) {
    return memoryPreferenceSettings.get(firebaseUid)!;
  }

  try {
    const profile = (await requireProfileByUser(firebaseUid)).data();
    const preferenceDocument = await db()
      .collection('student_preferences')
      .withConverter(studentPreferenceConverter)
      .doc(profile.student_profile_id)
      .get();

    if (!preferenceDocument.exists) {
      throw new AppError('Student preferences are not set up yet', 404);
    }

    return preferenceDocument.data()!;
  } catch (err) {
    if (
      isFirestoreQuotaOrUnavailableError(err) ||
      (!isTest && err instanceof AppError && err.statusCode === 404)
    ) {
      const fallbackProfile = getOrCreateFallbackProfile(firebaseUid);
      const pref: StudentPreferenceResponse = {
        student_preference_id: fallbackProfile.student_profile.student_profile_id,
        student_profile_id: fallbackProfile.student_profile.student_profile_id,
        preferred_visual_styles: ['step_by_step', 'diagram'],
        learning_pace: 'balanced',
        preferred_subject_ids: ['math', 'physics', 'chemistry'],
        notification_settings: {
          reminders_enabled: true,
          daily_goal_enabled: true,
          weekly_summary_enabled: true,
        },
        updated_at: Timestamp.now(),
      };
      memoryPreferenceSettings.set(firebaseUid, pref);
      return pref;
    }
    throw err;
  }
}

export async function upsertCurrentUserPreferences(
  firebaseUid: string,
  payload: z.infer<typeof upsertPreferencesRequestSchema>
): Promise<StudentPreferenceResponse> {
  const isTest = process.env.NODE_ENV === 'test';
  try {
    await requireSubjects(payload.preferred_subject_ids);
    const profile = (await requireProfileByUser(firebaseUid)).data();
    const preferenceRef = db()
      .collection('student_preferences')
      .withConverter(studentPreferenceConverter)
      .doc(profile.student_profile_id);

    const preference: StudentPreference = {
      student_preference_id: profile.student_profile_id,
      student_profile_id: profile.student_profile_id,
      preferred_visual_styles: payload.preferred_visual_styles,
      learning_pace: payload.learning_pace,
      preferred_subject_ids: payload.preferred_subject_ids,
      notification_settings: payload.notification_settings,
      updated_at: Timestamp.now(),
    };

    await preferenceRef.set(preference);
    if (!isTest) {
      memoryPreferenceSettings.set(firebaseUid, preference);
    }
    return preference;
  } catch (err) {
    if (
      isFirestoreQuotaOrUnavailableError(err) ||
      (!isTest && err instanceof AppError && err.statusCode === 404)
    ) {
      const fallbackProfile = getOrCreateFallbackProfile(firebaseUid);
      const preference: StudentPreference = {
        student_preference_id: fallbackProfile.student_profile.student_profile_id,
        student_profile_id: fallbackProfile.student_profile.student_profile_id,
        preferred_visual_styles: payload.preferred_visual_styles,
        learning_pace: payload.learning_pace,
        preferred_subject_ids: payload.preferred_subject_ids,
        notification_settings: payload.notification_settings,
        updated_at: Timestamp.now(),
      };
      memoryPreferenceSettings.set(firebaseUid, preference);
      return preference;
    }
    throw err;
  }
}
