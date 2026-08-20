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
  code: string;
  status: 'Active' | 'Inactive';
};

type AdminContentKind = 'Formula' | 'Concept' | 'Example' | 'Exercise';
type AdminContentStatus = 'Published' | 'Draft';

type CurriculumContentDocument = {
  content_id: string;
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
  return value.toLowerCase() === 'published' ? 'published' : 'draft';
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

function toAdminTopic(topic: FirebaseFirestore.DocumentData): AdminTopic {
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
    code: String(topic.topic_code ?? ''),
    status: topic.status === 'inactive' ? 'Inactive' : 'Active',
  };
}

function toAdminContent(content: CurriculumContentDocument): AdminCurriculumContent {
  return {
    id: content.content_id,
    content_id: content.content_id,
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
    .map((doc) => toAdminTopic({ ...doc.data(), topic_id: doc.id }))
    .filter((topic) => topic.topic_id && topic.name)
    .sort((left, right) => left.name.localeCompare(right.name));

  sendSuccess(res, { topics }, 'Topics loaded');
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
  const gradeName = readRequiredString(req.body?.grade, 'Grade name');
  const subjectName = readRequiredString(req.body?.subject, 'Subject name');
  const topicName = readRequiredString(req.body?.lesson, 'Lesson name');
  const contentId = `${kind}-${topicId}-${slugify(String(req.body?.expression ?? req.body?.title ?? 'content'))}-${Date.now()}`;
  const now = Timestamp.now();

  const content: CurriculumContentDocument = {
    content_id: contentId,
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
  const updatedContent: CurriculumContentDocument = {
    ...currentContent,
    kind: req.body?.kind !== undefined ? normalizeContentKind(req.body.kind) : currentContent.kind,
    grade_level_id: req.body?.grade_level_id !== undefined ? readRequiredString(req.body.grade_level_id, 'Grade level id') : currentContent.grade_level_id,
    subject_id: req.body?.subject_id !== undefined ? readRequiredString(req.body.subject_id, 'Subject id') : currentContent.subject_id,
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
  sendSuccess(res, toAdminContent(updatedContent), 'Curriculum content updated');
});

export const deleteAdminContent = asyncHandler(async (req: Request, res: Response) => {
  assertAdmin(req);

  const contentId = readRequiredString(req.params.contentId, 'Content id');
  await getFirestore().collection('admin_curriculum_content').doc(contentId).delete();
  sendSuccess(res, { content_id: contentId }, 'Curriculum content deleted');
});
