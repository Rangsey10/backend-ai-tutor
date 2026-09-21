import fs from 'fs';
import path from 'path';
import { Timestamp } from 'firebase-admin/firestore';
import { initFirebase, getFirestore } from '../config/firebase';

const defaultGradeDescriptions: Record<number, string> = {
  10: 'Foundation for upper secondary study with core science and social science tracks.',
  11: 'Upper secondary curriculum covering Chemistry, advanced equations, and deeper reasoning skills.',
  12: 'High school graduation year with national exam preparation including Physics and advanced Math.',
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeKhmerTerms(raw: unknown): Record<string, string> {
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

export async function runCurriculumImport(targetPaths?: string[]): Promise<{
  totalFiles: number;
  totalItems: number;
  gradesUpserted: number;
  subjectsUpserted: number;
  topicsUpserted: number;
  contentUpserted: number;
}> {
  initFirebase();
  const db = getFirestore();

  let filesToProcess: string[] = [];
  if (targetPaths && targetPaths.length > 0) {
    for (const p of targetPaths) {
      const resolved = path.resolve(process.cwd(), p);
      if (fs.existsSync(resolved)) {
        if (fs.statSync(resolved).isDirectory()) {
          const children = fs.readdirSync(resolved)
            .filter((f) => f.endsWith('.json') || f.endsWith('.jsonl'))
            .map((f) => path.join(resolved, f));
          filesToProcess.push(...children);
        } else {
          filesToProcess.push(resolved);
        }
      }
    }
  } else {
    // Default location: ai-service/data/curriculum/
    const defaultDir = path.resolve(process.cwd(), '../../ai-service/data/curriculum');
    if (fs.existsSync(defaultDir)) {
      const files = fs.readdirSync(defaultDir)
        .filter((f) => f.endsWith('.json') || f.endsWith('.jsonl'))
        .map((f) => path.join(defaultDir, f));
      filesToProcess.push(...files);
    }
  }

  if (filesToProcess.length === 0) {
    console.warn('[Curriculum ETL] No curriculum files found to import.');
    return {
      totalFiles: 0,
      totalItems: 0,
      gradesUpserted: 0,
      subjectsUpserted: 0,
      topicsUpserted: 0,
      contentUpserted: 0,
    };
  }

  const rawItems: Array<Record<string, unknown>> = [];
  for (const filePath of filesToProcess) {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (filePath.endsWith('.jsonl')) {
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          rawItems.push(JSON.parse(trimmed));
        } catch (err) {
          console.warn(`[Curriculum ETL] Skipping invalid JSON line in ${path.basename(filePath)}:`, err);
        }
      }
    } else {
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          rawItems.push(...parsed);
        } else if (parsed && typeof parsed === 'object') {
          rawItems.push(parsed);
        }
      } catch (err) {
        console.warn(`[Curriculum ETL] Skipping invalid JSON in ${path.basename(filePath)}:`, err);
      }
    }
  }

  console.log(`[Curriculum ETL] Read ${rawItems.length} items from ${filesToProcess.length} files.`);

  const now = Timestamp.now();
  const gradeDocs = new Map<string, Record<string, unknown>>();
  const subjectDocs = new Map<string, Record<string, unknown>>();
  const topicDocs = new Map<string, Record<string, unknown>>();
  const contentDocs = new Map<string, Record<string, unknown>>();

  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i];
    if (!item || typeof item !== 'object') continue;

    const rawGrade = item.grade ?? (typeof item.id === 'string' && item.id.includes('g10') ? 10 : typeof item.id === 'string' && item.id.includes('g11') ? 11 : 12);
    const gradeNumber = Number(String(rawGrade).replace(/[^0-9]/g, ''));
    if (![10, 11, 12].includes(gradeNumber)) continue;

    const rawSubject = String(item.subject ?? (typeof item.id === 'string' && item.id.startsWith('physics') ? 'Physics' : typeof item.id === 'string' && item.id.startsWith('chemistry') ? 'Chemistry' : 'Mathematics')).trim();
    const subjectName = rawSubject.toLowerCase().startsWith('chem')
      ? 'Chemistry'
      : rawSubject.toLowerCase().startsWith('phys')
        ? 'Physics'
        : 'Mathematics';

    const topicName = String(item.topic ?? item.chapter ?? 'General').trim();
    if (!topicName) continue;

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
    const khmerTerms = normalizeKhmerTerms(item.khmer_terms ?? item.khmerTerms);

    if (!gradeDocs.has(gradeId)) {
      gradeDocs.set(gradeId, {
        grade_level_id: gradeId,
        grade_name: gradeName,
        grade_number: gradeNumber,
        khmer_name: gradeNumber === 10 ? 'ថ្នាក់ទី១០' : gradeNumber === 11 ? 'ថ្នាក់ទី១១' : 'ថ្នាក់ទី១២',
        description: defaultGradeDescriptions[gradeNumber] ?? '',
        status: 'active',
        created_at: now,
        updated_at: now,
      });
    }

    if (!subjectDocs.has(subjectId)) {
      subjectDocs.set(subjectId, {
        subject_id: subjectId,
        grade_level_id: gradeId,
        grade_name: gradeName,
        subject_name: subjectName,
        subject_code: subjectCode,
        khmer_name: subjectName === 'Physics' ? 'រូបវិទ្យា' : subjectName === 'Chemistry' ? 'គីមីវិទ្យា' : 'គណិតវិទ្យា',
        display_order: subjectName === 'Mathematics' ? 1 : subjectName === 'Physics' ? 2 : 3,
        status: 'active',
        created_at: now,
        updated_at: now,
      });
    }

    if (!topicDocs.has(topicId)) {
      topicDocs.set(topicId, {
        topic_id: topicId,
        grade_level_id: gradeId,
        subject_id: subjectId,
        grade_name: gradeName,
        subject_name: subjectName,
        topic_name: topicName,
        khmer_name: khmerTerms[topicName] || topicName,
        topic_code: topicCode,
        description: summary || text,
        difficulty_level: String(item.difficulty ?? 'intermediate').toLowerCase() === 'advanced' ? 'advanced' : String(item.difficulty ?? '').toLowerCase() === 'easy' ? 'beginner' : 'intermediate',
        learning_objectives: Array.isArray(item.solution_steps) ? item.solution_steps.map(String) : [],
        prerequisites: Array.isArray(item.prerequisites) ? item.prerequisites.map(String) : [],
        status: 'active',
        created_at: now,
        updated_at: now,
        created_by: 'system_import',
        updated_by: 'system_import',
      });
    }

    const contentId = `content-${slugify(chunkId)}`;
    const primaryExpr = formulas.length > 0 && typeof formulas[0] === 'object' && (formulas[0] as Record<string, unknown>).expression
      ? String((formulas[0] as Record<string, unknown>).expression)
      : (formulas.length > 0 && typeof formulas[0] === 'string' ? String(formulas[0]) : '');

    const editorVariables = formulas.length > 0 && typeof formulas[0] === 'object' && (formulas[0] as Record<string, unknown>).variables
      ? Object.entries((formulas[0] as Record<string, unknown>).variables as Record<string, string>).map(([symbol, meaning], vIdx) => ({
          id: `var-${vIdx + 1}`,
          symbol,
          meaning,
          unit: '',
        }))
      : [];

    const editorSteps = (Array.isArray(item.solution_steps) ? item.solution_steps : []).map((stepText, sIdx) => ({
      id: `step-${sIdx + 1}`,
      heading: `Step ${sIdx + 1}`,
      explanation: String(stepText),
      latex: '',
    }));

    const editorKhmerTerms = Object.entries(khmerTerms).map(([english, khmer], kIdx) => ({
      id: `term-${kIdx + 1}`,
      english,
      khmer,
    }));

    contentDocs.set(contentId, {
      content_id: contentId,
      curriculum_version_id: 'moeys-v1',
      kind: primaryExpr ? 'formula' : 'concept',
      grade_level_id: gradeId,
      subject_id: subjectId,
      topic_id: topicId,
      grade_name: gradeName,
      subject_name: subjectName,
      topic_name: topicName,
      lesson: subtopic,
      title: subtopic,
      summary: summary,
      body: text,
      expression: primaryExpr,
      description: text,
      variables: editorVariables,
      steps: editorSteps,
      khmer_terms: editorKhmerTerms,
      prerequisites: Array.isArray(item.prerequisites) ? item.prerequisites.map(String) : [],
      tags: Array.isArray(item.tags) ? item.tags.map(String) : [slugify(subjectName), `grade-${gradeNumber}`],
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

  console.log(`[Curriculum ETL] Successfully committed:
  - Grades: ${gradeDocs.size}
  - Subjects: ${subjectDocs.size}
  - Topics: ${topicDocs.size}
  - Content Records: ${contentDocs.size}`);

  return {
    totalFiles: filesToProcess.length,
    totalItems: rawItems.length,
    gradesUpserted: gradeDocs.size,
    subjectsUpserted: subjectDocs.size,
    topicsUpserted: topicDocs.size,
    contentUpserted: contentDocs.size,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  runCurriculumImport(args)
    .then(() => {
      console.log('[Curriculum ETL] Done.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Curriculum ETL] Failed:', err);
      process.exit(1);
    });
}
