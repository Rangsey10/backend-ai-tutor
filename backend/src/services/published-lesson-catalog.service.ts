import { getFirestore } from '../config/firebase';
import type { ListPublishedLessonsQuery } from '../schemas/published-lesson-catalog.schema';

type FirestoreRow = Record<string, unknown>;

export type StudentPublishedLesson = {
  lesson_id: string;
  curriculum_version_id: string;
  grade_level_id: string;
  grade_number: number;
  grade_name: string;
  subject_id: string;
  subject_name: string;
  topic_id: string;
  topic_name: string;
  topic_khmer_name: string | null;
  title: string;
  description: string | null;
  content_type: 'concept' | 'formula' | 'example' | 'exercise';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  learning_objectives: string[];
  source_reference: {
    curriculum_version_id: string;
    curriculum_chunk_id: string;
    grade_level_id: string;
    subject_id: string;
    topic_id: string;
  };
};

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function stringList(value: unknown): string[] {
  if (typeof value === 'string' && value.trim() !== '') return [value.trim()];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, 12)
    : [];
}

function allowedKind(value: unknown): StudentPublishedLesson['content_type'] {
  return value === 'formula' || value === 'example' || value === 'exercise' ? value : 'concept';
}

function allowedDifficulty(value: unknown): StudentPublishedLesson['difficulty'] {
  return value === 'intermediate' || value === 'advanced' ? value : 'beginner';
}

/**
 * Student-facing curriculum projection. It intentionally never returns lesson
 * bodies, worked solutions, author/reviewer fields, audit history, or arbitrary
 * content metadata. The Tutor retrieves the published version server-side.
 */
export async function listStudentPublishedLessons(
  query: ListPublishedLessonsQuery = {}
): Promise<StudentPublishedLesson[]> {
  const db = getFirestore();
  const versions = await db.collection('curriculum_versions').where('status', '==', 'published').get();
  const rows: StudentPublishedLesson[] = [];

  for (const versionDoc of versions.docs) {
    const version = versionDoc.data() as FirestoreRow;
    const gradeLevelId = text(version.grade_level_id);
    const subjectId = text(version.subject_id);
    const versionId = text(version.curriculum_version_id, versionDoc.id);
    if (!gradeLevelId || !subjectId || !versionId) continue;
    if (query.grade_level_id && query.grade_level_id !== gradeLevelId) continue;
    if (query.subject_id && query.subject_id !== subjectId) continue;

    const [gradeDoc, subjectDoc, contents] = await Promise.all([
      db.collection('grade_levels').doc(gradeLevelId).get(),
      db.collection('subjects').doc(subjectId).get(),
      db.collection('admin_curriculum_content').where('curriculum_version_id', '==', versionId).get(),
    ]);
    const grade = gradeDoc.data() as FirestoreRow | undefined;
    const subject = subjectDoc.data() as FirestoreRow | undefined;
    if (!gradeDoc.exists || !subjectDoc.exists || grade?.status !== 'active' || subject?.status !== 'active') continue;
    const gradeNumber = Number(grade.grade_number);
    if (![10, 11, 12].includes(gradeNumber)) continue;

    for (const contentDoc of contents.docs) {
      const content = contentDoc.data() as FirestoreRow;
      if (content.status !== 'draft' && content.status !== 'published') continue;
      const topicId = text(content.topic_id);
      if (!topicId || (query.topic_id && query.topic_id !== topicId)) continue;
      const topicDoc = await db.collection('topics').doc(topicId).get();
      const topic = topicDoc.data() as FirestoreRow | undefined;
      if (!topicDoc.exists || topic?.status !== 'active' || text(topic.grade_level_id) !== gradeLevelId || text(topic.subject_id) !== subjectId) continue;
      const title = text(content.title, text(topic.topic_name, 'Lesson'));
      const topicName = text(topic.topic_name, 'Topic');
      const searchable = `${title} ${topicName} ${text(subject.subject_name)}`.toLowerCase();
      if (query.search && !searchable.includes(query.search.toLowerCase())) continue;
      rows.push({
        lesson_id: text(content.content_id, contentDoc.id),
        curriculum_version_id: versionId,
        grade_level_id: gradeLevelId,
        grade_number: gradeNumber,
        grade_name: text(grade.grade_name, `Grade ${gradeNumber}`),
        subject_id: subjectId,
        subject_name: text(subject.subject_name, 'Subject'),
        topic_id: topicId,
        topic_name: topicName,
        topic_khmer_name: text(topic.khmer_name) || null,
        title,
        description: text(content.summary) || text(topic.description) || null,
        content_type: allowedKind(content.kind),
        difficulty: allowedDifficulty(content.difficulty_level ?? topic.difficulty_level),
        learning_objectives: stringList(topic.learning_objectives ?? topic.learning_objective),
        source_reference: {
          curriculum_version_id: versionId,
          curriculum_chunk_id: `admin.${versionId}.${contentDoc.id}`,
          grade_level_id: gradeLevelId,
          subject_id: subjectId,
          topic_id: topicId,
        },
      });
    }
  }
  return rows.sort((a, b) => a.grade_number - b.grade_number || a.subject_name.localeCompare(b.subject_name) || a.topic_name.localeCompare(b.topic_name) || a.title.localeCompare(b.title));
}
