import fs from 'fs';
import path from 'path';
import { getFirestore } from '../config/firebase';
import type { ListPublishedLessonsQuery } from '../schemas/published-lesson-catalog.schema';

type FirestoreRow = Record<string, unknown>;

export type LessonConceptItem = {
  title: string;
  summary: string;
  body: string;
};

export type LessonFormulaItem = {
  name: string;
  expression: string;
  explanation?: string;
  variables?: Record<string, string>;
};

export type LessonExampleItem = {
  problem: string;
  solution: string;
  steps: string[];
};

export type LessonDetailedContent = {
  lesson_id: string;
  title: string;
  topic_id: string;
  topic_name: string;
  topic_khmer_name: string | null;
  subject_id: string;
  subject_name: string;
  grade_number: number;
  grade_name: string;
  learning_objectives: string[];
  concepts: LessonConceptItem[];
  formulas: LessonFormulaItem[];
  examples: LessonExampleItem[];
  common_misconceptions: string[];
  khmer_terms: Record<string, string>;
  prerequisites?: string[];
  starter_problem?: string | null;
};

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
  is_available: boolean;
  starter_problem?: string | null;
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

function canonicalSubjectId(rawSubjectId: string, rawSubjectName = ''): string {
  const combined = `${rawSubjectId} ${rawSubjectName}`.toLowerCase();
  if (combined.includes('chem')) return 'chemistry';
  if (combined.includes('phys')) return 'physics';
  if (combined.includes('math')) return 'math';
  return rawSubjectId;
}

/**
 * Student-facing curriculum projection. It intentionally never returns lesson
 * bodies, worked solutions, author/reviewer fields, audit history, or arbitrary
 * content metadata. The Tutor retrieves the published version server-side.
 */
let cachedAllLessons: StudentPublishedLesson[] | null = null;
let cachedAllLessonsExpiry = 0;
const LESSON_CACHE_TTL_MS = 5 * 60 * 1000;

export function clearPublishedLessonCatalogCache(): void {
  cachedAllLessons = null;
  cachedAllLessonsExpiry = 0;
}

function filterPublishedLessons(
  lessons: StudentPublishedLesson[],
  query: ListPublishedLessonsQuery
): StudentPublishedLesson[] {
  const qSearch = (query.search || '').trim().toLowerCase();
  return lessons
    .filter((lesson) => {
      if (query.grade_level_id && lesson.grade_level_id !== query.grade_level_id) return false;
      if (
        query.subject_id &&
        lesson.subject_id !== query.subject_id &&
        canonicalSubjectId(query.subject_id) !== canonicalSubjectId(lesson.subject_id)
      ) {
        return false;
      }
      if (query.topic_id && lesson.topic_id !== query.topic_id) return false;
      if (qSearch) {
        const searchable = `${lesson.title} ${lesson.topic_name} ${lesson.topic_khmer_name ?? ''} ${lesson.subject_name} ${lesson.description ?? ''}`.toLowerCase();
        if (!searchable.includes(qSearch)) return false;
      }
      return true;
    })
    .sort(
      (a, b) =>
        a.grade_number - b.grade_number ||
        a.subject_name.localeCompare(b.subject_name) ||
        a.topic_name.localeCompare(b.topic_name) ||
        a.title.localeCompare(b.title)
    );
}

export async function listStudentPublishedLessons(
  query: ListPublishedLessonsQuery = {}
): Promise<StudentPublishedLesson[]> {
  const now = Date.now();
  if (process.env.NODE_ENV !== 'test' && cachedAllLessons && now < cachedAllLessonsExpiry) {
    return filterPublishedLessons(cachedAllLessons, query);
  }

  const rows: StudentPublishedLesson[] = [];
  try {
    const db = getFirestore();
    const versions = await db.collection('curriculum_versions').where('status', '==', 'published').get();

  for (const versionDoc of versions.docs) {
    const version = versionDoc.data() as FirestoreRow;
    const gradeLevelId = text(version.grade_level_id);
    const subjectId = text(version.subject_id);
    const versionId = text(version.curriculum_version_id, versionDoc.id);
    if (!gradeLevelId || !subjectId || !versionId) continue;
    if (query.grade_level_id && query.grade_level_id !== gradeLevelId) continue;
    if (
      query.subject_id &&
      query.subject_id !== subjectId &&
      canonicalSubjectId(query.subject_id) !== canonicalSubjectId(subjectId)
    ) {
      continue;
    }

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

    const normalizedSubjectId = canonicalSubjectId(subjectId, text(subject.subject_name));
    const primaryDocs = contents.docs.filter((d) => (d.data() as FirestoreRow)?.is_lesson_entry === true);
    const lessonDocs = primaryDocs.length > 0 ? primaryDocs : contents.docs;

    for (const contentDoc of lessonDocs) {
      const content = contentDoc.data() as FirestoreRow;
      if (content.status !== 'draft' && content.status !== 'published') continue;
      const topicId = text(content.topic_id);
      if (!topicId || (query.topic_id && query.topic_id !== topicId)) continue;
      const topicDoc = await db.collection('topics').doc(topicId).get();
      const topic = topicDoc.data() as FirestoreRow | undefined;
      if (!topicDoc.exists || topic?.status !== 'active' || text(topic.grade_level_id) !== gradeLevelId || text(topic.subject_id) !== subjectId) continue;
      const title = text(content.title, text(topic.topic_name, 'Lesson'));
      const topicName = text(topic.topic_name, 'Topic');
      const topicKhmerName = text(topic.khmer_name);
      const searchable = `${title} ${topicName} ${topicKhmerName} ${text(subject.subject_name)}`.toLowerCase();
      if (query.search && !searchable.includes(query.search.toLowerCase())) continue;
      const isAvailable = VERIFIED_SOLVER_TOPICS.has(topicId.toLowerCase()) || Boolean(content.is_available) || Boolean(topic.starter_problem);
      const starterProblem = text(content.starter_problem) || text(topic.starter_problem) || (isAvailable ? defaultStarterFor(topicId) : null);
      rows.push({
        lesson_id: text(content.content_id, contentDoc.id),
        curriculum_version_id: versionId,
        grade_level_id: gradeLevelId,
        grade_number: gradeNumber,
        grade_name: text(grade.grade_name, `Grade ${gradeNumber}`),
        subject_id: normalizedSubjectId,
        subject_name: text(subject.subject_name, 'Subject'),
        topic_id: topicId,
        topic_name: topicName,
        topic_khmer_name: topicKhmerName || null,
        title,
        description: text(content.summary) || text(topic.description) || null,
        content_type: allowedKind(content.kind),
        difficulty: allowedDifficulty(content.difficulty_level ?? topic.difficulty_level),
        learning_objectives: stringList(topic.learning_objectives ?? topic.learning_objective),
        is_available: isAvailable,
        starter_problem: starterProblem,
        source_reference: {
          curriculum_version_id: versionId,
          curriculum_chunk_id: `admin.${versionId}.${contentDoc.id}`,
          grade_level_id: gradeLevelId,
          subject_id: normalizedSubjectId,
          topic_id: topicId,
        },
      });
    }
  }

    if (rows.length > 0) {
      if (process.env.NODE_ENV !== 'test' && !query.grade_level_id && !query.subject_id && !query.topic_id && !query.search) {
        cachedAllLessons = rows;
        cachedAllLessonsExpiry = now + LESSON_CACHE_TTL_MS;
      }
      return filterPublishedLessons(rows, query);
    }
  } catch (error) {
    console.warn('[listStudentPublishedLessons] Firestore query failed; using fallback or cached lessons:', (error as Error)?.message || error);
  }

  const baseLessons = (process.env.NODE_ENV !== 'test' && cachedAllLessons && cachedAllLessons.length > 0)
    ? cachedAllLessons
    : defaultGrade12PublishedLessons;
  return filterPublishedLessons(baseLessons, query);
}

const VERIFIED_SOLVER_TOPICS = new Set([
  'limits-of-functions-g12',
  'limits of functions',
  'limits',
  'math-g12-limits-of-functions',
  'kinematics-g12',
  'physics_kinematics',
  'kinematics',
  'physics-g12-kinematics',
  'stoichiometry-g12',
  'chemistry_balancing_equations',
  'stoichiometry',
  'chemical equations',
  'chemistry-g12-stoichiometry',
]);

function defaultStarterFor(topicId: string): string | null {
  const norm = topicId.toLowerCase();
  if (norm.includes('limit')) return '\\lim_{x \\to 3} \\frac{x^2 - 9}{x - 3}';
  if (norm.includes('kinematic')) return 'v = u + at, u=0, a=2, t=5';
  if (norm.includes('stoichio') || norm.includes('equation')) return '2H_2 + O_2 \\to 2H_2O';
  return null;
}

export const defaultGrade12PublishedLessons: StudentPublishedLesson[] = [
  // ── Mathematics (Grade 12) ────────────────────────────────────────────────
  {
    lesson_id: 'math.g12.lesson1.limits-of-functions',
    curriculum_version_id: 'g12-stem-math-v1',
    grade_level_id: 'grade-12',
    grade_number: 12,
    grade_name: 'Grade 12',
    subject_id: 'math',
    subject_name: 'Mathematics',
    topic_id: 'limits-of-functions-g12',
    topic_name: 'Limits of Functions',
    topic_khmer_name: 'លីមីតនៃអនុគមន៍',
    title: 'លីមីតនៃអនុគមន៍ (Limits of Functions)',
    description: 'គណនាលីមីតកំណត់ រាងមិនកំណត់ 0/0 និងលីមីតនៃអនុគមន៍សនិទាន។ Calculate finite limits, indeterminate forms 0/0, and rational function limits.',
    content_type: 'concept',
    difficulty: 'advanced',
    learning_objectives: ['Evaluate finite limits at a point', 'Factor polynomials to resolve 0/0 indeterminate forms'],
    is_available: true,
    starter_problem: '\\lim_{x \\to 3} \\frac{x^2 - 9}{x - 3}',
    source_reference: {
      curriculum_version_id: 'g12-stem-math-v1',
      curriculum_chunk_id: 'g12.math.limits.01',
      grade_level_id: 'grade-12',
      subject_id: 'math',
      topic_id: 'limits-of-functions-g12',
    },
  },
  {
    lesson_id: 'math.g12.lesson2.derivatives',
    curriculum_version_id: 'g12-stem-math-v1',
    grade_level_id: 'grade-12',
    grade_number: 12,
    grade_name: 'Grade 12',
    subject_id: 'math',
    subject_name: 'Mathematics',
    topic_id: 'derivatives-g12',
    topic_name: 'Derivatives of Functions',
    topic_khmer_name: 'ដេរីវេនៃអនុគមន៍',
    title: 'ដេរីវេនៃអនុគមន៍ (Derivatives of Functions)',
    description: 'គណនាដេរីវេ អត្រាបម្រែបម្រួលភ្លាមៗ និងសមីការបន្ទាត់ប៉ះ។ Calculate derivatives, rates of change, and tangent line equations.',
    content_type: 'concept',
    difficulty: 'advanced',
    learning_objectives: ['Apply the power and product rules', 'Find tangent line slope at a given point'],
    is_available: false,
    starter_problem: null,
    source_reference: {
      curriculum_version_id: 'g12-stem-math-v1',
      curriculum_chunk_id: 'g12.math.derivatives.01',
      grade_level_id: 'grade-12',
      subject_id: 'math',
      topic_id: 'derivatives-g12',
    },
  },
  {
    lesson_id: 'math.g12.lesson3.integrals',
    curriculum_version_id: 'g12-stem-math-v1',
    grade_level_id: 'grade-12',
    grade_number: 12,
    grade_name: 'Grade 12',
    subject_id: 'math',
    subject_name: 'Mathematics',
    topic_id: 'integrals-g12',
    topic_name: 'Integrals & Area Calculation',
    topic_khmer_name: 'អាំងតេក្រាល និងផ្ទៃក្រឡា',
    title: 'អាំងតេក្រាល និងផ្ទៃក្រឡា (Integrals & Area Calculation)',
    description: 'គណនាអាំងតេក្រាលមិនកំណត់ និងអាំងតេក្រាលកំណត់សម្រាប់ស្វែងរកផ្ទៃក្រឡា។ Evaluate indefinite and definite integrals to compute area under curves.',
    content_type: 'concept',
    difficulty: 'advanced',
    learning_objectives: ['Evaluate basic indefinite antiderivatives', 'Compute definite integrals for area under curves'],
    is_available: false,
    starter_problem: null,
    source_reference: {
      curriculum_version_id: 'g12-stem-math-v1',
      curriculum_chunk_id: 'g12.math.integrals.01',
      grade_level_id: 'grade-12',
      subject_id: 'math',
      topic_id: 'integrals-g12',
    },
  },
  {
    lesson_id: 'math.g12.lesson4.complex-numbers',
    curriculum_version_id: 'g12-stem-math-v1',
    grade_level_id: 'grade-12',
    grade_number: 12,
    grade_name: 'Grade 12',
    subject_id: 'math',
    subject_name: 'Mathematics',
    topic_id: 'complex-numbers-g12',
    topic_name: 'Complex Numbers',
    topic_khmer_name: 'ចំនួនកុំផ្លិច',
    title: 'ចំនួនកុំផ្លិច (Complex Numbers)',
    description: 'ទម្រង់ពីជគណិត និងទម្រង់ត្រីកោណមាត្រនៃចំនួនកុំផ្លិច។ Represent and operate with complex numbers in algebraic and trigonometric forms.',
    content_type: 'concept',
    difficulty: 'advanced',
    learning_objectives: ['Compute sum, difference, and product of complex numbers', 'Find modulus and argument'],
    is_available: false,
    starter_problem: null,
    source_reference: {
      curriculum_version_id: 'g12-stem-math-v1',
      curriculum_chunk_id: 'g12.math.complex.01',
      grade_level_id: 'grade-12',
      subject_id: 'math',
      topic_id: 'complex-numbers-g12',
    },
  },
  {
    lesson_id: 'math.g12.lesson5.probability',
    curriculum_version_id: 'g12-stem-math-v1',
    grade_level_id: 'grade-12',
    grade_number: 12,
    grade_name: 'Grade 12',
    subject_id: 'math',
    subject_name: 'Mathematics',
    topic_id: 'probability-g12',
    topic_name: 'Probability & Combinatorics',
    topic_khmer_name: 'ប្រូបាប និងបន្សំ',
    title: 'ប្រូបាប និងបន្សំ (Probability & Combinatorics)',
    description: 'គណនាបន្សំ តម្រៀប និងប្រូបាបនៃព្រឹត្តិការណ៍ចៃដន្យ។ Compute combinations, permutations, and probability of discrete events.',
    content_type: 'concept',
    difficulty: 'intermediate',
    learning_objectives: ['Apply permutations and combinations formulas', 'Calculate theoretical probability of events'],
    is_available: false,
    starter_problem: null,
    source_reference: {
      curriculum_version_id: 'g12-stem-math-v1',
      curriculum_chunk_id: 'g12.math.prob.01',
      grade_level_id: 'grade-12',
      subject_id: 'math',
      topic_id: 'probability-g12',
    },
  },

  // ── Physics (Grade 12) ────────────────────────────────────────────────────
  {
    lesson_id: 'physics.g12.lesson1.kinematics',
    curriculum_version_id: 'g12-stem-physics-v1',
    grade_level_id: 'grade-12',
    grade_number: 12,
    grade_name: 'Grade 12',
    subject_id: 'physics',
    subject_name: 'Physics',
    topic_id: 'kinematics-g12',
    topic_name: 'Kinematics: Uniformly Accelerated Motion',
    topic_khmer_name: 'ចលនាត្រង់ស្ទុះស្មើ',
    title: 'ចលនាត្រង់ស្ទុះស្មើ (Kinematics: Constant Acceleration)',
    description: 'ដោះស្រាយបញ្ហាចលនាដោយប្រើសមីការ v = u + at និង s = ut + 1/2 at^2 ជាមួយខ្នាតច្បាស់លាស់។ Solve 1D constant acceleration problems using kinematic equations with explicit units.',
    content_type: 'concept',
    difficulty: 'intermediate',
    learning_objectives: ['Select the appropriate kinematic equation', 'Solve for displacement, velocity, or time with units'],
    is_available: true,
    starter_problem: 'v = u + at, u=0, a=2, t=5',
    source_reference: {
      curriculum_version_id: 'g12-stem-physics-v1',
      curriculum_chunk_id: 'g12.phys.kinematics.01',
      grade_level_id: 'grade-12',
      subject_id: 'physics',
      topic_id: 'kinematics-g12',
    },
  },
  {
    lesson_id: 'physics.g12.lesson2.dynamics',
    curriculum_version_id: 'g12-stem-physics-v1',
    grade_level_id: 'grade-12',
    grade_number: 12,
    grade_name: 'Grade 12',
    subject_id: 'physics',
    subject_name: 'Physics',
    topic_id: 'dynamics-g12',
    topic_name: "Newton's Laws & Dynamics",
    topic_khmer_name: 'ច្បាប់ញូតុន និងឌីណាមិច',
    title: "ច្បាប់ញូតុន និងឌីណាមិច (Newton's Laws & Dynamics)",
    description: 'វិភាគកម្លាំង សំទុះ និងគំនូសកម្លាំងសេរី។ Construct free-body diagrams and calculate acceleration and resultant forces.',
    content_type: 'concept',
    difficulty: 'intermediate',
    learning_objectives: ['Draw free-body diagrams for inclined and horizontal surfaces', 'Apply F = ma to compute resultant forces'],
    is_available: false,
    starter_problem: null,
    source_reference: {
      curriculum_version_id: 'g12-stem-physics-v1',
      curriculum_chunk_id: 'g12.phys.dynamics.01',
      grade_level_id: 'grade-12',
      subject_id: 'physics',
      topic_id: 'dynamics-g12',
    },
  },
  {
    lesson_id: 'physics.g12.lesson3.work-energy',
    curriculum_version_id: 'g12-stem-physics-v1',
    grade_level_id: 'grade-12',
    grade_number: 12,
    grade_name: 'Grade 12',
    subject_id: 'physics',
    subject_name: 'Physics',
    topic_id: 'work-energy-g12',
    topic_name: 'Work, Energy & Power',
    topic_khmer_name: 'កម្មន្ត ថាមពល និងអានុភាព',
    title: 'កម្មន្ត ថាមពល និងអានុភាព (Work, Energy & Power)',
    description: 'ច្បាប់រក្សាថាមពលមេកានិច និងការគណនាកម្មន្តនៃកម្លាំង។ Apply the work-energy theorem and mechanical energy conservation principles.',
    content_type: 'concept',
    difficulty: 'intermediate',
    learning_objectives: ['Calculate work done by variable and constant forces', 'Apply conservation of mechanical energy'],
    is_available: false,
    starter_problem: null,
    source_reference: {
      curriculum_version_id: 'g12-stem-physics-v1',
      curriculum_chunk_id: 'g12.phys.workenergy.01',
      grade_level_id: 'grade-12',
      subject_id: 'physics',
      topic_id: 'work-energy-g12',
    },
  },
  {
    lesson_id: 'physics.g12.lesson4.waves',
    curriculum_version_id: 'g12-stem-physics-v1',
    grade_level_id: 'grade-12',
    grade_number: 12,
    grade_name: 'Grade 12',
    subject_id: 'physics',
    subject_name: 'Physics',
    topic_id: 'waves-g12',
    topic_name: 'Mechanical Waves & Oscillations',
    topic_khmer_name: 'រលកមេកានិច និងសំឡេង',
    title: 'រលកមេកានិច និងសំឡេង (Mechanical Waves & Oscillations)',
    description: 'លក្ខណៈរលក ប្រេកង់ ប្រវែងរលក និងល្បឿនដំណាលរលក។ Relate wave frequency, period, wavelength, and propagation speed in material media.',
    content_type: 'concept',
    difficulty: 'advanced',
    learning_objectives: ['Use wave equation v = f lambda', 'Distinguish transverse and longitudinal waves'],
    is_available: false,
    starter_problem: null,
    source_reference: {
      curriculum_version_id: 'g12-stem-physics-v1',
      curriculum_chunk_id: 'g12.phys.waves.01',
      grade_level_id: 'grade-12',
      subject_id: 'physics',
      topic_id: 'waves-g12',
    },
  },
  {
    lesson_id: 'physics.g12.lesson5.electromagnetism',
    curriculum_version_id: 'g12-stem-physics-v1',
    grade_level_id: 'grade-12',
    grade_number: 12,
    grade_name: 'Grade 12',
    subject_id: 'physics',
    subject_name: 'Physics',
    topic_id: 'electromagnetism-g12',
    topic_name: 'Electromagnetism & Induction',
    topic_khmer_name: 'អគ្គិសនី និងដែនម៉ាញ៉េទិច',
    title: 'អគ្គិសនី និងដែនម៉ាញ៉េទិច (Electromagnetism & Induction)',
    description: 'ដែនម៉ាញ៉េទិច ច្បាប់ហ្វារ៉ាដេយ និងកម្លាំងអេឡិចត្រូម៉ូទ័រអាំងឌ្វី។ Calculate magnetic forces and induced electromotive force using Faraday and Lenz laws.',
    content_type: 'concept',
    difficulty: 'advanced',
    learning_objectives: ['Apply Faraday law of electromagnetic induction', 'Determine direction of induced current via Lenz law'],
    is_available: false,
    starter_problem: null,
    source_reference: {
      curriculum_version_id: 'g12-stem-physics-v1',
      curriculum_chunk_id: 'g12.phys.em.01',
      grade_level_id: 'grade-12',
      subject_id: 'physics',
      topic_id: 'electromagnetism-g12',
    },
  },

  // ── Chemistry (Grade 12) ──────────────────────────────────────────────────
  {
    lesson_id: 'chemistry.g12.lesson1.stoichiometry',
    curriculum_version_id: 'g12-stem-chem-v1',
    grade_level_id: 'grade-12',
    grade_number: 12,
    grade_name: 'Grade 12',
    subject_id: 'chemistry',
    subject_name: 'Chemistry',
    topic_id: 'stoichiometry-g12',
    topic_name: 'Stoichiometry & Reaction Balance',
    topic_khmer_name: 'ស្តូគ្យូម៉េទ្រី និងសមីការគីមី',
    title: 'ស្តូគ្យូម៉េទ្រី និងសមីការគីមី (Stoichiometry & Reaction Balance)',
    description: 'ថ្លឹងសមីការគីមី គណនាម៉ូល ម៉ាសម៉ូល និងទំនាក់ទំនងម៉ាស-ម៉ូលក្នុងប្រតិកម្ម។ Balance chemical reactions and compute stoichiometric molar ratios and mass conservation.',
    content_type: 'concept',
    difficulty: 'intermediate',
    learning_objectives: ['Balance chemical reaction equations', 'Calculate mass and moles of reactants and products'],
    is_available: true,
    starter_problem: '2H_2 + O_2 \\to 2H_2O',
    source_reference: {
      curriculum_version_id: 'g12-stem-chem-v1',
      curriculum_chunk_id: 'g12.chem.stoich.01',
      grade_level_id: 'grade-12',
      subject_id: 'chemistry',
      topic_id: 'stoichiometry-g12',
    },
  },
  {
    lesson_id: 'chemistry.g12.lesson2.kinetics',
    curriculum_version_id: 'g12-stem-chem-v1',
    grade_level_id: 'grade-12',
    grade_number: 12,
    grade_name: 'Grade 12',
    subject_id: 'chemistry',
    subject_name: 'Chemistry',
    topic_id: 'kinetics-g12',
    topic_name: 'Chemical Kinetics & Reaction Rates',
    topic_khmer_name: 'ស៊ីនេទិចគីមី និងល្បឿនប្រតិកម្ម',
    title: 'ស៊ីនេទិចគីមី និងល្បឿនប្រតិកម្ម (Chemical Kinetics & Reaction Rates)',
    description: 'កត្តាជះឥទ្ធិពលលើល្បឿនប្រតិកម្ម និងច្បាប់ល្បឿន។ Analyze rate laws, half-life, and factors affecting chemical reaction rates.',
    content_type: 'concept',
    difficulty: 'advanced',
    learning_objectives: ['Determine reaction rate from concentration changes over time', 'Evaluate activation energy impact'],
    is_available: false,
    starter_problem: null,
    source_reference: {
      curriculum_version_id: 'g12-stem-chem-v1',
      curriculum_chunk_id: 'g12.chem.kinetics.01',
      grade_level_id: 'grade-12',
      subject_id: 'chemistry',
      topic_id: 'kinetics-g12',
    },
  },
  {
    lesson_id: 'chemistry.g12.lesson3.equilibrium',
    curriculum_version_id: 'g12-stem-chem-v1',
    grade_level_id: 'grade-12',
    grade_number: 12,
    grade_name: 'Grade 12',
    subject_id: 'chemistry',
    subject_name: 'Chemistry',
    topic_id: 'equilibrium-g12',
    topic_name: 'Chemical Equilibrium & Le Chatelier',
    topic_khmer_name: 'លំនឹងគីមី និងគោលការណ៍ឡឺឆាតឺលីយេ',
    title: 'លំនឹងគីមី និងគោលការណ៍ឡឺឆាតឺលីយេ (Chemical Equilibrium & Le Chatelier)',
    description: 'ថេរលំនឹង Kc ការផ្លាស់ប្តូរលំនឹងតាមកំហាប់ សម្ពាធ និងសីតុណ្ហភាព។ Determine equilibrium constants and predict equilibrium shifts using Le Chatelier principle.',
    content_type: 'concept',
    difficulty: 'advanced',
    learning_objectives: ['Write equilibrium constant expression Kc', 'Predict equilibrium displacement direction'],
    is_available: false,
    starter_problem: null,
    source_reference: {
      curriculum_version_id: 'g12-stem-chem-v1',
      curriculum_chunk_id: 'g12.chem.equilibrium.01',
      grade_level_id: 'grade-12',
      subject_id: 'chemistry',
      topic_id: 'equilibrium-g12',
    },
  },
  {
    lesson_id: 'chemistry.g12.lesson4.acids-bases',
    curriculum_version_id: 'g12-stem-chem-v1',
    grade_level_id: 'grade-12',
    grade_number: 12,
    grade_name: 'Grade 12',
    subject_id: 'chemistry',
    subject_name: 'Chemistry',
    topic_id: 'acids-bases-g12',
    topic_name: 'Acids, Bases & pH Calculations',
    topic_khmer_name: 'អាស៊ីត-បាស និងកម្រិត pH',
    title: 'អាស៊ីត-បាស និងកម្រិត pH (Acids, Bases & pH Calculations)',
    description: 'គណនា pH, pOH, កំហាប់អ៊ីយ៉ុង H3O+ និង OH- ក្នុងសូលុយស្យុង។ Calculate pH, pOH, and concentrations of H3O+ and OH- ions in aqueous solution.',
    content_type: 'concept',
    difficulty: 'intermediate',
    learning_objectives: ['Calculate pH from hydronium ion concentration', 'Understand buffer solutions and neutralisation'],
    is_available: false,
    starter_problem: null,
    source_reference: {
      curriculum_version_id: 'g12-stem-chem-v1',
      curriculum_chunk_id: 'g12.chem.acids.01',
      grade_level_id: 'grade-12',
      subject_id: 'chemistry',
      topic_id: 'acids-bases-g12',
    },
  },
  {
    lesson_id: 'chemistry.g12.lesson5.organic',
    curriculum_version_id: 'g12-stem-chem-v1',
    grade_level_id: 'grade-12',
    grade_number: 12,
    grade_name: 'Grade 12',
    subject_id: 'chemistry',
    subject_name: 'Chemistry',
    topic_id: 'organic-chemistry-g12',
    topic_name: 'Organic Chemistry: Functional Groups',
    topic_khmer_name: 'គីមីសរីរាង្គ៖ បង្គុំនាទី',
    title: 'គីមីសរីរាង្គ៖ បង្គុំនាទី (Organic Chemistry: Functional Groups)',
    description: 'សម្គាល់ និងហៅឈ្មោះអាល់កុល អាល់ដេអ៊ីត សេតូន និងអាស៊ីតកាបុកស៊ីលិច។ Identify functional groups and apply IUPAC nomenclature for alcohols, aldehydes, and acids.',
    content_type: 'concept',
    difficulty: 'advanced',
    learning_objectives: ['Identify functional groups in organic molecules', 'Name common organic compounds using systematic rules'],
    is_available: false,
    starter_problem: null,
    source_reference: {
      curriculum_version_id: 'g12-stem-chem-v1',
      curriculum_chunk_id: 'g12.chem.organic.01',
      grade_level_id: 'grade-12',
      subject_id: 'chemistry',
      topic_id: 'organic-chemistry-g12',
    },
  },
];

// ── In-Memory Cache for Detailed Lesson Content ──────────────────────────────
const detailedContentCache = new Map<string, { data: LessonDetailedContent; expiresAt: number }>();
const DETAILED_CONTENT_CACHE_TTL_MS = 5 * 60 * 1000;

export function clearLessonDetailedContentCache(lessonId?: string): void {
  if (lessonId) {
    detailedContentCache.delete(lessonId);
  } else {
    detailedContentCache.clear();
  }
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
        const km = String(obj.khmer ?? obj.km ?? '').trim();
        if (en && km) result[en] = km;
      }
    }
    return result;
  }
  return {};
}

function normalizeMisconceptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const results: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && item.trim()) {
      results.push(item.trim());
    } else if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const t = text(obj.text ?? obj.misconception);
      const c = text(obj.correction);
      if (t && c) {
        results.push(`${t} — Correction: ${c}`);
      } else if (t) {
        results.push(t);
      }
    }
  }
  return results.slice(0, 10);
}

function parseLessonDetailedContent(
  cleanId: string,
  content: FirestoreRow,
  siblingDocs: FirestoreRow[] = []
): LessonDetailedContent {
  const title = text(content.title, 'Lesson Content');
  const topicId = text(content.topic_id);
  const topicName = text(content.topic_name, text(content.lesson, 'Topic'));
  const topicKhmerName = text(content.topic_khmer, text(content.khmer_name)) || null;
  const rawSubjectId = text(content.subject_id);
  const subjectName = text(content.subject_name, 'Subject');
  const subjectId = canonicalSubjectId(rawSubjectId, subjectName);
  const gradeNumber = Number(content.grade_number) || 12;
  const gradeName = text(content.grade_name, `Grade ${gradeNumber}`);
  const learningObjectives = stringList(content.learning_objectives ?? content.learning_objective);

  // Concepts
  const rawConcepts = Array.isArray(content.concepts) && content.concepts.length > 0
    ? content.concepts
    : siblingDocs.filter((d) => d.kind === 'concept');

  const concepts: LessonConceptItem[] = [];
  if (Array.isArray(rawConcepts) && rawConcepts.length > 0) {
    for (const item of rawConcepts) {
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        concepts.push({
          title: text(obj.title, `${topicName} Concept`),
          summary: text(obj.summary, text(obj.body, '')).slice(0, 300),
          body: text(obj.body, text(obj.concept_explanation, text(obj.summary, ''))),
        });
      }
    }
  }
  if (concepts.length === 0) {
    concepts.push({
      title,
      summary: text(content.summary, title),
      body: text(content.body, text(content.summary, title)),
    });
  }

  // Formulas
  const rawFormulas = Array.isArray(content.formulas) && content.formulas.length > 0
    ? content.formulas
    : siblingDocs.filter((d) => d.kind === 'formula');

  const formulas: LessonFormulaItem[] = [];
  if (Array.isArray(rawFormulas)) {
    for (const item of rawFormulas) {
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        const expr = text(obj.expression, text(obj.latex));
        if (expr) {
          formulas.push({
            name: text(obj.name, text(obj.formula_name, text(obj.title, 'Formula'))),
            expression: expr,
            explanation: text(obj.explanation, text(obj.conditions, text(obj.summary, ''))) || undefined,
          });
        }
      }
    }
  }

  // Examples
  const rawExamples = Array.isArray(content.examples) && content.examples.length > 0
    ? content.examples
    : siblingDocs.filter((d) => d.kind === 'example');

  const examples: LessonExampleItem[] = [];
  if (Array.isArray(rawExamples)) {
    for (const item of rawExamples) {
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        const problem = text(obj.problem, text(obj.summary, text(obj.title, '')));
        if (problem) {
          const solution = text(obj.solution, text(obj.answer, text(obj.expression, '')));
          const steps = stringList(obj.steps ?? obj.solution_steps);
          examples.push({
            problem,
            solution,
            steps: steps.length > 0 ? steps : (solution ? [solution] : []),
          });
        }
      }
    }
  }

  // Common misconceptions
  const rawMisconceptions = content.common_misconceptions ?? 
    siblingDocs.find((d) => Array.isArray(d.common_misconceptions))?.common_misconceptions;
  const commonMisconceptions = normalizeMisconceptions(rawMisconceptions);

  // Khmer terms
  const rawKhmerTerms = content.khmer_terms ?? 
    siblingDocs.find((d) => d.khmer_terms && typeof d.khmer_terms === 'object')?.khmer_terms;
  const khmerTerms = normalizeKhmerTerms(rawKhmerTerms);

  // Prerequisites
  const prerequisites = stringList(content.prerequisites);

  // Starter problem
  const starterProblem = text(content.starter_problem) || (formulas.length > 0 ? formulas[0].expression : null);

  return {
    lesson_id: text(content.content_id, cleanId),
    title,
    topic_id: topicId,
    topic_name: topicName,
    topic_khmer_name: topicKhmerName,
    subject_id: subjectId,
    subject_name: subjectName,
    grade_number: gradeNumber,
    grade_name: gradeName,
    learning_objectives: learningObjectives.length > 0 ? learningObjectives : [`Master concepts in ${topicName}`],
    concepts,
    formulas,
    examples,
    common_misconceptions: commonMisconceptions,
    khmer_terms: khmerTerms,
    prerequisites: prerequisites.length > 0 ? prerequisites : undefined,
    starter_problem: starterProblem,
  };
}

function tryLoadCurriculumFromDisk(cleanId: string): LessonDetailedContent | null {
  try {
    const candidateDirs = [
      path.resolve(process.cwd(), '../../ai-service/data/curriculum'),
      path.resolve(process.cwd(), '../ai-service/data/curriculum'),
      path.resolve(__dirname, '../../../ai-service/data/curriculum'),
    ];
    let curriculumDir: string | null = null;
    for (const d of candidateDirs) {
      if (fs.existsSync(d)) {
        curriculumDir = d;
        break;
      }
    }
    if (!curriculumDir) return null;

    const files = fs.readdirSync(curriculumDir).filter((f) => f.endsWith('.jsonl'));
    const lowerId = cleanId.toLowerCase();

    for (const f of files) {
      const filePath = path.join(curriculumDir, f);
      const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const item = JSON.parse(line.trim()) as Record<string, unknown>;
          const chunkId = text(item.chunk_id).toLowerCase();
          const topicId = text(item.topic_id).toLowerCase();
          const topicName = text(item.topic_name).toLowerCase();
          if (
            (chunkId && (chunkId === lowerId || lowerId.includes(chunkId) || chunkId.includes(lowerId))) ||
            (topicId && (topicId === lowerId || lowerId.includes(topicId) || topicId.includes(lowerId))) ||
            (topicName && lowerId.includes(topicName))
          ) {
            return parseLessonDetailedContent(cleanId, item, []);
          }
        } catch {
          // ignore line error
        }
      }
    }
  } catch {
    // ignore filesystem error
  }
  return null;
}

const preBundledLessonContentMap: Record<string, LessonDetailedContent> = {
  'math.g12.lesson1.limits-of-functions': {
    lesson_id: 'math.g12.lesson1.limits-of-functions',
    title: 'លីមីតនៃអនុគមន៍ (Limits of Functions)',
    topic_id: 'limits-of-functions-g12',
    topic_name: 'Limits of Functions',
    topic_khmer_name: 'លីមីតនៃអនុគមន៍',
    subject_id: 'math',
    subject_name: 'Mathematics',
    grade_number: 12,
    grade_name: 'Grade 12',
    learning_objectives: [
      'Evaluate finite limits at a point by direct substitution',
      'Recognize and resolve 0/0 indeterminate forms by factoring or multiplying by conjugate',
      'Calculate limits at infinity and identify vertical/horizontal asymptotes',
    ],
    concepts: [
      {
        title: 'Finite Limit & Direct Substitution (លីមីតកំណត់ត្រង់មួយចំណុច)',
        summary: 'Evaluating lim_{x -> a} f(x) by direct substitution when f is continuous at a.',
        body: 'If a function f(x) is continuous at x = a, the limit as x approaches a is simply f(a). If direct substitution yields a real number L, then lim_{x -> a} f(x) = L.',
      },
      {
        title: 'Indeterminate Form 0/0 (រាងមិនកំណត់ 0/0)',
        summary: 'When direct substitution yields 0/0, simplify using factorization or conjugate expressions.',
        body: 'When f(a) / g(a) = 0/0, both numerator and denominator contain (x - a) as a factor. Factor both polynomials, simplify the common term (x - a) for x != a, and evaluate the limit of the simplified expression.',
      },
      {
        title: 'Infinite Limits & Asymptotes (លីមីតអនន្ត និងអាស៊ីមតូត)',
        summary: 'Connecting infinite limits to vertical asymptotes and limits at infinity to horizontal asymptotes.',
        body: 'If lim_{x -> a} f(x) = +-infinity, the line x = a is a vertical asymptote. If lim_{x -> +-infinity} f(x) = L, the line y = L is a horizontal asymptote.',
      },
    ],
    formulas: [
      {
        name: 'Two-Sided Limit Existence',
        expression: '\\lim_{x \\to a} f(x) = L \\iff \\lim_{x \\to a^-} f(x) = \\lim_{x \\to a^+} f(x) = L',
        explanation: 'Limit exists if and only if both left-hand and right-hand limits are equal.',
      },
      {
        name: 'Indeterminate Form 0/0 Resolution',
        expression: '\\lim_{x \\to a} \\frac{P(x)}{Q(x)} = \\lim_{x \\to a} \\frac{(x - a)P_1(x)}{(x - a)Q_1(x)} = \\lim_{x \\to a} \\frac{P_1(x)}{Q_1(x)}',
        explanation: 'Factor out (x - a) and simplify before substituting.',
      },
      {
        name: 'Reciprocal Power Limits',
        expression: '\\lim_{x \\to \\pm\\infty} \\frac{c}{x^n} = 0 \\quad (n > 0)',
        explanation: 'As x approaches infinity, any constant divided by a positive power of x approaches zero.',
      },
    ],
    examples: [
      {
        problem: 'Evaluate \\lim_{x \\to 3} \\frac{x^2 - 9}{x - 3}',
        solution: '6',
        steps: [
          'Direct substitution: (3^2 - 9)/(3 - 3) = 0/0 (indeterminate form).',
          'Factor numerator using difference of two squares: x^2 - 9 = (x - 3)(x + 3).',
          'Cancel common factor (x - 3) for x != 3: (x - 3)(x + 3)/(x - 3) = x + 3.',
          'Substitute x = 3 into simplified expression: 3 + 3 = 6.',
        ],
      },
      {
        problem: 'Evaluate \\lim_{x \\to +\\infty} \\frac{2x^2 + 5}{3x^2 - 2x + 1}',
        solution: '\\frac{2}{3}',
        steps: [
          'Factor out dominant term x^2 from numerator and denominator.',
          'Numerator: x^2(2 + 5/x^2), Denominator: x^2(3 - 2/x + 1/x^2).',
          'Cancel x^2 and apply reciprocal limit laws as x -> infinity.',
          'Result: (2 + 0)/(3 - 0 + 0) = 2/3. Horizontal asymptote y = 2/3.',
        ],
      },
    ],
    common_misconceptions: [
      'Assuming 0/0 equals 1 or 0 (it is indeterminate and requires algebraic transformation).',
      'Canceling (x - a) without noting that the limit evaluates the behavior near a, not at a.',
    ],
    khmer_terms: {
      limit: 'លីមីត',
      'indeterminate form': 'រាងមិនកំណត់',
      'vertical asymptote': 'អាស៊ីមតូតឈរ',
      'horizontal asymptote': 'អាស៊ីមតូតដេក',
      continuity: 'ភាពជាប់នៃអនុគមន៍',
    },
    prerequisites: ['Factoring polynomials and difference of squares', 'Domain of rational functions'],
    starter_problem: '\\lim_{x \\to 3} \\frac{x^2 - 9}{x - 3}',
  },
  'physics.g12.lesson1.kinematics': {
    lesson_id: 'physics.g12.lesson1.kinematics',
    title: 'ស៊ីនេម៉ាទិច (Kinematics & 1D/2D Motion)',
    topic_id: 'kinematics-g12',
    topic_name: 'Kinematics & Motion',
    topic_khmer_name: 'ស៊ីនេម៉ាទិច និងចលនា',
    subject_id: 'physics',
    subject_name: 'Physics',
    grade_number: 12,
    grade_name: 'Grade 12',
    learning_objectives: [
      'Apply kinematic equations to uniformly accelerated rectilinear motion',
      'Analyze velocity-time graphs to determine displacement and acceleration',
      'Solve projectile motion by separating horizontal and vertical components',
    ],
    concepts: [
      {
        title: 'Uniformly Accelerated Rectilinear Motion (ចលនាត្រង់ប្រែប្រួលស្មើ)',
        summary: 'Motion along a straight line with constant acceleration a.',
        body: 'When acceleration is constant, velocity changes at a steady rate over time. Displacement, velocity, acceleration, and time are related through fundamental kinematic equations.',
      },
      {
        title: 'Projectile Motion (ចលនាគ្រាប់បាញ់)',
        summary: 'Two-dimensional motion under the influence of gravity alone.',
        body: 'Horizontal motion has constant velocity (a_x = 0), while vertical motion has constant downward gravitational acceleration (a_y = -g). Both dimensions share time t.',
      },
    ],
    formulas: [
      {
        name: 'Velocity-Time Relation',
        expression: 'v = v_0 + at',
        explanation: 'Final velocity equals initial velocity plus acceleration multiplied by time.',
      },
      {
        name: 'Displacement-Time Relation',
        expression: 'x = x_0 + v_0 t + \\frac{1}{2}at^2',
        explanation: 'Displacement under constant acceleration.',
      },
      {
        name: 'Torricelli Equation (Time-Independent)',
        expression: 'v^2 - v_0^2 = 2a(x - x_0)',
        explanation: 'Relates velocities, acceleration, and displacement without time.',
      },
    ],
    examples: [
      {
        problem: 'A car starts from rest (v_0 = 0) with acceleration a = 2 m/s^2. Find its velocity and displacement after t = 5 s.',
        solution: 'v = 10 m/s, x = 25 m',
        steps: [
          'Identify given variables: v_0 = 0 m/s, a = 2 m/s^2, t = 5 s.',
          'Use velocity equation: v = v_0 + at = 0 + (2)(5) = 10 m/s.',
          'Use displacement equation: x = v_0 t + (1/2) a t^2 = 0 + 0.5(2)(5^2) = 25 m.',
        ],
      },
    ],
    common_misconceptions: [
      'Confusing velocity with acceleration (an object can have zero velocity but non-zero acceleration at peak height).',
      'Applying constant acceleration formulas when acceleration is varying.',
    ],
    khmer_terms: {
      kinematics: 'ស៊ីនេម៉ាទិច',
      velocity: 'ល្បឿន',
      acceleration: 'សំទុះ',
      displacement: 'បម្លាស់ទី',
      projectile: 'គ្រាប់បាញ់',
    },
    prerequisites: ['Vectors and trigonometry', 'Basic algebraic manipulation'],
    starter_problem: 'v = u + at, u=0, a=2, t=5',
  },
  'chemistry.g12.lesson1.stoichiometry': {
    lesson_id: 'chemistry.g12.lesson1.stoichiometry',
    title: 'ស្តូគ្យូម៉េទ្រី និងសមីការគីមី (Stoichiometry & Reaction Balance)',
    topic_id: 'stoichiometry-g12',
    topic_name: 'Stoichiometry & Reaction Balance',
    topic_khmer_name: 'ស្តូគ្យូម៉េទ្រី និងសមីការគីមី',
    subject_id: 'chemistry',
    subject_name: 'Chemistry',
    grade_number: 12,
    grade_name: 'Grade 12',
    learning_objectives: [
      'Balance chemical equations obeying the Law of Conservation of Mass',
      'Convert between mass, moles, and number of particles using molar mass',
      'Determine limiting reactant and theoretical yield in a chemical reaction',
    ],
    concepts: [
      {
        title: 'Law of Conservation of Mass (ច្បាប់រក្សាម៉ាស)',
        summary: 'Atoms are neither created nor destroyed in a chemical reaction.',
        body: 'A chemical equation must have the same number of atoms of each element on both sides of the reaction arrow. Coefficients indicate stoichiometric molar ratios.',
      },
      {
        title: 'Mole Concept & Molar Conversions (គំនិតម៉ូល)',
        summary: 'Relating macroscopic measurable mass (grams) to microscopic particle quantities (moles).',
        body: 'One mole contains 6.022 * 10^23 particles. The molar mass M (g/mol) converts between mass and moles via n = m / M.',
      },
    ],
    formulas: [
      {
        name: 'Mole from Mass',
        expression: 'n = \\frac{m}{M}',
        explanation: 'n is amount in moles, m is mass in grams, M is molar mass in g/mol.',
      },
      {
        name: 'Molar Concentration',
        expression: 'C = \\frac{n}{V}',
        explanation: 'C is molar concentration in mol/L, V is solution volume in liters.',
      },
      {
        name: 'Stoichiometric Ratio',
        expression: '\\frac{n_A}{a} = \\frac{n_B}{b}',
        explanation: 'For reaction aA + bB -> products, reactants are consumed in ratio a:b.',
      },
    ],
    examples: [
      {
        problem: 'Balance the reaction: H_2 + O_2 -> H_2O, and find how many moles of H_2O are produced from 4 moles of H_2.',
        solution: '2H_2 + O_2 \\to 2H_2O; 4 \\text{ mol } H_2O',
        steps: [
          'Count atoms: Left has 2 H and 2 O; Right has 2 H and 1 O.',
          'Multiply H_2O by 2 to balance O: H_2 + O_2 -> 2H_2O.',
          'Now right has 4 H; multiply H_2 by 2: 2H_2 + O_2 -> 2H_2O.',
          'By stoichiometric ratio 2:2 (1:1), 4 mol H_2 yields 4 mol H_2O.',
        ],
      },
    ],
    common_misconceptions: [
      'Altering chemical subscripts instead of coefficients when balancing equations.',
      'Assuming mass ratios equal mole ratios directly without using molar masses.',
    ],
    khmer_terms: {
      stoichiometry: 'ស្តូគ្យូម៉េទ្រី',
      'chemical equation': 'សមីការគីមី',
      mole: 'ម៉ូល',
      'molar mass': 'ម៉ាសម៉ូល',
      'limiting reactant': 'អង្គធាតុកំណត់',
    },
    prerequisites: ['Periodic table and atomic masses', 'Chemical symbols and formulas'],
    starter_problem: '2H_2 + O_2 \\to 2H_2O',
  },
  'math.g12.lesson4.complex-numbers': {
    lesson_id: 'math.g12.lesson4.complex-numbers',
    title: 'ចំនួនកុំផ្លិច (Complex Numbers)',
    topic_id: 'complex-numbers-g12',
    topic_name: 'Complex Numbers',
    topic_khmer_name: 'ចំនួនកុំផ្លិច',
    subject_id: 'math',
    subject_name: 'Mathematics',
    grade_number: 12,
    grade_name: 'Grade 12',
    learning_objectives: [
      'Write complex numbers in algebraic (a + bi), trigonometric, and exponential forms',
      'Compute modulus |z| and argument arg(z)',
      'Apply De Moivre’s theorem to compute powers and roots of complex numbers',
    ],
    concepts: [
      {
        title: 'Algebraic Form & Modulus (ទម្រង់ពីជគណិត និងម៉ូឌុល)',
        summary: 'z = a + bi where a, b in R and i^2 = -1.',
        body: 'The real part is Re(z) = a and imaginary part is Im(z) = b. The modulus is |z| = sqrt(a^2 + b^2).',
      },
      {
        title: 'Trigonometric & Exponential Form (ទម្រង់ត្រីកោណមាត្រ)',
        summary: 'z = r(cos theta + i sin theta) = r e^(i theta).',
        body: 'r = |z| is modulus and theta = arg(z) is argument satisfying cos theta = a/r and sin theta = b/r.',
      },
    ],
    formulas: [
      {
        name: 'Modulus',
        expression: '|z| = \\sqrt{a^2 + b^2}',
        explanation: 'Magnitude of complex number z = a + bi.',
      },
      {
        name: 'Argument',
        expression: '\\tan \\theta = \\frac{b}{a} \\quad (a \\neq 0)',
        explanation: 'Angle theta in the complex plane, adjusted for quadrant.',
      },
      {
        name: "De Moivre's Theorem",
        expression: '[r(\\cos\\theta + i\\sin\\theta)]^n = r^n(\\cos n\\theta + i\\sin n\\theta)',
        explanation: 'Computes integer powers of complex numbers in polar form.',
      },
    ],
    examples: [
      {
        problem: 'For z = 1 + i\\sqrt{3}, find |z|, \\arg(z), and z^6.',
        solution: '|z| = 2, \\arg(z) = \\frac{\\pi}{3}, z^6 = 64',
        steps: [
          'Modulus: |z| = sqrt(1^2 + (sqrt(3))^2) = sqrt(1 + 3) = 2.',
          'Argument: cos theta = 1/2, sin theta = sqrt(3)/2, so theta = pi/3.',
          'Trigonometric form: z = 2(cos(pi/3) + i sin(pi/3)).',
          'De Moivre: z^6 = 2^6(cos(6 * pi/3) + i sin(6 * pi/3)) = 64(cos 2pi + i sin 2pi) = 64(1 + 0) = 64.',
        ],
      },
    ],
    common_misconceptions: [
      'Applying sqrt(a)*sqrt(b) = sqrt(ab) when both a and b are negative.',
      'Forgetting to adjust argument theta based on the quadrant of (a, b).',
    ],
    khmer_terms: {
      'complex number': 'ចំនួនកុំផ្លិច',
      modulus: 'ម៉ូឌុល',
      argument: 'អាគុយម៉ង់',
      'real part': 'ផ្នែកពិត',
      'imaginary part': 'ផ្នែកនិម្មិត',
    },
    prerequisites: ['Trigonometric circle and angles', 'Quadratic formula with negative discriminant'],
    starter_problem: 'z = 1 + i\\sqrt{3}',
  },
};

function resolveFallbackLessonContent(cleanId: string): LessonDetailedContent {
  const lower = cleanId.toLowerCase();

  // 1. Direct match in preBundledLessonContentMap
  if (preBundledLessonContentMap[cleanId]) {
    return { ...preBundledLessonContentMap[cleanId], lesson_id: cleanId };
  }

  // 2. Alias match for core topics
  if (lower.includes('limit')) {
    return { ...preBundledLessonContentMap['math.g12.lesson1.limits-of-functions'], lesson_id: cleanId };
  }
  if (lower.includes('kinematic')) {
    return { ...preBundledLessonContentMap['physics.g12.lesson1.kinematics'], lesson_id: cleanId };
  }
  if (lower.includes('stoichio') || lower.includes('chemical-equation') || lower.includes('reaction')) {
    return { ...preBundledLessonContentMap['chemistry.g12.lesson1.stoichiometry'], lesson_id: cleanId };
  }
  if (lower.includes('complex')) {
    return { ...preBundledLessonContentMap['math.g12.lesson4.complex-numbers'], lesson_id: cleanId };
  }

  // 3. Try loading from local curriculum jsonl if available
  const fromDisk = tryLoadCurriculumFromDisk(cleanId);
  if (fromDisk) return fromDisk;

  // 4. Match against defaultGrade12PublishedLessons
  const matchedLesson = defaultGrade12PublishedLessons.find(
    (l) => l.lesson_id === cleanId || l.topic_id === cleanId || lower.includes(l.topic_id)
  );
  if (matchedLesson) {
    const starter = matchedLesson.starter_problem ?? defaultStarterFor(matchedLesson.topic_id);
    return {
      lesson_id: cleanId,
      title: matchedLesson.title,
      topic_id: matchedLesson.topic_id,
      topic_name: matchedLesson.topic_name,
      topic_khmer_name: matchedLesson.topic_khmer_name,
      subject_id: matchedLesson.subject_id,
      subject_name: matchedLesson.subject_name,
      grade_number: matchedLesson.grade_number,
      grade_name: matchedLesson.grade_name,
      learning_objectives: matchedLesson.learning_objectives,
      concepts: [
        {
          title: matchedLesson.title,
          summary: matchedLesson.description || matchedLesson.title,
          body: matchedLesson.description || matchedLesson.title,
        },
      ],
      formulas: starter
        ? [
            {
              name: `${matchedLesson.topic_name} Formula`,
              expression: starter,
              explanation: `Governing formula for ${matchedLesson.topic_name}`,
            },
          ]
        : [],
      examples: starter
        ? [
            {
              problem: `Evaluate or solve: ${starter}`,
              solution: 'Worked solution provided interactively on the whiteboard',
              steps: [
                `Identify given variables and expression: ${starter}`,
                `Apply principles of ${matchedLesson.topic_name}`,
                'Evaluate the step-by-step result',
              ],
            },
          ]
        : [],
      common_misconceptions: [],
      khmer_terms: matchedLesson.topic_khmer_name ? { [matchedLesson.topic_name]: matchedLesson.topic_khmer_name } : {},
      starter_problem: starter,
    };
  }

  // 5. General fallback so it NEVER fails with 500
  return {
    ...preBundledLessonContentMap['math.g12.lesson1.limits-of-functions'],
    lesson_id: cleanId,
  };
}

export async function getLessonDetailedContent(lessonId: string): Promise<LessonDetailedContent> {
  const cleanId = (lessonId || '').trim();
  const now = Date.now();
  if (process.env.NODE_ENV !== 'test') {
    const cached = detailedContentCache.get(cleanId);
    if (cached && now < cached.expiresAt) {
      return cached.data;
    }
  }

  try {
    const db = getFirestore();
    let contentData: FirestoreRow | null = null;

    // 1. Try finding directly by doc ID
    const byIdSnap = await db.collection('admin_curriculum_content').doc(cleanId).get();
    if (byIdSnap.exists) {
      contentData = byIdSnap.data() as FirestoreRow;
    }

    // 2. If not found by doc ID, query by content_id == cleanId
    if (!contentData) {
      const snap = await db
        .collection('admin_curriculum_content')
        .where('content_id', '==', cleanId)
        .limit(1)
        .get();
      if (!snap.empty) {
        contentData = snap.docs[0].data() as FirestoreRow;
      }
    }

    // 3. If still not found, query by topic_id == cleanId
    if (!contentData) {
      const snap = await db
        .collection('admin_curriculum_content')
        .where('topic_id', '==', cleanId)
        .where('is_lesson_entry', '==', true)
        .limit(1)
        .get();
      if (!snap.empty) {
        contentData = snap.docs[0].data() as FirestoreRow;
      } else {
        const snapAny = await db
          .collection('admin_curriculum_content')
          .where('topic_id', '==', cleanId)
          .limit(1)
          .get();
        if (!snapAny.empty) {
          contentData = snapAny.docs[0].data() as FirestoreRow;
        }
      }
    }

    if (contentData) {
      let siblingDocs: FirestoreRow[] = [];
      const chunkId = text(contentData.chunk_id);
      const topicId = text(contentData.topic_id);
      if (chunkId) {
        const siblingsSnap = await db
          .collection('admin_curriculum_content')
          .where('chunk_id', '==', chunkId)
          .get();
        siblingDocs = siblingsSnap.docs.map((d) => d.data() as FirestoreRow);
      } else if (topicId) {
        const siblingsSnap = await db
          .collection('admin_curriculum_content')
          .where('topic_id', '==', topicId)
          .get();
        siblingDocs = siblingsSnap.docs.map((d) => d.data() as FirestoreRow);
      }

      const result = parseLessonDetailedContent(cleanId, contentData, siblingDocs);
      if (process.env.NODE_ENV !== 'test') {
        detailedContentCache.set(cleanId, {
          data: result,
          expiresAt: now + DETAILED_CONTENT_CACHE_TTL_MS,
        });
      }
      return result;
    }
  } catch (err) {
    console.warn(
      `[getLessonDetailedContent] Firestore query failed for ${cleanId}; using fallback:`,
      (err as Error)?.message || err
    );
  }

  const fallback = resolveFallbackLessonContent(cleanId);
  if (process.env.NODE_ENV !== 'test') {
    detailedContentCache.set(cleanId, {
      data: fallback,
      expiresAt: now + DETAILED_CONTENT_CACHE_TTL_MS,
    });
  }
  return fallback;
}
