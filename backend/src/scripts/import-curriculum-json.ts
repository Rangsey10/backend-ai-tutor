import fs from 'fs';
import path from 'path';
import { Timestamp } from 'firebase-admin/firestore';
import { initFirebase, getFirestore } from '../config/firebase';
import { publishCurriculumVersionToAi, type Version } from '../services/curriculum-publisher.service';

const defaultGradeDescriptions: Record<number, string> = {
  10: 'MoEYS Grade 10 Foundation STEM curriculum covering Mathematical Logic, Sets, Polynomials, Trigonometry, 2D Analytic Geometry, 1D Kinematics, Newton’s Laws, Hydrostatics, Calorimetry, Atomic Structure, Chemical Bonding, and Stoichiometry.',
  11: 'MoEYS Grade 11 Upper Secondary STEM curriculum covering Sequences (AP/GP), Exponential & Logarithmic Functions, Trigonometric Equations, Matrices, Rotational Statics, Work-Energy-Momentum, Electrostatics, DC Circuits, Geometrical Optics, Ideal Gases, Thermochemistry, and Hydrocarbons.',
  12: 'MoEYS Grade 12 National BacII Exam Preparation STEM curriculum covering Limits of Functions, Derivatives, Curve Sketching, Integrals, Differential Equations, Complex Numbers, Probability, 3D Space Geometry, Projectile & Circular Dynamics, Thermodynamics, Waves, Electromagnetism, AC RLC Circuits, Modern Physics, Chemical Kinetics, Equilibrium, Acid-Base Titration, Electrochemistry, and Organic Chemistry.',
};

const defaultSubjectDescriptions: Record<string, Record<number, string>> = {
  Mathematics: {
    10: 'គណិតវិទ្យាថ្នាក់ទី១០៖ តក្កវិទ្យា សំណុំ ចំនួនពិត ពហុធា សមីការដឺក្រេទី២ អនុគមន៍ ប៉ារ៉ាបូល ត្រីកោណមាត្រ និងធរណីមាត្រវិភាគក្នុងប្លង់។ (Logic, Sets, Quadratics, Functions, Trigonometry & 2D Geometry)',
    11: 'គណិតវិទ្យាថ្នាក់ទី១១៖ ស្វ៊ីតចំនួនពិត ស្វ៊ីតនព្វន្ត និងធរណីមាត្រ អនុគមន៍និទស្សន្ត និងលោការីត សមីការត្រីកោណមាត្រ ម៉ាទ្រីស ដេទែមីណង់ និងស្ថិតិ។ (Sequences, Exp/Log, Trigonometry, Matrices & Statistics)',
    12: 'គណិតវិទ្យាថ្នាក់ទី១២ (ត្រៀមប្រឡងបាក់ឌុប)៖ លីមីតនៃអនុគមន៍ ដេរីវេ ការសិក្សាអនុគមន៍ អាំងតេក្រាល សមីការឌីផេរ៉ង់ស្យែល ចំនួនកុំផ្លិច ប្រូបាប និងធរណីមាត្រក្នុងលំហ។ (Limits, Calculus, ODEs, Complex Numbers, Probability & 3D Conics)',
  },
  Physics: {
    10: 'រូបវិទ្យាថ្នាក់ទី១០៖ ចលនាត្រង់ និងទំនាក់សេរី ច្បាប់ញូតុន កម្លាំងកកិត ច្បាប់ហ៊ុក កម្មន្ត អានុភាព ស្តាទិចនៃសន្ទនីយ៍ និងកាឡូរីមាត្រ។ (1D Kinematics, Newton’s Laws, Work/Power, Hydrostatics & Calorimetry)',
    11: 'រូបវិទ្យាថ្នាក់ទី១១៖ លំនឹងអង្គធាតុរឹង និងម៉ូម៉ង់ កម្មន្ត-ថាមពល-បរិមាណចលនា អេឡិចត្រូស្តាទិច ចរន្តជាប់ និងអុបទិចធរណីមាត្រ។ (Torque, Energy/Momentum, Electrostatics, DC Circuits & Geometrical Optics)',
    12: 'រូបវិទ្យាថ្នាក់ទី១២ (ត្រៀមប្រឡងបាក់ឌុប)៖ ស៊ីនេម៉ាទិច និងឌីណាមិច ទែរម៉ូឌីណាមិច លំយោល និងរលក អគ្គិសនីម៉ាញ៉េទិច ចរន្តឆ្លាស់ RLC អុបទិចរលក និងរូបវិទ្យានុយក្លេអ៊ែរ។ (Mechanics, Thermodynamics, Waves, Electromagnetism, AC RLC & Modern Physics)',
  },
  Chemistry: {
    10: 'គីមីវិទ្យាថ្នាក់ទី១០៖ ទម្រង់អាតូម អ៊ីសូតូប តារាងខួបនៃធាតុគីមី សម្ព័ន្ធគីមី ម៉ូល រូបមន្តងាយ និងសមាសធាតុអសរីរាង្គ។ (Atomic Structure, Periodic Table, Bonding, Mole Concept & Inorganic Compounds)',
    11: 'គីមីវិទ្យាថ្នាក់ទី១១៖ ច្បាប់ឧស្ម័នបរិសុទ្ធ សូលុយស្យុង និងកំហាប់ម៉ូល ទែរម៉ូគីមី (ច្បាប់ហេស) ប្រតិកម្មអុកស៊ីដូរេដុកម្ម និងអ៊ីដ្រូកាបួ។ (Ideal Gases, Solutions, Thermochemistry, Redox & Hydrocarbons)',
    12: 'គីមីវិទ្យាថ្នាក់ទី១២ (ត្រៀមប្រឡងបាក់ឌុប)៖ ស៊ីនេទិចគីមី លំនឹងគីមី អាស៊ីត-បាស និងអត្រាកម្ម ស្តូគ្យូមេទ្រី អេឡិចត្រូគីមី និងគីមីសរីរាង្គ។ (Kinetics, Equilibrium, Acid-Base pH/Titration, Stoichiometry, Electrochemistry & Organic Chemistry)',
  },
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
        const en = String(obj.english ?? obj.en ?? obj.term ?? obj.latin ?? '').trim();
        const km = String(obj.khmer ?? obj.km ?? obj.term ?? '').trim();
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
  versionsUpserted: number;
  versionsPublished: number;
}> {
  initFirebase();
  const db = getFirestore();

  const filesToProcess: string[] = [];
  const isImportableFile = (f: string) =>
    (f.endsWith('.json') || f.endsWith('.jsonl')) &&
    !f.startsWith('admin-published');

  if (targetPaths && targetPaths.length > 0) {
    for (const p of targetPaths) {
      const resolved = path.resolve(process.cwd(), p);
      if (fs.existsSync(resolved)) {
        if (fs.statSync(resolved).isDirectory()) {
          const children = fs
            .readdirSync(resolved)
            .filter(isImportableFile)
            .sort()
            .map((f) => path.join(resolved, f));
          filesToProcess.push(...children);
        } else if (isImportableFile(path.basename(resolved))) {
          filesToProcess.push(resolved);
        }
      }
    }
  } else {
    const candidateDirs = [
      path.resolve(process.cwd(), '../../ai-service/data/curriculum'),
      path.resolve(process.cwd(), '../ai-service/data/curriculum'),
    ];
    for (const dir of candidateDirs) {
      if (fs.existsSync(dir)) {
        const files = fs
          .readdirSync(dir)
          .filter(isImportableFile)
          .sort()
          .map((f) => path.join(dir, f));
        filesToProcess.push(...files);
        break;
      }
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
      versionsUpserted: 0,
      versionsPublished: 0,
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

  console.log(`[Curriculum ETL] Read ${rawItems.length} raw items from ${filesToProcess.length} files.`);

  const now = Timestamp.now();
  const gradeDocs = new Map<string, Record<string, unknown>>();
  const subjectDocs = new Map<string, Record<string, unknown>>();
  const topicDocs = new Map<string, Record<string, unknown>>();
  const contentDocs = new Map<string, Record<string, unknown>>();
  const versionDocs = new Map<string, Record<string, unknown>>();
  const publishedVersions: Version[] = [];

  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i];
    if (!item || typeof item !== 'object') continue;

    // Skip legacy test-only fixtures so Firestore only holds the clean MoEYS syllabus
    const itemMeta = (item.metadata && typeof item.metadata === 'object' ? item.metadata : {}) as Record<string, unknown>;
    if (itemMeta.seed_version === 'visual_tutor_seed_v1') {
      continue;
    }

    const rawGrade =
      item.grade ??
      (typeof item.id === 'string' && item.id.includes('g10')
        ? 10
        : typeof item.id === 'string' && item.id.includes('g11')
          ? 11
          : 12);
    const gradeNumber = Number(String(rawGrade).replace(/[^0-9]/g, ''));
    if (![10, 11, 12].includes(gradeNumber)) continue;

    const rawSubject = String(
      item.subject ??
        (typeof item.id === 'string' && item.id.startsWith('phys')
          ? 'Physics'
          : typeof item.id === 'string' && item.id.startsWith('chem')
            ? 'Chemistry'
            : 'Mathematics')
    ).trim();
    const subjectName = rawSubject.toLowerCase().startsWith('chem')
      ? 'Chemistry'
      : rawSubject.toLowerCase().startsWith('phys')
        ? 'Physics'
        : 'Mathematics';

    const topicName = String(item.topic ?? item.chapter ?? '').trim();
    if (!topicName || topicName.toLowerCase() === 'general') continue;

    const sourceObj = (item.source && typeof item.source === 'object' ? item.source : {}) as Record<string, unknown>;
    const sourceMeta = (sourceObj.metadata && typeof sourceObj.metadata === 'object' ? sourceObj.metadata : {}) as Record<string, unknown>;

    const subtopic = String(item.subtopic ?? item.lesson ?? topicName).trim();
    const chunkId = String(item.id ?? `${slugify(subjectName)}-${slugify(topicName)}-${i}`).trim();
    const gradeId = `grade-${gradeNumber}`;
    const gradeName = `Grade ${gradeNumber}`;
    const subjectSlug = slugify(subjectName);
    const subjectCode =
      subjectName === 'Physics'
        ? `PHY-${gradeNumber}`
        : subjectName === 'Chemistry'
          ? `CHEM-${gradeNumber}`
          : `MATH-${gradeNumber}`;
    const subjectId = `${gradeId}-${subjectSlug}`;
    const topicCode = chunkId;
    const topicId = `topic-${gradeId}-${subjectSlug}-${slugify(topicName)}`;

    const publishedVersionId = `version-${gradeId}-${subjectSlug}-moeys-v1`;
    const draftVersionId = `version-${gradeId}-${subjectSlug}-moeys-v1-draft`;

    const text = String(item.text ?? item.body ?? item.description ?? item.summary ?? '').trim();
    const summary = String(item.summary ?? (text.length > 180 ? text.slice(0, 177) + '...' : text)).trim();
    const khmerTerms = normalizeKhmerTerms(item.khmer_terms ?? item.khmerTerms);
    const topicKhmer = String(sourceMeta.topic_khmer ?? khmerTerms[topicName] ?? topicName).trim();
    const subtopicKhmer = String(sourceMeta.subtopic_khmer ?? khmerTerms[subtopic] ?? topicKhmer).trim();
    const khmerDescription = String(sourceMeta.khmer_description ?? topicKhmer).trim();
    const starterProblem = String(sourceMeta.starter_problem ?? '').trim();

    const rawDifficulty = String(sourceMeta.difficulty ?? item.difficulty ?? 'intermediate').toLowerCase();
    const difficultyLevel: 'beginner' | 'intermediate' | 'advanced' =
      rawDifficulty === 'advanced'
        ? 'advanced'
        : rawDifficulty === 'easy' || rawDifficulty === 'basic' || rawDifficulty === 'beginner'
          ? 'beginner'
          : 'intermediate';

    const learningObjectives = Array.isArray(sourceMeta.learning_objectives)
      ? sourceMeta.learning_objectives.map(String)
      : Array.isArray(item.solution_steps)
        ? item.solution_steps.map(String)
        : [];
    const prerequisites = Array.isArray(item.prerequisites) ? item.prerequisites.map(String) : [];
    const tags = Array.isArray(item.tags) ? item.tags.map(String) : [subjectSlug, `grade-${gradeNumber}`];

    const formulas = Array.isArray(item.formulas) ? item.formulas : [];
    const examples = Array.isArray(item.examples) ? item.examples : [];
    const exercises = Array.isArray(item.exercises) ? item.exercises : [];
    const concepts = Array.isArray(sourceMeta.concepts) ? sourceMeta.concepts : [];
    const solutionSteps = Array.isArray(item.solution_steps) ? item.solution_steps.map(String) : [];
    const commonMisconceptions = Array.isArray(item.common_misconceptions) ? item.common_misconceptions : [];

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
        icon_url: subjectName === 'Physics' ? 'atom' : subjectName === 'Chemistry' ? 'flask' : 'sigma',
        description: defaultSubjectDescriptions[subjectName]?.[gradeNumber] ?? '',
        display_order: subjectName === 'Mathematics' ? 1 : subjectName === 'Physics' ? 2 : 3,
        status: 'active',
        created_at: now,
        updated_at: now,
      });
    }

    if (!versionDocs.has(publishedVersionId)) {
      const pubVer: Record<string, unknown> = {
        curriculum_version_id: publishedVersionId,
        grade_level_id: gradeId,
        subject_id: subjectId,
        label: `MoEYS ${gradeName} ${subjectName} Complete Edition`,
        status: 'published',
        change_summary: `Complete Cambodian MoEYS ${gradeName} ${subjectName} national syllabus with Khmer terminology, formulas, worked examples, and exercises.`,
        created_by: 'system_moeys_seed',
        reviewed_by: 'system_moeys_seed',
        published_by: 'system_moeys_seed',
        created_at: now,
        updated_at: now,
        reviewed_at: now,
        published_at: now,
        rejection_reason: null,
        revision: 1,
      };
      versionDocs.set(publishedVersionId, pubVer);
      publishedVersions.push({
        curriculum_version_id: publishedVersionId,
        grade_level_id: gradeId,
        subject_id: subjectId,
        status: 'published',
        published_at: now,
      });
    }

    if (!versionDocs.has(draftVersionId)) {
      versionDocs.set(draftVersionId, {
        curriculum_version_id: draftVersionId,
        grade_level_id: gradeId,
        subject_id: subjectId,
        label: `MoEYS ${gradeName} ${subjectName} Working Draft`,
        status: 'draft',
        change_summary: `Editable working draft for MoEYS ${gradeName} ${subjectName}.`,
        created_by: 'system_moeys_seed',
        reviewed_by: null,
        published_by: null,
        created_at: now,
        updated_at: now,
        reviewed_at: null,
        published_at: null,
        rejection_reason: null,
        revision: 1,
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
        khmer_name: topicKhmer,
        topic_code: topicCode,
        description: text,
        khmer_description: khmerDescription,
        starter_problem: starterProblem,
        difficulty_level: difficultyLevel,
        learning_objectives: learningObjectives,
        prerequisites,
        status: 'active',
        created_at: now,
        updated_at: now,
        created_by: 'system_moeys_seed',
        updated_by: 'system_moeys_seed',
      });
    } else {
      const existingTopic = topicDocs.get(topicId)!;
      const mergedObjectives = Array.from(
        new Set([...(existingTopic.learning_objectives as string[]), ...learningObjectives])
      );
      const mergedPrereqs = Array.from(
        new Set([...(existingTopic.prerequisites as string[]), ...prerequisites])
      );
      existingTopic.learning_objectives = mergedObjectives;
      existingTopic.prerequisites = mergedPrereqs;
    }

    const editorKhmerTerms = Object.entries(khmerTerms).map(([english, khmer], kIdx) => ({
      id: `term-${kIdx + 1}`,
      english,
      khmer,
    }));

    const editorSteps = solutionSteps.map((stepText, sIdx) => ({
      id: `step-${sIdx + 1}`,
      heading: `Step ${sIdx + 1}`,
      explanation: String(stepText).replace(/^Step\s+\d+:\s*/i, ''),
      latex: '',
    }));

    const editorMisconceptions = commonMisconceptions.map((m, mIdx) => {
      if (typeof m === 'string') {
        return { id: `misc-${mIdx + 1}`, text: m, correction: '' };
      }
      const mObj = m as Record<string, unknown>;
      return {
        id: `misc-${mIdx + 1}`,
        text: String(mObj.text ?? mObj.misconception ?? ''),
        correction: String(mObj.correction ?? ''),
      };
    });

    const chunkSlug = slugify(chunkId);

    // 1. Concept docs
    const conceptItems =
      concepts.length > 0
        ? concepts
        : [{ title: `${topicName}: ${subtopic}`, summary, body: text }];

    conceptItems.forEach((rawConcept, cIdx) => {
      const cObj = (rawConcept && typeof rawConcept === 'object' ? rawConcept : {}) as Record<string, unknown>;
      const cTitle = String(cObj.title ?? `${subtopic} — Concept ${cIdx + 1}`).trim();
      const cSummary = String(cObj.summary ?? summary).trim();
      const cBody = String(cObj.body ?? cObj.concept_explanation ?? text).trim();
      const contentId = cIdx === 0 ? `content-${chunkSlug}-concept-1` : `content-${chunkSlug}-concept-${cIdx + 1}`;
      const isPrimaryChunkDoc = cIdx === 0;

      contentDocs.set(contentId, {
        content_id: contentId,
        chunk_id: chunkId,
        curriculum_version_id: publishedVersionId,
        kind: 'concept',
        is_lesson_entry: isPrimaryChunkDoc,
        is_available: true,
        starter_problem: starterProblem,
        problem_count: examples.length + exercises.length,
        grade_level_id: gradeId,
        subject_id: subjectId,
        topic_id: topicId,
        grade_name: gradeName,
        subject_name: subjectName,
        topic_name: topicName,
        topic_khmer: topicKhmer,
        title_km: `${topicKhmer} — ${subtopicKhmer}`,
        khmer_description: khmerDescription,
        lesson: topicName,
        subtopic,
        title: isPrimaryChunkDoc ? `${subtopic} (${subtopicKhmer})` : cTitle,
        summary: cSummary,
        body: isPrimaryChunkDoc ? `${text}\n\n${cBody}` : cBody,
        expression: starterProblem,
        description: cBody,
        variables: [],
        steps: editorSteps,
        khmer_terms: editorKhmerTerms,
        common_misconceptions: editorMisconceptions,
        formulas: isPrimaryChunkDoc ? formulas : [],
        examples: isPrimaryChunkDoc ? examples : [],
        exercises: isPrimaryChunkDoc ? exercises : [],
        solution_steps: solutionSteps,
        prerequisites,
        tags,
        difficulty: difficultyLevel,
        difficulty_level: difficultyLevel,
        status: 'draft',
        created_at: now,
        updated_at: now,
      });
    });

    // 2. Formula docs
    formulas.forEach((rawFormula, fIdx) => {
      const fObj = (
        rawFormula && typeof rawFormula === 'object'
          ? rawFormula
          : { name: `${subtopic} Formula ${fIdx + 1}`, expression: String(rawFormula) }
      ) as Record<string, unknown>;
      const fName = String(fObj.name ?? fObj.formula_name ?? `${subtopic} — Formula ${fIdx + 1}`).trim();
      const fExpr = String(fObj.expression ?? fObj.latex ?? '').trim();
      if (!fExpr) return;
      const fConditions = String(fObj.conditions ?? fObj.explanation ?? '').trim();
      const rawVars = (fObj.variables && typeof fObj.variables === 'object' ? fObj.variables : {}) as Record<
        string,
        string
      >;
      const editorVariables = Object.entries(rawVars).map(([symbol, meaning], vIdx) => ({
        id: `var-${vIdx + 1}`,
        symbol,
        meaning: String(meaning),
        unit: '',
      }));

      const contentId = `content-${chunkSlug}-formula-${fIdx + 1}`;
      contentDocs.set(contentId, {
        content_id: contentId,
        chunk_id: chunkId,
        curriculum_version_id: publishedVersionId,
        kind: 'formula',
        is_lesson_entry: false,
        is_available: true,
        grade_level_id: gradeId,
        subject_id: subjectId,
        topic_id: topicId,
        grade_name: gradeName,
        subject_name: subjectName,
        topic_name: topicName,
        lesson: topicName,
        subtopic,
        title: fName,
        summary: fConditions ? `${fName} (${fConditions})` : fName,
        body: fConditions ? `${fName}: $$${fExpr}$$ — ${fConditions}` : `${fName}: $$${fExpr}$$`,
        expression: fExpr,
        description: fConditions ? `${fName} — Conditions: ${fConditions}` : fName,
        variables: editorVariables,
        steps: editorSteps,
        khmer_terms: editorKhmerTerms,
        common_misconceptions: editorMisconceptions,
        prerequisites,
        tags,
        difficulty: difficultyLevel,
        difficulty_level: difficultyLevel,
        status: 'draft',
        created_at: now,
        updated_at: now,
      });
    });

    // 3. Example docs
    examples.forEach((rawEx, exIdx) => {
      const exObj = (rawEx && typeof rawEx === 'object' ? rawEx : {}) as Record<string, unknown>;
      const problem = String(exObj.problem ?? '').trim();
      if (!problem) return;
      const answer = String(exObj.answer ?? exObj.final_answer ?? '').trim();
      const exStepsRaw = Array.isArray(exObj.solution_steps) ? exObj.solution_steps.map(String) : solutionSteps;
      const exSteps = exStepsRaw.map((s, sIdx) => ({
        id: `step-${sIdx + 1}`,
        heading: `Step ${sIdx + 1}`,
        explanation: s.replace(/^Step\s+\d+:\s*/i, ''),
        latex: '',
      }));

      const contentId = `content-${chunkSlug}-example-${exIdx + 1}`;
      contentDocs.set(contentId, {
        content_id: contentId,
        chunk_id: chunkId,
        curriculum_version_id: publishedVersionId,
        kind: 'example',
        is_lesson_entry: false,
        is_available: true,
        grade_level_id: gradeId,
        subject_id: subjectId,
        topic_id: topicId,
        grade_name: gradeName,
        subject_name: subjectName,
        topic_name: topicName,
        lesson: topicName,
        subtopic,
        title: `Worked Example ${exIdx + 1}: ${problem.length > 90 ? problem.slice(0, 87) + '...' : problem}`,
        summary: problem,
        body: `Problem: ${problem}\n\nSolution:\n${exStepsRaw.join('\n')}\n\nFinal Answer: ${answer}`,
        expression: answer,
        description: problem,
        variables: [],
        steps: exSteps,
        khmer_terms: editorKhmerTerms,
        common_misconceptions: editorMisconceptions,
        prerequisites,
        tags,
        difficulty: difficultyLevel,
        difficulty_level: difficultyLevel,
        status: 'draft',
        created_at: now,
        updated_at: now,
      });
    });

    // 4. Exercise docs
    exercises.forEach((rawExer, exerIdx) => {
      const exerObj = (rawExer && typeof rawExer === 'object' ? rawExer : {}) as Record<string, unknown>;
      const prompt = String(exerObj.prompt ?? exerObj.question ?? '').trim();
      if (!prompt) return;
      const answer = String(exerObj.answer ?? exerObj.expected_answer ?? '').trim();
      const hints = Array.isArray(exerObj.hints)
        ? exerObj.hints.map(String)
        : exerObj.hint
          ? [String(exerObj.hint)]
          : [];
      const exerStepsRaw = Array.isArray(exerObj.solution_steps) ? exerObj.solution_steps.map(String) : [];
      const exerSteps = exerStepsRaw.map((s, sIdx) => ({
        id: `step-${sIdx + 1}`,
        heading: `Step ${sIdx + 1}`,
        explanation: s.replace(/^Step\s+\d+:\s*/i, ''),
        latex: '',
      }));

      const contentId = `content-${chunkSlug}-exercise-${exerIdx + 1}`;
      contentDocs.set(contentId, {
        content_id: contentId,
        chunk_id: chunkId,
        curriculum_version_id: publishedVersionId,
        kind: 'exercise',
        is_lesson_entry: false,
        is_available: true,
        grade_level_id: gradeId,
        subject_id: subjectId,
        topic_id: topicId,
        grade_name: gradeName,
        subject_name: subjectName,
        topic_name: topicName,
        lesson: topicName,
        subtopic,
        title: `Practice Exercise ${exerIdx + 1}: ${prompt.length > 90 ? prompt.slice(0, 87) + '...' : prompt}`,
        summary: hints.length > 0 ? `${prompt} (Hint: ${hints.join(' ')})` : prompt,
        body: [
          `Exercise: ${prompt}`,
          hints.length > 0 ? `Hint: ${hints.join(' | ')}` : '',
          exerStepsRaw.length > 0 ? `Solution Steps:\n${exerStepsRaw.join('\n')}` : '',
          answer ? `Expected Answer: ${answer}` : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
        expression: answer,
        description: prompt,
        variables: [],
        steps: exerSteps.length > 0 ? exerSteps : editorSteps,
        khmer_terms: editorKhmerTerms,
        common_misconceptions: editorMisconceptions,
        prerequisites,
        tags,
        difficulty: difficultyLevel,
        difficulty_level: difficultyLevel,
        status: 'draft',
        created_at: now,
        updated_at: now,
      });
    });
  }

  // Clean up any stale/legacy records in Firestore collections so there are no duplicate or broken records
  const collectionsToClean: Array<{ name: string; keepIds: Set<string> }> = [
    { name: 'grade_levels', keepIds: new Set(gradeDocs.keys()) },
    { name: 'subjects', keepIds: new Set(subjectDocs.keys()) },
    { name: 'topics', keepIds: new Set(topicDocs.keys()) },
    { name: 'admin_curriculum_content', keepIds: new Set(contentDocs.keys()) },
    { name: 'curriculum_versions', keepIds: new Set(versionDocs.keys()) },
  ];

  for (const { name, keepIds } of collectionsToClean) {
    const existingSnap = await db.collection(name).get();
    const staleDocs = existingSnap.docs.filter((d) => !keepIds.has(d.id));
    if (staleDocs.length > 0) {
      console.log(`[Curriculum ETL] Removing ${staleDocs.length} stale documents from '${name}'...`);
      for (let i = 0; i < staleDocs.length; i += 400) {
        const batch = db.batch();
        for (const d of staleDocs.slice(i, i + 400)) {
          batch.delete(d.ref);
        }
        await batch.commit();
      }
    }
  }

  type WriteOp = { collection: string; id: string; data: Record<string, unknown> };
  const operations: WriteOp[] = [];

  for (const [id, data] of gradeDocs.entries()) operations.push({ collection: 'grade_levels', id, data });
  for (const [id, data] of subjectDocs.entries()) operations.push({ collection: 'subjects', id, data });
  for (const [id, data] of topicDocs.entries()) operations.push({ collection: 'topics', id, data });
  for (const [id, data] of versionDocs.entries()) operations.push({ collection: 'curriculum_versions', id, data });
  for (const [id, data] of contentDocs.entries()) operations.push({ collection: 'admin_curriculum_content', id, data });

  const BATCH_SIZE = 400;
  for (let i = 0; i < operations.length; i += BATCH_SIZE) {
    const chunk = operations.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const op of chunk) {
      batch.set(db.collection(op.collection).doc(op.id), op.data);
    }
    await batch.commit();
  }

  // Publish each of the 9 published curriculum versions to ai-service
  let versionsPublished = 0;
  for (const pubVer of publishedVersions) {
    try {
      const publication = await publishCurriculumVersionToAi(pubVer);
      await db
        .collection('curriculum_versions')
        .doc(pubVer.curriculum_version_id)
        .set(
          {
            ai_curriculum_chunk_ids: publication.chunkIds,
            ai_payload_hash: publication.payloadHash,
          },
          { merge: true }
        );
      versionsPublished += 1;
      console.log(
        `[Curriculum ETL] Published ${pubVer.curriculum_version_id} to AI service (${publication.chunkIds.length} chunks).`
      );
    } catch (err) {
      console.warn(
        `[Curriculum ETL] Could not publish ${pubVer.curriculum_version_id} to AI service (is ai-service running?):`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.log(`[Curriculum ETL] Successfully committed:
  - Grades: ${gradeDocs.size}
  - Subjects: ${subjectDocs.size}
  - Topics: ${topicDocs.size}
  - Versions: ${versionDocs.size} (${versionsPublished} synced to AI service)
  - Content Records: ${contentDocs.size}`);

  return {
    totalFiles: filesToProcess.length,
    totalItems: rawItems.length,
    gradesUpserted: gradeDocs.size,
    subjectsUpserted: subjectDocs.size,
    topicsUpserted: topicDocs.size,
    contentUpserted: contentDocs.size,
    versionsUpserted: versionDocs.size,
    versionsPublished,
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
