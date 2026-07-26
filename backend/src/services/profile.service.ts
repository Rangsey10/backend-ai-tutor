import {
  Timestamp,
  type Firestore,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { getFirestore } from '../config/firebase';
import {
  gradeLevelConverter,
  studentProfileConverter,
  studentSubjectConverter,
  subjectConverter,
  userConverter,
} from '../config/firestore-converters';
import type { StudentProfile } from '../models/student-profiles.model';
import type { StudentSubject } from '../models/student-subjects.model';
import type { Subject } from '../models/subjects.model';
import type { User } from '../models/users.model';
import type {
  AddProfileSubjectRequestInput,
  CreateProfileRequestInput,
  UpdateProfileRequestInput,
} from '../schemas/profile-request.schema';
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
  await requireSingleByField(
    'grade_levels',
    gradeLevelConverter,
    'grade_level_id',
    gradeLevelId,
    'Grade level not found',
    400
  );
}

async function requireSubjects(subjectIds: string[]): Promise<void> {
  const missingSubjectIds: string[] = [];

  for (const subjectId of subjectIds) {
    // Subject selection requests are intentionally small, so sequential validation keeps the code direct.
    // eslint-disable-next-line no-await-in-loop
    const subject = await getSingleByField('subjects', subjectConverter, 'subject_id', subjectId);

    if (!subject) {
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

export async function getCurrentUserProfile(firebaseUid: string): Promise<UserProfileResponse> {
  const userDocument = await requireUser(firebaseUid);
  const profileDocument = await requireProfileByUser(firebaseUid);

  if (profileDocument.data().user_id !== firebaseUid) {
    throw new AppError('You cannot access another user profile', 403);
  }

  const user = userDocument.data();
  const profile = profileDocument.data();

  return {
    student_profile: profile,
    user: {
      full_name: user.full_name,
      email: user.email,
      preferred_language: user.preferred_language,
    },
    student_subjects: await loadSubjects(profile.student_profile_id),
  };
}

export async function createCurrentUserProfile(
  firebaseUid: string,
  payload: CreateProfileRequestInput
): Promise<UserProfileResponse> {
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
    account_status: 'active',
    explanation_level: payload.explanation_level,
    learning_goal: payload.learning_goal,
    onboarding_completed: true,
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

  return {
    student_profile: profile,
    user: {
      full_name: userDocument.data().full_name,
      email: userDocument.data().email,
      preferred_language: userDocument.data().preferred_language,
    },
    student_subjects: await loadSubjects(profileRef.id),
  };
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

  const profileDocument = await requireProfileByUser(firebaseUid);
  const updates: Partial<StudentProfile> = {};

  if (payload.grade_level_id) {
    await requireGradeLevel(payload.grade_level_id);
    updates.grade_level_id = payload.grade_level_id;
  }

  if (payload.explanation_level) {
    updates.explanation_level = payload.explanation_level;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'learning_goal')) {
    updates.learning_goal = payload.learning_goal ?? null;
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError('At least one updatable field is required', 400);
  }

  await profileDocument.ref.update(updates);

  return getCurrentUserProfile(firebaseUid);
}

export async function getCurrentUserSubjects(
  firebaseUid: string
): Promise<ProfileSubjectsResponse> {
  const profileDocument = await requireProfileByUser(firebaseUid);
  return loadSubjects(profileDocument.data().student_profile_id);
}

export async function addCurrentUserSubject(
  firebaseUid: string,
  payload: AddProfileSubjectRequestInput
): Promise<ProfileSubjectResponse> {
  const profileDocument = await requireProfileByUser(firebaseUid);
  const subjectDocument = await requireSingleByField(
    'subjects',
    subjectConverter,
    'subject_id',
    payload.subject_id,
    `Subject not found for subject_id ${payload.subject_id}`,
    400
  );
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
}

export async function removeCurrentUserSubject(
  firebaseUid: string,
  subjectId: string
): Promise<void> {
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
}
