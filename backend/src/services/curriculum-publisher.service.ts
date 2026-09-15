import { createHash } from 'crypto';
import { env } from '../config/env';
import { getFirestore } from '../config/firebase';
import { AppError } from '../utils/AppError';
import { incrementMetric } from './observability.service';

type Version = { curriculum_version_id: string; grade_level_id: string; subject_id: string; status: string; published_at?: FirebaseFirestore.Timestamp | null };

function safeText(content: Record<string, unknown>): string {
  return String(content.body ?? content.description ?? content.expression ?? '').trim();
}
function safeKhmerTerms(value: unknown): Record<string, string> {
  if (!Array.isArray(value)) return {};
  return Object.fromEntries(value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && typeof item.english === 'string' && typeof item.khmer === 'string').map((item) => [String(item.english).trim(), String(item.khmer).trim()]).filter(([en, km]) => en && km));
}

export async function publishCurriculumVersionToAi(version: Version): Promise<{ chunkIds: string[]; payloadHash: string }> {
  const db = getFirestore();
  const [grade, subject, contents] = await Promise.all([
    db.collection('grade_levels').doc(version.grade_level_id).get(),
    db.collection('subjects').doc(version.subject_id).get(),
    db.collection('admin_curriculum_content').where('curriculum_version_id', '==', version.curriculum_version_id).get(),
  ]);
  if (!grade.exists || !subject.exists || subject.data()?.status !== 'active' || grade.data()?.status !== 'active') throw new AppError('Only active grade and subject records can be published', 400);
  const gradeNumber = Number(grade.data()?.grade_number);
  if (![10, 11, 12].includes(gradeNumber)) throw new AppError('AI curriculum publishing supports Cambodia Grades 10–12 only', 400);
  const chunks = await Promise.all(contents.docs.map(async (doc) => {
    const content = doc.data() as Record<string, unknown>; const topicId = String(content.topic_id ?? ''); const topic = await db.collection('topics').doc(topicId).get();
    if (!topic.exists || topic.data()?.status !== 'active') throw new AppError('Only active topics can be published', 400);
    const text = safeText(content); const khmerTerms = safeKhmerTerms(content.khmer_terms);
    if (!text || !Object.keys(khmerTerms).length) throw new AppError('Published curriculum needs English instruction and Khmer terms', 400);
    return { id: `admin.${version.curriculum_version_id}.${doc.id}`, grade: gradeNumber, subject: String(subject.data()?.subject_name ?? version.subject_id), topic: String(topic.data()?.topic_name ?? topicId), content_type: String(content.kind ?? 'concept'), text, language: 'en', tags: [topicId], source: { type: 'admin_published', metadata: { curriculum_version_id: version.curriculum_version_id, curriculum_chunk_id: `admin.${version.curriculum_version_id}.${doc.id}`, source_content_id: doc.id, grade_level_id: version.grade_level_id, subject_id: version.subject_id, topic_id: topicId, published_at: version.published_at?.toDate().toISOString() ?? new Date().toISOString() } }, khmer_terms: khmerTerms, prerequisites: Array.isArray(content.prerequisites) ? content.prerequisites.filter((item): item is string => typeof item === 'string') : [] };
  }));
  const payload = { curriculum_version_id: version.curriculum_version_id, chunks };
  const payloadHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const response = await fetch(new URL(`/api/v1/internal/curriculum/versions/${encodeURIComponent(version.curriculum_version_id)}`, env.aiService.baseUrl), { method: 'PUT', headers: { 'content-type': 'application/json', 'x-visual-tutor-internal-token': env.aiService.visualTutorInternalToken }, body: JSON.stringify(payload) });
  if (!response.ok) { incrementMetric('curriculum_publish_failures_total'); throw new AppError('AI curriculum store rejected this published version', 502, true, 'AI_SERVICE_ERROR'); }
  return { chunkIds: chunks.map((chunk) => chunk.id), payloadHash };
}

export async function unpublishCurriculumVersionFromAi(curriculumVersionId: string): Promise<void> {
  const response = await fetch(new URL(`/api/v1/internal/curriculum/versions/${encodeURIComponent(curriculumVersionId)}`, env.aiService.baseUrl), { method: 'DELETE', headers: { 'x-visual-tutor-internal-token': env.aiService.visualTutorInternalToken } });
  if (!response.ok) { incrementMetric('curriculum_publish_failures_total'); throw new AppError('AI curriculum store could not remove archived version', 502, true, 'AI_SERVICE_ERROR'); }
}
