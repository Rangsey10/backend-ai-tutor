import { createHash } from 'crypto';
import { env } from '../config/env';
import { getFirestore } from '../config/firebase';
import { AppError } from '../utils/AppError';
import { incrementMetric } from './observability.service';

export type Version = {
  curriculum_version_id: string;
  grade_level_id: string;
  subject_id: string;
  status: string;
  published_at?: FirebaseFirestore.Timestamp | null;
};

export type CompiledCurriculumVersion = {
  version: Version;
  chunks: Array<Record<string, unknown>>;
  payload: { curriculum_version_id: string; chunks: Array<Record<string, unknown>> };
  payloadHash: string;
};

function safeText(content: Record<string, unknown>): string {
  return String(content.body ?? content.description ?? content.expression ?? content.summary ?? content.title ?? content.text ?? '').trim();
}

function safeKhmerTerms(value: unknown): Record<string, string> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([en, km]) => typeof en === 'string' && typeof km === 'string' && en.trim() && (km as string).trim())
        .map(([en, km]) => [en.trim(), (km as string).trim()])
    );
  }
  if (!Array.isArray(value)) return {};
  return Object.fromEntries(
    value
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && typeof item.english === 'string' && typeof item.khmer === 'string')
      .map((item) => [String(item.english).trim(), String(item.khmer).trim()])
      .filter(([en, km]) => en && km)
  );
}

function safeFormulas(content: Record<string, unknown>): (string | Record<string, unknown>)[] {
  const formulas: (string | Record<string, unknown>)[] = [];
  if (Array.isArray(content.formulas)) {
    for (const f of content.formulas) {
      if (typeof f === 'string' && f.trim()) {
        formulas.push(f.trim());
      } else if (f && typeof f === 'object') {
        formulas.push(f as Record<string, unknown>);
      }
    }
  }
  const expr = String(content.expression ?? '').trim();
  if (expr) {
    const exists = formulas.some((existing) => (typeof existing === 'string' ? existing : existing.expression) === expr);
    if (!exists) {
      formulas.unshift(expr);
    }
  }
  return formulas;
}

function safeSolutionSteps(content: Record<string, unknown>): string[] {
  const raw = Array.isArray(content.solution_steps)
    ? content.solution_steps
    : Array.isArray(content.steps)
      ? content.steps
      : [];
  return raw
    .map((s) => {
      if (typeof s === 'string') return s.trim();
      if (s && typeof s === 'object') {
        const obj = s as Record<string, unknown>;
        if (typeof obj.text === 'string' && obj.text.trim()) return obj.text.trim();
        const parts: string[] = [];
        if (typeof obj.heading === 'string' && obj.heading.trim()) parts.push(obj.heading.trim());
        if (typeof obj.explanation === 'string' && obj.explanation.trim()) parts.push(obj.explanation.trim());
        if (typeof obj.latex === 'string' && obj.latex.trim()) parts.push(`$${obj.latex.trim()}$`);
        if (parts.length > 0) return parts.join(': ');
      }
      return String(s ?? '').trim();
    })
    .filter(Boolean);
}

type MisconceptionChunkItem = string | { text: string; correction?: string };

function safeCommonMisconceptions(content: Record<string, unknown>): MisconceptionChunkItem[] {
  const raw = Array.isArray(content.common_misconceptions)
    ? content.common_misconceptions
    : Array.isArray(content.misconceptions)
      ? content.misconceptions
      : [];
  const results: MisconceptionChunkItem[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && item.trim()) {
      results.push(item.trim());
    } else if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const text = String(obj.misconception ?? obj.text ?? '').trim();
      const correction = String(obj.correction ?? '').trim();
      if (text) {
        results.push({ text, correction: correction || undefined });
      }
    }
  }
  return results;
}

function safeExamples(content: Record<string, unknown>, text: string, solutionSteps: string[]): Record<string, unknown>[] {
  if (Array.isArray(content.examples) && content.examples.length > 0) {
    return content.examples.filter((e): e is Record<string, unknown> => !!e && typeof e === 'object');
  }
  if (content.kind === 'example') {
    const problem = String(content.title ?? content.summary ?? text).trim();
    if (problem) {
      return [{
        problem,
        answer: String(content.body ?? content.answer ?? '').trim() || undefined,
        solution_steps: solutionSteps,
      }];
    }
  }
  return [];
}

function safeExercises(content: Record<string, unknown>, text: string, solutionSteps: string[]): Record<string, unknown>[] {
  if (Array.isArray(content.exercises) && content.exercises.length > 0) {
    return content.exercises.filter((e): e is Record<string, unknown> => !!e && typeof e === 'object');
  }
  if (content.kind === 'exercise') {
    const prompt = String(content.title ?? content.summary ?? text).trim();
    if (prompt) {
      return [{
        prompt,
        answer: String(content.body ?? content.answer ?? '').trim() || undefined,
        solution_steps: solutionSteps,
      }];
    }
  }
  return [];
}

export async function compileCurriculumVersion(versionOrId: string | Version): Promise<CompiledCurriculumVersion> {
  const db = getFirestore();
  let version: Version;

  if (typeof versionOrId === 'string') {
    const doc = await db.collection('curriculum_versions').doc(versionOrId).get();
    if (!doc.exists) throw new AppError('Curriculum version not found', 404);
    version = doc.data() as Version;
  } else {
    version = versionOrId;
  }

  const [grade, subject, initialContents] = await Promise.all([
    db.collection('grade_levels').doc(version.grade_level_id).get(),
    db.collection('subjects').doc(version.subject_id).get(),
    db.collection('admin_curriculum_content').where('curriculum_version_id', '==', version.curriculum_version_id).get(),
  ]);
  let contents = initialContents;

  if (contents.empty && version.curriculum_version_id.endsWith('-draft')) {
    const baseId = version.curriculum_version_id.replace(/-draft$/, '');
    contents = await db.collection('admin_curriculum_content').where('curriculum_version_id', '==', baseId).get();
  }

  if (!grade.exists || !subject.exists || subject.data()?.status !== 'active' || grade.data()?.status !== 'active') {
    throw new AppError('Only active grade and subject records can be published', 400);
  }

  const gradeNumber = Number(grade.data()?.grade_number);
  if (![10, 11, 12].includes(gradeNumber)) {
    throw new AppError('AI curriculum publishing supports Cambodia Grades 10–12 only', 400);
  }

  if (contents.empty) {
    throw new AppError('A curriculum version must contain at least one lesson before publishing', 400);
  }

  const primaryDocs = contents.docs.filter((d) => d.data()?.is_lesson_entry === true);
  const docsToCompile = primaryDocs.length > 0 ? primaryDocs : contents.docs;

  const chunks = await Promise.all(docsToCompile.map(async (doc) => {
    const content = doc.data() as Record<string, unknown>;
    const topicId = String(content.topic_id ?? '');
    const topic = await db.collection('topics').doc(topicId).get();

    if (!topic.exists || topic.data()?.status !== 'active') {
      throw new AppError(`Topic '${topicId}' not found or not active`, 400);
    }

    const text = safeText(content);
    const khmerTerms = safeKhmerTerms(content.khmer_terms ?? content.khmerTerms);
    if (!text || !Object.keys(khmerTerms).length) {
      throw new AppError('Published curriculum needs English instruction and Khmer terms', 400);
    }

    const solutionSteps = safeSolutionSteps(content);
    const formulas = safeFormulas(content);
    const examples = safeExamples(content, text, solutionSteps);
    const exercises = safeExercises(content, text, solutionSteps);
    const commonMisconceptions = safeCommonMisconceptions(content);
    const subtopic = String(content.subtopic ?? content.lesson ?? '').trim() || undefined;

    return {
      id: `admin.${version.curriculum_version_id}.${doc.id}`,
      grade: gradeNumber,
      subject: String(subject.data()?.subject_name ?? version.subject_id),
      topic: String(topic.data()?.topic_name ?? topicId),
      subtopic,
      content_type: String(content.kind ?? 'concept').toLowerCase(),
      text,
      language: 'en',
      tags: Array.isArray(content.tags) && content.tags.length > 0
        ? content.tags.filter((t): t is string => typeof t === 'string' && !!t.trim())
        : [topicId],
      source: {
        type: 'admin_published',
        metadata: {
          curriculum_version_id: version.curriculum_version_id,
          curriculum_chunk_id: `admin.${version.curriculum_version_id}.${doc.id}`,
          source_content_id: doc.id,
          grade_level_id: version.grade_level_id,
          subject_id: version.subject_id,
          topic_id: topicId,
          review_status: version.status,
          published_at: version.published_at && typeof version.published_at.toDate === 'function'
            ? version.published_at.toDate().toISOString()
            : new Date().toISOString(),
        }
      },
      khmer_terms: khmerTerms,
      prerequisites: Array.isArray(content.prerequisites)
        ? content.prerequisites.filter((item): item is string => typeof item === 'string' && !!item.trim())
        : [],
      formulas,
      examples,
      exercises,
      solution_steps: solutionSteps,
      common_misconceptions: commonMisconceptions,
    };
  }));

  const payload = { curriculum_version_id: version.curriculum_version_id, chunks };
  const payloadHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');

  return {
    version,
    chunks,
    payload,
    payloadHash,
  };
}

export async function publishCurriculumVersionToAi(
  version: Version
): Promise<{ chunkIds: string[]; payloadHash: string; compilation: CompiledCurriculumVersion }> {
  const compilation = await compileCurriculumVersion(version);
  const { payload, payloadHash, chunks } = compilation;

  const url = new URL(
    `/api/v1/internal/curriculum/versions/${encodeURIComponent(version.curriculum_version_id)}`,
    env.aiService.baseUrl
  );

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-visual-tutor-internal-token': env.aiService.visualTutorInternalToken,
      },
      body: JSON.stringify(payload),
    });
  } catch (err: unknown) {
    incrementMetric('curriculum_publish_failures_total');
    const msg = err instanceof Error ? err.message : String(err);
    throw new AppError(`AI service connection failed during publish: ${msg}`, 502, true, 'AI_SERVICE_UNAVAILABLE');
  }

  if (!response.ok) {
    incrementMetric('curriculum_publish_failures_total');
    let errorDetail = '';
    try {
      const errJson = (await response.json()) as Record<string, unknown>;
      errorDetail = errJson.detail ? String(errJson.detail) : JSON.stringify(errJson);
    } catch {
      errorDetail = response.statusText;
    }
    throw new AppError(`AI curriculum store rejected this published version (${response.status}): ${errorDetail}`, 502, true, 'AI_SERVICE_ERROR');
  }

  return {
    chunkIds: chunks.map((chunk) => String(chunk.id)),
    payloadHash,
    compilation,
  };
}

export async function unpublishCurriculumVersionFromAi(curriculumVersionId: string): Promise<void> {
  const url = new URL(
    `/api/v1/internal/curriculum/versions/${encodeURIComponent(curriculumVersionId)}`,
    env.aiService.baseUrl
  );

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'x-visual-tutor-internal-token': env.aiService.visualTutorInternalToken,
      },
    });
  } catch (err: unknown) {
    incrementMetric('curriculum_publish_failures_total');
    const msg = err instanceof Error ? err.message : String(err);
    throw new AppError(`AI service connection failed during unpublish: ${msg}`, 502, true, 'AI_SERVICE_UNAVAILABLE');
  }

  if (!response.ok) {
    incrementMetric('curriculum_publish_failures_total');
    let errorDetail = '';
    try {
      const errJson = (await response.json()) as Record<string, unknown>;
      errorDetail = errJson.detail ? String(errJson.detail) : response.statusText;
    } catch {
      errorDetail = response.statusText;
    }
    throw new AppError(`AI curriculum store could not remove archived version (${response.status}): ${errorDetail}`, 502, true, 'AI_SERVICE_ERROR');
  }
}
