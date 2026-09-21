import type { Request, Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirestore } from '../config/firebase';
import { gradeLevelConverter } from '../config/firestore-converters';
import type { GradeLevel, GradeLevelStatus } from '../models/grade-levels.model';
import { normalizeUserRole } from '../types/user-role';
import { asyncHandler } from '../utils/asyncHandler';
import { sendCreated, sendSuccess } from '../utils/ApiResponse';
import { AppError } from '../utils/AppError';

type AdminGradeLevel = {
  id: string;
  grade_level_id: string;
  name: string;
  khmer: string;
  number: string;
  description: string;
  status: 'Active' | 'Inactive';
};

type AdminSubjectStatus = 'Active' | 'Draft' | 'Inactive';

type AdminSubject = {
  id: string;
  subject_id: string;
  grade_level_id: string;
  grade: string;
  name: string;
  khmer: string;
  code: string;
  icon: string;
  description: string;
  order: string;
  status: AdminSubjectStatus;
};

type SubjectDocument = {
  subject_id: string;
  grade_level_id: string;
  grade_name: string;
  subject_name: string;
  subject_code: string;
  khmer_name?: string | null;
  icon_url?: string | null;
  description?: string | null;
  display_order: number;
  status: 'active' | 'draft' | 'inactive';
  created_at: FirebaseFirestore.Timestamp;
  updated_at: FirebaseFirestore.Timestamp;
};

type AdminTopic = {
  id: string;
  topic_id: string;
  grade_level_id: string;
  subject_id: string;
  grade: string;
  subject: string;
  name: string;
  khmer: string;
  code: string;
  description: string;
  learning_objectives: string[];
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  prerequisites: string[];
  status: 'Draft' | 'Active' | 'Inactive' | 'Archived';
  created_at: string | null;
  updated_at: string | null;
  created_by: string;
  updated_by: string;
};

type TopicDocument = {
  topic_id: string;
  unit_id?: string | null;
  grade_level_id: string;
  subject_id: string;
  grade_name?: string;
  subject_name?: string;
  topic_name: string;
  khmer_name?: string | null;
  topic_code: string;
  description?: string | null;
  learning_objective?: string | null;
  learning_objectives?: string[];
  difficulty_level?: 'beginner' | 'intermediate' | 'advanced';
  prerequisites?: string[];
  status?: 'draft' | 'active' | 'inactive' | 'archived';
  grade_level_snapshot?: { grade_level_id: string; grade_name: string; grade_number: number } | null;
  subject_snapshot?: { subject_id: string; subject_name: string; subject_code: string } | null;
  created_at?: FirebaseFirestore.Timestamp;
  updated_at?: FirebaseFirestore.Timestamp;
  created_by?: string;
  updated_by?: string;
};

type AdminContentKind = 'Formula' | 'Concept' | 'Example' | 'Exercise';
type AdminContentStatus = 'Published' | 'Draft';

type CurriculumContentDocument = {
  content_id: string;
  curriculum_version_id: string;
  kind: 'formula' | 'concept' | 'example' | 'exercise';
  grade_level_id: string;
  subject_id: string;
  topic_id: string;
  grade_name: string;
  subject_name: string;
  topic_name: string;
  title?: string | null;
  summary?: string | null;
  body?: string | null;
  expression?: string | null;
  description?: string | null;
  variables?: unknown[];
  steps?: unknown[];
  khmer_terms?: unknown[];
  prerequisites?: string[];
  tags?: string[];
  status: 'published' | 'draft';
  created_at: FirebaseFirestore.Timestamp;
  updated_at: FirebaseFirestore.Timestamp;
};

type AdminCurriculumContent = {
  id: string;
  content_id: string;
  curriculum_version_id: string;
  kind: AdminContentKind;
  grade_level_id: string;
  subject_id: string;
  topic_id: string;
  grade: string;
  subject: string;
  lesson: string;
  title: string;
  summary: string;
  body: string;
  expression: string;
  description: string;
  variables: unknown[];
  steps: unknown[];
  khmerTerms: unknown[];
  prerequisites: string[];
  tags: string[];
  status: AdminContentStatus;
};

const defaultGradeDescriptions: Record<number, string> = {
  10: 'Foundation for upper secondary study with core science and social science tracks.',
  11: 'Upper secondary curriculum covering Chemistry, advanced equations, and deeper reasoning skills.',
  12: 'High school graduation year with national exam preparation including Physics and advanced Math.',
};

function assertAdmin(req: Request): void {
  if (!req.user?.userId || normalizeUserRole(req.user.role ?? 'student') !== 'admin') {
    throw new AppError('Admin access is required', 403);
  }
}

function normalizeStatus(value: unknown, fallback: GradeLevelStatus = 'active'): GradeLevelStatus {
  if (typeof value !== 'string') return fallback;
  return value.toLowerCase() === 'inactive' ? 'inactive' : 'active';
}

function normalizeSubjectStatus(value: unknown, fallback: SubjectDocument['status'] = 'active'): SubjectDocument['status'] {
  if (typeof value !== 'string') return fallback;
  const normalized = value.toLowerCase();
  if (normalized === 'inactive') return 'inactive';
  if (normalized === 'draft') return 'draft';
  return 'active';
}

function normalizeTopicStatus(value: unknown, fallback: NonNullable<TopicDocument['status']> = 'draft'): NonNullable<TopicDocument['status']> {
  if (typeof value !== 'string') return fallback;
  const normalized = value.toLowerCase();
  if (normalized === 'active' || normalized === 'inactive' || normalized === 'archived' || normalized === 'draft') {
    return normalized;
  }
  throw new AppError('Topic status must be draft, active, inactive, or archived', 400);
}

function normalizeTopicDifficulty(value: unknown, fallback: NonNullable<TopicDocument['difficulty_level']> = 'beginner'): NonNullable<TopicDocument['difficulty_level']> {
  if (typeof value !== 'string') return fallback;
  const normalized = value.toLowerCase();
  if (normalized === 'beginner' || normalized === 'intermediate' || normalized === 'advanced') return normalized;
  throw new AppError('Topic difficulty must be beginner, intermediate, or advanced', 400);
}

function normalizeContentKind(value: unknown): CurriculumContentDocument['kind'] {
  if (typeof value !== 'string') throw new AppError('Content type is required', 400);
  const normalized = value.toLowerCase();
  if (normalized === 'formula') return 'formula';
  if (normalized === 'concept') return 'concept';
  if (normalized === 'example') return 'example';
  if (normalized === 'exercise') return 'exercise';
  throw new AppError('Content type must be Formula, Concept, Example, or Exercise', 400);
}

function normalizeContentStatus(value: unknown, fallback: CurriculumContentDocument['status'] = 'draft'): CurriculumContentDocument['status'] {
  if (typeof value !== 'string') return fallback;
  if (value.toLowerCase() === 'published') {
    throw new AppError('Content is published only through an approved curriculum version', 400);
  }
  return 'draft';
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
}

function readUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readRequiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError(`${label} is required`, 400);
  }
  return value.trim();
}

function readOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  return value.trim() || null;
}

function readGradeNumber(value: unknown): number {
  const numberValue = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isInteger(numberValue) || numberValue < 1 || numberValue > 99) {
    throw new AppError('Grade number must be a whole number between 1 and 99', 400);
  }
  return numberValue;
}

function makeGradeId(gradeNumber: number, gradeName: string): string {
  const slug = gradeName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `grade-${gradeNumber}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function makeSubjectId(gradeLevelId: string, subjectCode: string, subjectName: string): string {
  return `${gradeLevelId}-${slugify(subjectCode || subjectName)}`;
}

function makeTopicId(subjectId: string, topicCode: string, topicName: string): string {
  return `${subjectId}-${slugify(topicCode || topicName)}`;
}

function makeTopicCodeReservationId(subjectId: string, topicCode: string): string {
  return `${encodeURIComponent(subjectId)}--${slugify(topicCode)}`;
}

function timestampToIso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return ((value as { toDate: () => Date }).toDate()).toISOString();
  }
  return null;
}

function toAdminGradeLevel(grade: GradeLevel): AdminGradeLevel {
  return {
    id: grade.grade_level_id,
    grade_level_id: grade.grade_level_id,
    name: grade.grade_name,
    khmer: `Cambodian ${grade.grade_name}`,
    number: String(grade.grade_number),
    description: grade.description ?? defaultGradeDescriptions[grade.grade_number] ?? '',
    status: grade.status === 'inactive' ? 'Inactive' : 'Active',
  };
}

function toAdminSubject(subject: SubjectDocument): AdminSubject {
  return {
    id: subject.subject_id,
    subject_id: subject.subject_id,
    grade_level_id: subject.grade_level_id,
    grade: subject.grade_name,
    name: subject.subject_name,
    khmer: subject.khmer_name || subject.subject_name,
    code: subject.subject_code,
    icon: subject.icon_url || subject.subject_code.slice(0, 2).toLowerCase(),
    description: subject.description ?? '',
    order: String(subject.display_order),
    status:
      subject.status === 'inactive'
        ? 'Inactive'
        : subject.status === 'draft'
          ? 'Draft'
          : 'Active',
  };
}

function toAdminTopic(topic: TopicDocument): AdminTopic {
  const gradeSnapshot = topic.grade_level_snapshot as { grade_name?: string } | null | undefined;
  const subjectSnapshot = topic.subject_snapshot as { subject_name?: string } | null | undefined;
  return {
    id: String(topic.topic_id ?? ''),
    topic_id: String(topic.topic_id ?? ''),
    grade_level_id: String(topic.grade_level_id ?? ''),
    subject_id: String(topic.subject_id ?? ''),
    grade: String(gradeSnapshot?.grade_name ?? topic.grade_name ?? topic.grade_level_id ?? ''),
    subject: String(subjectSnapshot?.subject_name ?? topic.subject_name ?? topic.subject_id ?? ''),
    name: String(topic.topic_name ?? ''),
    khmer: String(topic.khmer_name ?? topic.topic_name ?? ''),
    code: String(topic.topic_code ?? ''),
    description: String(topic.description ?? ''),
    learning_objectives: topic.learning_objectives ?? (topic.learning_objective ? [topic.learning_objective] : []),
    difficulty:
      topic.difficulty_level === 'advanced'
        ? 'Advanced'
        : topic.difficulty_level === 'intermediate'
          ? 'Intermediate'
          : 'Beginner',
    prerequisites: topic.prerequisites ?? [],
    status:
      topic.status === 'archived'
        ? 'Archived'
        : topic.status === 'inactive'
          ? 'Inactive'
          : topic.status === 'active'
            ? 'Active'
            : 'Draft',
    created_at: timestampToIso(topic.created_at),
    updated_at: timestampToIso(topic.updated_at),
    created_by: String(topic.created_by ?? ''),
    updated_by: String(topic.updated_by ?? ''),
  };
}

function toAdminContent(content: CurriculumContentDocument): AdminCurriculumContent {
  return {
    id: content.content_id,
    content_id: content.content_id,
    curriculum_version_id: content.curriculum_version_id ?? '',
    kind:
      content.kind === 'formula'
        ? 'Formula'
        : content.kind === 'concept'
          ? 'Concept'
          : content.kind === 'example'
            ? 'Example'
            : 'Exercise',
    grade_level_id: content.grade_level_id,
    subject_id: content.subject_id,
    topic_id: content.topic_id,
    grade: content.grade_name,
    subject: content.subject_name,
    lesson: content.topic_name,
    title: content.title ?? '',
    summary: content.summary ?? '',
    body: content.body ?? '',
    expression: content.expression ?? '',
    description: content.description ?? '',
    variables: content.variables ?? [],
    steps: content.steps ?? [],
    khmerTerms: content.khmer_terms ?? [],
    prerequisites: content.prerequisites ?? [],
    tags: content.tags ?? [],
    status: content.status === 'published' ? 'Published' : 'Draft',
  };
}

async function requireEditableCurriculumVersion(curriculumVersionId: string, gradeLevelId: string, subjectId: string): Promise<void> {
  const versionDoc = await getFirestore().collection('curriculum_versions').doc(curriculumVersionId).get();
  if (!versionDoc.exists) throw new AppError('Curriculum version not found', 404);
  const version = versionDoc.data() as { grade_level_id?: string; subject_id?: string; status?: string };
  if (version.grade_level_id !== gradeLevelId || version.subject_id !== subjectId) {
    throw new AppError('Curriculum version does not match this grade and subject', 400);
  }
  if (version.status !== 'draft') {
    throw new AppError('Published or in-review curriculum versions are immutable; create a new draft version', 409);
  }
}

async function writeCurriculumAudit(req: Request, action: string, contentId: string, curriculumVersionId: string): Promise<void> {
  const now = Timestamp.now();
  await getFirestore().collection('admin_audit_logs').doc(`${contentId}-${action}-${now.toMillis()}`).set({
    audit_id: `${contentId}-${action}-${now.toMillis()}`,
    actor_id: req.user!.userId,
    action,
    resource_type: 'curriculum_content',
    resource_id: contentId,
    curriculum_version_id: curriculumVersionId,
    created_at: now,
  });
}

async function ensureUniqueGradeNumber(
  gradeNumber: number,
  existingGradeLevelId?: string,
): Promise<void> {
  const duplicate = await getFirestore()
    .collection('grade_levels')
    .withConverter(gradeLevelConverter)
    .where('grade_number', '==', gradeNumber)
    .limit(1)
    .get();

  const duplicatedDoc = duplicate.docs.find((doc) => doc.data().grade_level_id !== existingGradeLevelId);
  if (duplicatedDoc) {
    throw new AppError(`Grade ${gradeNumber} already exists`, 409);
  }
}

async function requireGradeById(gradeLevelId: string): Promise<GradeLevel> {
  const gradeDoc = await getFirestore()
    .collection('grade_levels')
    .withConverter(gradeLevelConverter)
    .doc(gradeLevelId)
    .get();

  if (!gradeDoc.exists) {
    throw new AppError('Grade level not found', 404);
  }

  return gradeDoc.data()!;
}

async function ensureUniqueSubjectCode(
  gradeLevelId: string,
  subjectCode: string,
  existingSubjectId?: string,
): Promise<void> {
  const duplicate = await getFirestore()
    .collection('subjects')
    .where('grade_level_id', '==', gradeLevelId)
    .get();

  const duplicatedDoc = duplicate.docs.find((doc) => {
    const subject = doc.data() as SubjectDocument;
    return doc.id !== existingSubjectId && subject.subject_code === subjectCode;
  });
  if (duplicatedDoc) {
    throw new AppError(`Subject code ${subjectCode} already exists for this grade`, 409);
  }
}

async function requireSubjectForGrade(subjectId: string, gradeLevelId: string): Promise<SubjectDocument> {
  const subjectDoc = await getFirestore().collection('subjects').doc(subjectId).get();
  if (!subjectDoc.exists) {
    throw new AppError('Subject not found', 404);
  }

  const subject = { ...(subjectDoc.data() as SubjectDocument), subject_id: subjectDoc.id };
  if (subject.grade_level_id !== gradeLevelId) {
    throw new AppError('Subject does not belong to the selected grade level', 400);
  }
  return subject;
}

export const getAdminGrades = asyncHandler(async (req: Request, res: Response) => {
  assertAdmin(req);

  const snapshot = await getFirestore()
    .collection('grade_levels')
    .withConverter(gradeLevelConverter)
    .get();

  const grades = snapshot.docs
    .map((doc) => toAdminGradeLevel(doc.data()))
    .sort((left, right) => Number(right.number) - Number(left.number));

  sendSuccess(res, { grades }, 'Grade levels loaded');
});

export const createAdminGrade = asyncHandler(async (req: Request, res: Response) => {
  assertAdmin(req);

  const gradeName = readRequiredString(req.body?.name ?? req.body?.grade_name, 'Grade name');
  const gradeNumber = readGradeNumber(req.body?.number ?? req.body?.grade_number);
  const description = readOptionalString(req.body?.description);
  const status = normalizeStatus(req.body?.status);
  const gradeLevelId = makeGradeId(gradeNumber, gradeName);

  await ensureUniqueGradeNumber(gradeNumber);

  const existingDoc = await getFirestore()
    .collection('grade_levels')
    .withConverter(gradeLevelConverter)
    .doc(gradeLevelId)
    .get();
  if (existingDoc.exists) {
    throw new AppError('A grade level with this name already exists', 409);
  }

  const now = Timestamp.now();
  const grade: GradeLevel = {
    grade_level_id: gradeLevelId,
    grade_name: gradeName,
    grade_number: gradeNumber,
    description,
    status,
    created_at: now,
    updated_at: now,
  };

  await getFirestore()
    .collection('grade_levels')
    .withConverter(gradeLevelConverter)
    .doc(gradeLevelId)
    .set(grade);

  sendCreated(res, toAdminGradeLevel(grade), 'Grade level created');
});

export const updateAdminGrade = asyncHandler(async (req: Request, res: Response) => {
  assertAdmin(req);

  const gradeLevelId = readRequiredString(req.params.gradeLevelId, 'Grade level id');
  const gradeRef = getFirestore()
    .collection('grade_levels')
    .withConverter(gradeLevelConverter)
    .doc(gradeLevelId);
  const gradeDoc = await gradeRef.get();
  if (!gradeDoc.exists) {
    throw new AppError('Grade level not found', 404);
  }

  const currentGrade = gradeDoc.data()!;
  const gradeName =
    req.body?.name !== undefined || req.body?.grade_name !== undefined
      ? readRequiredString(req.body?.name ?? req.body?.grade_name, 'Grade name')
      : currentGrade.grade_name;
  const gradeNumber =
    req.body?.number !== undefined || req.body?.grade_number !== undefined
      ? readGradeNumber(req.body?.number ?? req.body?.grade_number)
      : currentGrade.grade_number;
  const description =
    req.body?.description !== undefined
      ? readOptionalString(req.body.description)
      : currentGrade.description;
  const status = normalizeStatus(req.body?.status, currentGrade.status);

  await ensureUniqueGradeNumber(gradeNumber, gradeLevelId);

  const updatedGrade: GradeLevel = {
    ...currentGrade,
    grade_name: gradeName,
    grade_number: gradeNumber,
    description,
    status,
    updated_at: Timestamp.now(),
  };

  await gradeRef.set(updatedGrade, { merge: true });
  sendSuccess(res, toAdminGradeLevel(updatedGrade), 'Grade level updated');
});

export const getAdminSubjects = asyncHandler(async (req: Request, res: Response) => {
  assertAdmin(req);

  const gradeLevelId = typeof req.query.grade_level_id === 'string' ? req.query.grade_level_id.trim() : '';
  let query: FirebaseFirestore.Query = getFirestore().collection('subjects');

  if (gradeLevelId) {
    query = query.where('grade_level_id', '==', gradeLevelId);
  }

  const snapshot = await query.get();
  const subjects = snapshot.docs
    .map((doc) => toAdminSubject({ ...(doc.data() as SubjectDocument), subject_id: doc.id }))
    .sort((left, right) => Number(left.order) - Number(right.order) || left.name.localeCompare(right.name));

  sendSuccess(res, { subjects }, 'Subjects loaded');
});

export const createAdminSubject = asyncHandler(async (req: Request, res: Response) => {
  assertAdmin(req);

  const gradeLevelId = readRequiredString(req.body?.grade_level_id, 'Grade level id');
  const grade = await requireGradeById(gradeLevelId);
  const subjectName = readRequiredString(req.body?.name ?? req.body?.subject_name, 'Subject name');
  const subjectCode = readRequiredString(req.body?.code ?? req.body?.subject_code, 'Subject code').toUpperCase();
  const description = readOptionalString(req.body?.description);
  const displayOrder = Number(String(req.body?.order ?? req.body?.display_order ?? '1').trim());
  const status = normalizeSubjectStatus(req.body?.status);
  const subjectId = makeSubjectId(gradeLevelId, subjectCode, subjectName);

  if (!Number.isInteger(displayOrder) || displayOrder < 1) {
    throw new AppError('Display order must be a positive whole number', 400);
  }

  await ensureUniqueSubjectCode(gradeLevelId, subjectCode);

  const subjectRef = getFirestore().collection('subjects').doc(subjectId);
  if ((await subjectRef.get()).exists) {
    throw new AppError('A subject with this name or code already exists for this grade', 409);
  }

  const now = Timestamp.now();
  const subject: SubjectDocument = {
    subject_id: subjectId,
    grade_level_id: gradeLevelId,
    grade_name: grade.grade_name,
    subject_name: subjectName,
    subject_code: subjectCode,
    khmer_name: readOptionalString(req.body?.khmer),
    icon_url: readOptionalString(req.body?.icon),
    description,
    display_order: displayOrder,
    status,
    created_at: now,
    updated_at: now,
  };

  await subjectRef.set(subject);
  sendCreated(res, toAdminSubject(subject), 'Subject created');
});

export const updateAdminSubject = asyncHandler(async (req: Request, res: Response) => {
  assertAdmin(req);

  const subjectId = readRequiredString(req.params.subjectId, 'Subject id');
  const subjectRef = getFirestore().collection('subjects').doc(subjectId);
  const subjectDoc = await subjectRef.get();

  if (!subjectDoc.exists) {
    throw new AppError('Subject not found', 404);
  }

  const currentSubject = { ...(subjectDoc.data() as SubjectDocument), subject_id: subjectDoc.id };
  const gradeLevelId =
    req.body?.grade_level_id !== undefined
      ? readRequiredString(req.body.grade_level_id, 'Grade level id')
      : currentSubject.grade_level_id;
  const grade = gradeLevelId === currentSubject.grade_level_id
    ? null
    : await requireGradeById(gradeLevelId);
  const subjectName =
    req.body?.name !== undefined || req.body?.subject_name !== undefined
      ? readRequiredString(req.body?.name ?? req.body?.subject_name, 'Subject name')
      : currentSubject.subject_name;
  const subjectCode =
    req.body?.code !== undefined || req.body?.subject_code !== undefined
      ? readRequiredString(req.body?.code ?? req.body?.subject_code, 'Subject code').toUpperCase()
      : currentSubject.subject_code;
  const displayOrder =
    req.body?.order !== undefined || req.body?.display_order !== undefined
      ? Number(String(req.body?.order ?? req.body?.display_order).trim())
      : currentSubject.display_order;

  if (!Number.isInteger(displayOrder) || displayOrder < 1) {
    throw new AppError('Display order must be a positive whole number', 400);
  }

  await ensureUniqueSubjectCode(gradeLevelId, subjectCode, subjectId);

  const updatedSubject: SubjectDocument = {
    ...currentSubject,
    grade_level_id: gradeLevelId,
    grade_name: grade?.grade_name ?? currentSubject.grade_name,
    subject_name: subjectName,
    subject_code: subjectCode,
    khmer_name: req.body?.khmer !== undefined ? readOptionalString(req.body.khmer) : currentSubject.khmer_name,
    icon_url: req.body?.icon !== undefined ? readOptionalString(req.body.icon) : currentSubject.icon_url,
    description:
      req.body?.description !== undefined ? readOptionalString(req.body.description) : currentSubject.description,
    display_order: displayOrder,
    status: normalizeSubjectStatus(req.body?.status, currentSubject.status),
    updated_at: Timestamp.now(),
  };

  await subjectRef.set(updatedSubject, { merge: true });
  sendSuccess(res, toAdminSubject(updatedSubject), 'Subject updated');
});

export const getAdminTopics = asyncHandler(async (req: Request, res: Response) => {
  assertAdmin(req);

  let query: FirebaseFirestore.Query = getFirestore().collection('topics');
  const gradeLevelId = typeof req.query.grade_level_id === 'string' ? req.query.grade_level_id.trim() : '';
  const subjectId = typeof req.query.subject_id === 'string' ? req.query.subject_id.trim() : '';

  if (gradeLevelId) query = query.where('grade_level_id', '==', gradeLevelId);
  if (subjectId) query = query.where('subject_id', '==', subjectId);

  const snapshot = await query.get();
  const topics = snapshot.docs
    .map((doc) => toAdminTopic({ ...(doc.data() as TopicDocument), topic_id: doc.id }))
    .filter((topic) => topic.topic_id && topic.name)
    .sort((left, right) => left.name.localeCompare(right.name));

  sendSuccess(res, { topics }, 'Topics loaded');
});

export const createAdminTopic = asyncHandler(async (req: Request, res: Response) => {
  assertAdmin(req);

  const gradeLevelId = readRequiredString(req.body?.grade_level_id, 'Grade level id');
  const subjectId = readRequiredString(req.body?.subject_id, 'Subject id');
  const [grade, subject] = await Promise.all([
    requireGradeById(gradeLevelId),
    requireSubjectForGrade(subjectId, gradeLevelId),
  ]);
  const topicName = readRequiredString(req.body?.name ?? req.body?.topic_name, 'Topic name');
  const topicCode = readRequiredString(req.body?.code ?? req.body?.topic_code, 'Topic code').toUpperCase();
  const topicId = makeTopicId(subjectId, topicCode, topicName);

  const topicRef = getFirestore().collection('topics').doc(topicId);

  const now = Timestamp.now();
  const learningObjectives = readStringArray(req.body?.learning_objectives ?? req.body?.learningObjectives);
  const topic: TopicDocument = {
    topic_id: topicId,
    unit_id: readOptionalString(req.body?.unit_id),
    grade_level_id: gradeLevelId,
    subject_id: subjectId,
    grade_name: grade.grade_name,
    subject_name: subject.subject_name,
    topic_name: topicName,
    khmer_name: readOptionalString(req.body?.khmer ?? req.body?.khmer_name),
    topic_code: topicCode,
    description: readOptionalString(req.body?.description),
    learning_objective: learningObjectives[0] ?? readOptionalString(req.body?.learning_objective),
    learning_objectives: learningObjectives,
    difficulty_level: normalizeTopicDifficulty(req.body?.difficulty ?? req.body?.difficulty_level),
    prerequisites: readStringArray(req.body?.prerequisites),
    status: normalizeTopicStatus(req.body?.status),
    grade_level_snapshot: {
      grade_level_id: grade.grade_level_id,
      grade_name: grade.grade_name,
      grade_number: grade.grade_number,
    },
    subject_snapshot: {
      subject_id: subject.subject_id,
      subject_name: subject.subject_name,
      subject_code: subject.subject_code,
    },
    created_at: now,
    updated_at: now,
    created_by: req.user!.userId,
    updated_by: req.user!.userId,
  };

  const firestore = getFirestore();
  await firestore.runTransaction(async (transaction) => {
    const reservationRef = firestore.collection('topic_code_reservations')
      .doc(makeTopicCodeReservationId(subjectId, topicCode));
    const [reservationDoc, duplicateSnapshot, existingTopicDoc] = await Promise.all([
      transaction.get(reservationRef),
      transaction.get(firestore.collection('topics').where('subject_id', '==', subjectId)),
      transaction.get(topicRef),
    ]);
    if (reservationDoc.exists || duplicateSnapshot.docs.some((doc) => String((doc.data() as TopicDocument).topic_code ?? '').toUpperCase() === topicCode)) {
      throw new AppError(`Topic code ${topicCode} already exists for this subject`, 409);
    }
    if (existingTopicDoc.exists) {
      throw new AppError('A topic with this name or code already exists for this subject', 409);
    }
    transaction.set(reservationRef, {
      subject_id: subjectId,
      topic_code: topicCode,
      topic_id: topicId,
      created_at: now,
      updated_at: now,
    });
    transaction.set(topicRef, topic);
  });
  sendCreated(res, toAdminTopic(topic), 'Topic created');
});

export const updateAdminTopic = asyncHandler(async (req: Request, res: Response) => {
  assertAdmin(req);

  const topicId = readRequiredString(req.params.topicId, 'Topic id');
  const topicRef = getFirestore().collection('topics').doc(topicId);
  const topicDoc = await topicRef.get();
  if (!topicDoc.exists) {
    throw new AppError('Topic not found', 404);
  }

  const currentTopic = { ...(topicDoc.data() as TopicDocument), topic_id: topicDoc.id };
  const gradeLevelId = req.body?.grade_level_id !== undefined
    ? readRequiredString(req.body.grade_level_id, 'Grade level id')
    : currentTopic.grade_level_id;
  const subjectId = req.body?.subject_id !== undefined
    ? readRequiredString(req.body.subject_id, 'Subject id')
    : currentTopic.subject_id;
  const [grade, subject] = await Promise.all([
    requireGradeById(gradeLevelId),
    requireSubjectForGrade(subjectId, gradeLevelId),
  ]);
  const topicName = req.body?.name !== undefined || req.body?.topic_name !== undefined
    ? readRequiredString(req.body?.name ?? req.body?.topic_name, 'Topic name')
    : currentTopic.topic_name;
  const topicCode = req.body?.code !== undefined || req.body?.topic_code !== undefined
    ? readRequiredString(req.body?.code ?? req.body?.topic_code, 'Topic code').toUpperCase()
    : currentTopic.topic_code;

  const learningObjectives = req.body?.learning_objectives !== undefined || req.body?.learningObjectives !== undefined
    ? readStringArray(req.body?.learning_objectives ?? req.body?.learningObjectives)
    : currentTopic.learning_objectives ?? (currentTopic.learning_objective ? [currentTopic.learning_objective] : []);
  const updatedTopic: TopicDocument = {
    ...currentTopic,
    grade_level_id: gradeLevelId,
    subject_id: subjectId,
    grade_name: grade.grade_name,
    subject_name: subject.subject_name,
    topic_name: topicName,
    topic_code: topicCode,
    khmer_name: req.body?.khmer !== undefined || req.body?.khmer_name !== undefined
      ? readOptionalString(req.body?.khmer ?? req.body?.khmer_name)
      : currentTopic.khmer_name ?? null,
    description: req.body?.description !== undefined ? readOptionalString(req.body.description) : currentTopic.description ?? null,
    learning_objective: learningObjectives[0] ?? null,
    learning_objectives: learningObjectives,
    difficulty_level: req.body?.difficulty !== undefined || req.body?.difficulty_level !== undefined
      ? normalizeTopicDifficulty(req.body?.difficulty ?? req.body?.difficulty_level)
      : currentTopic.difficulty_level ?? 'beginner',
    prerequisites: req.body?.prerequisites !== undefined ? readStringArray(req.body.prerequisites) : currentTopic.prerequisites ?? [],
    status: normalizeTopicStatus(req.body?.status, currentTopic.status ?? 'draft'),
    grade_level_snapshot: {
      grade_level_id: grade.grade_level_id,
      grade_name: grade.grade_name,
      grade_number: grade.grade_number,
    },
    subject_snapshot: {
      subject_id: subject.subject_id,
      subject_name: subject.subject_name,
      subject_code: subject.subject_code,
    },
    updated_at: Timestamp.now(),
    updated_by: req.user!.userId,
  };

  const firestore = getFirestore();
  await firestore.runTransaction(async (transaction) => {
    const reservationRef = firestore.collection('topic_code_reservations')
      .doc(makeTopicCodeReservationId(subjectId, topicCode));
    const oldReservationRef = firestore.collection('topic_code_reservations')
      .doc(makeTopicCodeReservationId(currentTopic.subject_id, currentTopic.topic_code));
    const [reservationDoc, duplicateSnapshot, oldReservationDoc] = await Promise.all([
      transaction.get(reservationRef),
      transaction.get(firestore.collection('topics').where('subject_id', '==', subjectId)),
      transaction.get(oldReservationRef),
    ]);
    const duplicate = duplicateSnapshot.docs.some((doc) => doc.id !== topicId && String((doc.data() as TopicDocument).topic_code ?? '').toUpperCase() === topicCode);
    if (duplicate || (reservationDoc.exists && (reservationDoc.data() as { topic_id?: string }).topic_id !== topicId)) {
      throw new AppError(`Topic code ${topicCode} already exists for this subject`, 409);
    }
    if (oldReservationRef.path !== reservationRef.path && oldReservationDoc.exists && (oldReservationDoc.data() as { topic_id?: string }).topic_id === topicId) {
      transaction.delete(oldReservationRef);
    }
    transaction.set(reservationRef, {
      subject_id: subjectId,
      topic_code: topicCode,
      topic_id: topicId,
      created_at: (reservationDoc.data() as { created_at?: FirebaseFirestore.Timestamp } | undefined)?.created_at ?? Timestamp.now(),
      updated_at: Timestamp.now(),
    }, { merge: true });
    transaction.set(topicRef, updatedTopic, { merge: true });
  });
  sendSuccess(res, toAdminTopic(updatedTopic), 'Topic updated');
});

export const updateAdminTopicStatus = asyncHandler(async (req: Request, res: Response) => {
  assertAdmin(req);

  const topicId = readRequiredString(req.params.topicId, 'Topic id');
  const requestedStatus = normalizeTopicStatus(req.body?.status);
  if (requestedStatus !== 'inactive' && requestedStatus !== 'archived') {
    throw new AppError('This endpoint only supports inactive or archived status', 400);
  }

  const topicRef = getFirestore().collection('topics').doc(topicId);
  const topicDoc = await topicRef.get();
  if (!topicDoc.exists) {
    throw new AppError('Topic not found', 404);
  }
  const topic = { ...(topicDoc.data() as TopicDocument), topic_id: topicDoc.id };
  const updatedTopic: TopicDocument = {
    ...topic,
    status: requestedStatus,
    updated_at: Timestamp.now(),
    updated_by: req.user!.userId,
  };
  await topicRef.set(updatedTopic, { merge: true });
  sendSuccess(res, toAdminTopic(updatedTopic), requestedStatus === 'archived' ? 'Topic archived' : 'Topic deactivated');
});

export const getAdminContent = asyncHandler(async (req: Request, res: Response) => {
  assertAdmin(req);

  let query: FirebaseFirestore.Query = getFirestore().collection('admin_curriculum_content');
  const gradeLevelId = typeof req.query.grade_level_id === 'string' ? req.query.grade_level_id.trim() : '';
  const subjectId = typeof req.query.subject_id === 'string' ? req.query.subject_id.trim() : '';
  const topicId = typeof req.query.topic_id === 'string' ? req.query.topic_id.trim() : '';

  if (gradeLevelId) query = query.where('grade_level_id', '==', gradeLevelId);
  if (subjectId) query = query.where('subject_id', '==', subjectId);
  if (topicId) query = query.where('topic_id', '==', topicId);

  const snapshot = await query.get();
  const content = snapshot.docs
    .map((doc) => toAdminContent({ ...(doc.data() as CurriculumContentDocument), content_id: doc.id }))
    .sort((left, right) => left.kind.localeCompare(right.kind) || left.title.localeCompare(right.title));

  sendSuccess(res, { content }, 'Curriculum content loaded');
});

export const createAdminContent = asyncHandler(async (req: Request, res: Response) => {
  assertAdmin(req);

  const kind = normalizeContentKind(req.body?.kind);
  const gradeLevelId = readRequiredString(req.body?.grade_level_id, 'Grade level id');
  const subjectId = readRequiredString(req.body?.subject_id, 'Subject id');
  const topicId = readRequiredString(req.body?.topic_id, 'Topic id');
  const curriculumVersionId = readRequiredString(req.body?.curriculum_version_id, 'Curriculum version id');
  const gradeName = readRequiredString(req.body?.grade, 'Grade name');
  const subjectName = readRequiredString(req.body?.subject, 'Subject name');
  const topicName = readRequiredString(req.body?.lesson, 'Lesson name');
  const contentId = `${kind}-${topicId}-${slugify(String(req.body?.expression ?? req.body?.title ?? 'content'))}-${Date.now()}`;
  const now = Timestamp.now();
  await requireEditableCurriculumVersion(curriculumVersionId, gradeLevelId, subjectId);

  const content: CurriculumContentDocument = {
    content_id: contentId,
    curriculum_version_id: curriculumVersionId,
    kind,
    grade_level_id: gradeLevelId,
    subject_id: subjectId,
    topic_id: topicId,
    grade_name: gradeName,
    subject_name: subjectName,
    topic_name: topicName,
    title: readOptionalString(req.body?.title),
    summary: readOptionalString(req.body?.summary),
    body: readOptionalString(req.body?.body),
    expression: readOptionalString(req.body?.expression),
    description: readOptionalString(req.body?.description),
    variables: readUnknownArray(req.body?.variables),
    steps: readUnknownArray(req.body?.steps),
    khmer_terms: readUnknownArray(req.body?.khmerTerms),
    prerequisites: readStringArray(req.body?.prerequisites),
    tags: readStringArray(req.body?.tags),
    status: normalizeContentStatus(req.body?.status),
    created_at: now,
    updated_at: now,
  };

  await getFirestore().collection('admin_curriculum_content').doc(contentId).set(content);
  await writeCurriculumAudit(req, 'curriculum_content.created', contentId, curriculumVersionId);
  sendCreated(res, toAdminContent(content), 'Curriculum content created');
});

export const updateAdminContent = asyncHandler(async (req: Request, res: Response) => {
  assertAdmin(req);

  const contentId = readRequiredString(req.params.contentId, 'Content id');
  const contentRef = getFirestore().collection('admin_curriculum_content').doc(contentId);
  const contentDoc = await contentRef.get();
  if (!contentDoc.exists) {
    throw new AppError('Curriculum content not found', 404);
  }

  const currentContent = { ...(contentDoc.data() as CurriculumContentDocument), content_id: contentDoc.id };
  const nextGradeLevelId = req.body?.grade_level_id !== undefined ? readRequiredString(req.body.grade_level_id, 'Grade level id') : currentContent.grade_level_id;
  const nextSubjectId = req.body?.subject_id !== undefined ? readRequiredString(req.body.subject_id, 'Subject id') : currentContent.subject_id;
  const curriculumVersionId = req.body?.curriculum_version_id !== undefined
    ? readRequiredString(req.body.curriculum_version_id, 'Curriculum version id')
    : currentContent.curriculum_version_id;
  await requireEditableCurriculumVersion(curriculumVersionId, nextGradeLevelId, nextSubjectId);
  const updatedContent: CurriculumContentDocument = {
    ...currentContent,
    curriculum_version_id: curriculumVersionId,
    kind: req.body?.kind !== undefined ? normalizeContentKind(req.body.kind) : currentContent.kind,
    grade_level_id: nextGradeLevelId,
    subject_id: nextSubjectId,
    topic_id: req.body?.topic_id !== undefined ? readRequiredString(req.body.topic_id, 'Topic id') : currentContent.topic_id,
    grade_name: req.body?.grade !== undefined ? readRequiredString(req.body.grade, 'Grade name') : currentContent.grade_name,
    subject_name: req.body?.subject !== undefined ? readRequiredString(req.body.subject, 'Subject name') : currentContent.subject_name,
    topic_name: req.body?.lesson !== undefined ? readRequiredString(req.body.lesson, 'Lesson name') : currentContent.topic_name,
    title: req.body?.title !== undefined ? readOptionalString(req.body.title) : currentContent.title,
    summary: req.body?.summary !== undefined ? readOptionalString(req.body.summary) : currentContent.summary,
    body: req.body?.body !== undefined ? readOptionalString(req.body.body) : currentContent.body,
    expression: req.body?.expression !== undefined ? readOptionalString(req.body.expression) : currentContent.expression,
    description: req.body?.description !== undefined ? readOptionalString(req.body.description) : currentContent.description,
    variables: req.body?.variables !== undefined ? readUnknownArray(req.body.variables) : currentContent.variables,
    steps: req.body?.steps !== undefined ? readUnknownArray(req.body.steps) : currentContent.steps,
    khmer_terms: req.body?.khmerTerms !== undefined ? readUnknownArray(req.body.khmerTerms) : currentContent.khmer_terms,
    prerequisites: req.body?.prerequisites !== undefined ? readStringArray(req.body.prerequisites) : currentContent.prerequisites,
    tags: req.body?.tags !== undefined ? readStringArray(req.body.tags) : currentContent.tags,
    status: normalizeContentStatus(req.body?.status, currentContent.status),
    updated_at: Timestamp.now(),
  };

  await contentRef.set(updatedContent, { merge: true });
  await writeCurriculumAudit(req, 'curriculum_content.updated', contentId, curriculumVersionId);
  sendSuccess(res, toAdminContent(updatedContent), 'Curriculum content updated');
});

export const deleteAdminContent = asyncHandler(async (req: Request, res: Response) => {
  assertAdmin(req);

  const contentId = readRequiredString(req.params.contentId, 'Content id');
  const contentRef = getFirestore().collection('admin_curriculum_content').doc(contentId);
  const contentDoc = await contentRef.get();
  if (!contentDoc.exists) throw new AppError('Curriculum content not found', 404);
  const content = contentDoc.data() as CurriculumContentDocument;
  await requireEditableCurriculumVersion(content.curriculum_version_id, content.grade_level_id, content.subject_id);
  await contentRef.delete();
  await writeCurriculumAudit(req, 'curriculum_content.deleted', contentId, content.curriculum_version_id);
  sendSuccess(res, { content_id: contentId }, 'Curriculum content deleted');
});

function normalizeKhmerTermsForImport(raw: unknown): Record<string, string> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return Object.fromEntries(
      Object.entries(raw as Record<string, unknown>)
        .filter(([k, v]) => typeof k === 'string' && typeof v === 'string' && k.trim() && (v as string).trim())
        .map(([k, v]) => [k.trim(), (v as string).trim()])
    );
  }
  if (Array.isArray(raw)) {
    const result: Record<string, string> = {};
    for (const item of raw) {
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        const en = String(obj.english ?? obj.en ?? obj.term ?? '').trim();
        const km = String(obj.khmer ?? obj.km ?? '').trim();
        if (en && km) result[en] = km;
      }
    }
    return result;
  }
  return {};
}

export const importCurriculumDataset = asyncHandler(async (req: Request, res: Response) => {
  assertAdmin(req);

  const rawItems: unknown[] = Array.isArray(req.body)
    ? req.body
    : Array.isArray(req.body?.dataset)
      ? req.body.dataset
      : Array.isArray(req.body?.items)
        ? req.body.items
        : Array.isArray(req.body?.chunks)
          ? req.body.chunks
          : req.body?.chunk
            ? [req.body.chunk]
            : [];

  const commit = req.body?.commit === true || req.query?.commit === 'true';

  if (!rawItems.length) {
    throw new AppError('No curriculum items provided for import', 400);
  }

  const parsedItems: Array<{
    chunkId: string;
    gradeNumber: number;
    gradeId: string;
    gradeName: string;
    subjectName: string;
    subjectCode: string;
    subjectId: string;
    topicName: string;
    topicCode: string;
    topicId: string;
    subtopic: string;
    formulas: unknown[];
    khmerTerms: Record<string, string>;
    text: string;
    summary: string;
    solutionSteps: unknown[];
    commonMisconceptions: unknown[];
    examples: unknown[];
    exercises: unknown[];
    prerequisites: string[];
    tags: string[];
    difficulty: string;
  }> = [];

  const errors: Array<{ index: number; error: string }> = [];

  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i] as Record<string, unknown>;
    if (!item || typeof item !== 'object') {
      errors.push({ index: i, error: 'Item must be a valid JSON object' });
      continue;
    }

    const rawGrade = item.grade ?? (typeof item.id === 'string' && item.id.includes('g10') ? 10 : typeof item.id === 'string' && item.id.includes('g11') ? 11 : 12);
    const gradeNumber = Number(String(rawGrade).replace(/[^0-9]/g, ''));
    if (![10, 11, 12].includes(gradeNumber)) {
      errors.push({ index: i, error: `Invalid grade '${String(rawGrade)}': must be 10, 11, or 12` });
      continue;
    }

    const rawSubject = String(item.subject ?? (typeof item.id === 'string' && item.id.startsWith('physics') ? 'Physics' : typeof item.id === 'string' && item.id.startsWith('chemistry') ? 'Chemistry' : 'Mathematics')).trim();
    const subjectName = rawSubject.toLowerCase().startsWith('chem')
      ? 'Chemistry'
      : rawSubject.toLowerCase().startsWith('phys')
        ? 'Physics'
        : 'Mathematics';

    const topicName = String(item.topic ?? item.chapter ?? 'General').trim();
    if (!topicName) {
      errors.push({ index: i, error: 'Topic name is required' });
      continue;
    }

    const subtopic = String(item.subtopic ?? item.lesson ?? topicName).trim();
    const chunkId = String(item.id ?? `${slugify(subjectName)}-${slugify(topicName)}-${i}`).trim();
    const gradeId = `grade-${gradeNumber}`;
    const gradeName = `Grade ${gradeNumber}`;
    const subjectCode = subjectName === 'Physics' ? `PHY-${gradeNumber}` : subjectName === 'Chemistry' ? `CHEM-${gradeNumber}` : `MATH-${gradeNumber}`;
    const subjectId = `${gradeId}-${slugify(subjectName)}`;
    const topicCode = chunkId;
    const topicId = `topic-${gradeId}-${slugify(subjectName)}-${slugify(topicName)}`;

    const text = String(item.text ?? item.body ?? item.description ?? item.summary ?? '').trim();
    const summary = String(item.summary ?? (text.length > 150 ? text.slice(0, 147) + '...' : text)).trim();
    const formulas = Array.isArray(item.formulas) ? item.formulas : (typeof item.expression === 'string' ? [{ expression: item.expression }] : []);
    const khmerTerms = normalizeKhmerTermsForImport(item.khmer_terms ?? item.khmerTerms);

    parsedItems.push({
      chunkId,
      gradeNumber,
      gradeId,
      gradeName,
      subjectName,
      subjectCode,
      subjectId,
      topicName,
      topicCode,
      topicId,
      subtopic,
      formulas,
      khmerTerms,
      text,
      summary,
      solutionSteps: Array.isArray(item.solution_steps) ? item.solution_steps : Array.isArray(item.steps) ? item.steps : [],
      commonMisconceptions: Array.isArray(item.common_misconceptions) ? item.common_misconceptions : [],
      examples: Array.isArray(item.examples) ? item.examples : [],
      exercises: Array.isArray(item.exercises) ? item.exercises : [],
      prerequisites: Array.isArray(item.prerequisites) ? item.prerequisites.map(String) : [],
      tags: Array.isArray(item.tags) ? item.tags.map(String) : [slugify(subjectName), `grade-${gradeNumber}`],
      difficulty: String(item.difficulty ?? 'intermediate').toLowerCase(),
    });
  }

  const distinctGrades = Array.from(new Set(parsedItems.map((p) => p.gradeName)));
  const distinctSubjects = Array.from(new Set(parsedItems.map((p) => p.subjectName)));
  const distinctTopics = Array.from(new Set(parsedItems.map((p) => p.topicName)));
  const totalFormulas = parsedItems.reduce((acc, p) => acc + p.formulas.length, 0);
  const totalKhmerTerms = parsedItems.reduce((acc, p) => acc + Object.keys(p.khmerTerms).length, 0);

  if (!commit) {
    sendSuccess(res, {
      preview: true,
      totalReceived: rawItems.length,
      validCount: parsedItems.length,
      invalidCount: errors.length,
      errors: errors.slice(0, 10),
      summary: {
        grades: distinctGrades,
        subjects: distinctSubjects,
        topicsCount: distinctTopics.length,
        topics: distinctTopics.slice(0, 20),
        totalFormulas,
        totalKhmerTerms,
      },
      sample: parsedItems.slice(0, 3).map((p) => ({
        grade: p.gradeName,
        subject: p.subjectName,
        topic: p.topicName,
        subtopic: p.subtopic,
        formulaCount: p.formulas.length,
        khmerTermCount: Object.keys(p.khmerTerms).length,
      })),
    }, 'Curriculum dataset preview generated');
    return;
  }

  const db = getFirestore();
  const now = Timestamp.now();
  const actorId = req.user?.userId || 'system_import';

  const gradeDocs = new Map<string, Record<string, unknown>>();
  const subjectDocs = new Map<string, Record<string, unknown>>();
  const topicDocs = new Map<string, Record<string, unknown>>();
  const contentDocs = new Map<string, Record<string, unknown>>();

  for (const item of parsedItems) {
    if (!gradeDocs.has(item.gradeId)) {
      gradeDocs.set(item.gradeId, {
        grade_level_id: item.gradeId,
        grade_name: item.gradeName,
        grade_number: item.gradeNumber,
        khmer_name: item.gradeNumber === 10 ? 'ថ្នាក់ទី១០' : item.gradeNumber === 11 ? 'ថ្នាក់ទី១១' : 'ថ្នាក់ទី១២',
        description: defaultGradeDescriptions[item.gradeNumber] ?? '',
        status: 'active',
        created_at: now,
        updated_at: now,
      });
    }

    if (!subjectDocs.has(item.subjectId)) {
      subjectDocs.set(item.subjectId, {
        subject_id: item.subjectId,
        grade_level_id: item.gradeId,
        grade_name: item.gradeName,
        subject_name: item.subjectName,
        subject_code: item.subjectCode,
        khmer_name: item.subjectName === 'Physics' ? 'រូបវិទ្យា' : item.subjectName === 'Chemistry' ? 'គីមីវិទ្យា' : 'គណិតវិទ្យា',
        display_order: item.subjectName === 'Mathematics' ? 1 : item.subjectName === 'Physics' ? 2 : 3,
        status: 'active',
        created_at: now,
        updated_at: now,
      });
    }

    if (!topicDocs.has(item.topicId)) {
      topicDocs.set(item.topicId, {
        topic_id: item.topicId,
        grade_level_id: item.gradeId,
        subject_id: item.subjectId,
        grade_name: item.gradeName,
        subject_name: item.subjectName,
        topic_name: item.topicName,
        khmer_name: item.khmerTerms[item.topicName] || item.topicName,
        topic_code: item.topicCode,
        description: item.summary || item.text,
        difficulty_level: item.difficulty === 'advanced' ? 'advanced' : item.difficulty === 'easy' ? 'beginner' : 'intermediate',
        learning_objectives: item.solutionSteps.map(String),
        prerequisites: item.prerequisites,
        status: 'active',
        created_at: now,
        updated_at: now,
        created_by: actorId,
        updated_by: actorId,
      });
    }

    const contentId = `content-${slugify(item.chunkId)}`;
    const primaryExpr = item.formulas.length > 0 && typeof item.formulas[0] === 'object' && (item.formulas[0] as Record<string, unknown>).expression
      ? String((item.formulas[0] as Record<string, unknown>).expression)
      : (item.formulas.length > 0 && typeof item.formulas[0] === 'string' ? String(item.formulas[0]) : '');

    const editorVariables = item.formulas.length > 0 && typeof item.formulas[0] === 'object' && (item.formulas[0] as Record<string, unknown>).variables
      ? Object.entries((item.formulas[0] as Record<string, unknown>).variables as Record<string, string>).map(([symbol, meaning], vIdx) => ({
          id: `var-${vIdx + 1}`,
          symbol,
          meaning,
          unit: '',
        }))
      : [];

    const editorSteps = item.solutionSteps.map((stepText, sIdx) => ({
      id: `step-${sIdx + 1}`,
      heading: `Step ${sIdx + 1}`,
      explanation: String(stepText),
      latex: '',
    }));

    const editorKhmerTerms = Object.entries(item.khmerTerms).map(([english, khmer], kIdx) => ({
      id: `term-${kIdx + 1}`,
      english,
      khmer,
    }));

    contentDocs.set(contentId, {
      content_id: contentId,
      curriculum_version_id: 'moeys-v1',
      kind: primaryExpr ? 'formula' : 'concept',
      grade_level_id: item.gradeId,
      subject_id: item.subjectId,
      topic_id: item.topicId,
      grade_name: item.gradeName,
      subject_name: item.subjectName,
      topic_name: item.topicName,
      lesson: item.subtopic,
      title: item.subtopic,
      summary: item.summary,
      body: item.text,
      expression: primaryExpr,
      description: item.text,
      variables: editorVariables,
      steps: editorSteps,
      khmer_terms: editorKhmerTerms,
      prerequisites: item.prerequisites,
      tags: item.tags,
      status: 'draft',
      created_at: now,
      updated_at: now,
    });
  }

  type WriteOp = { collection: string; id: string; data: Record<string, unknown> };
  const operations: WriteOp[] = [];

  for (const [id, data] of gradeDocs.entries()) operations.push({ collection: 'grade_levels', id, data });
  for (const [id, data] of subjectDocs.entries()) operations.push({ collection: 'subjects', id, data });
  for (const [id, data] of topicDocs.entries()) operations.push({ collection: 'topics', id, data });
  for (const [id, data] of contentDocs.entries()) operations.push({ collection: 'admin_curriculum_content', id, data });

  const BATCH_SIZE = 400;
  for (let i = 0; i < operations.length; i += BATCH_SIZE) {
    const chunk = operations.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const op of chunk) {
      batch.set(db.collection(op.collection).doc(op.id), op.data, { merge: true });
    }
    await batch.commit();
  }

  await writeCurriculumAudit(req, 'curriculum.bulk_import', 'bulk', 'moeys-v1');

  sendCreated(res, {
    totalItems: rawItems.length,
    validItems: parsedItems.length,
    gradesUpserted: gradeDocs.size,
    subjectsUpserted: subjectDocs.size,
    topicsUpserted: topicDocs.size,
    contentUpserted: contentDocs.size,
  }, `Successfully imported ${topicDocs.size} topics and ${contentDocs.size} content records`);
});

