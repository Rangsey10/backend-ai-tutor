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
      const isAvailable = VERIFIED_SOLVER_TOPICS.has(topicId.toLowerCase()) || Boolean(content.is_available);
      const starterProblem = text(content.starter_problem) || (isAvailable ? defaultStarterFor(topicId) : null);
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
        is_available: isAvailable,
        starter_problem: starterProblem,
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

  if (rows.length === 0) {
    const qSearch = (query.search || '').trim().toLowerCase();
    return defaultGrade12PublishedLessons
      .filter((lesson) => {
        if (query.grade_level_id && lesson.grade_level_id !== query.grade_level_id) return false;
        if (query.subject_id && lesson.subject_id !== query.subject_id) return false;
        if (query.topic_id && lesson.topic_id !== query.topic_id) return false;
        if (qSearch) {
          const searchable = `${lesson.title} ${lesson.topic_name} ${lesson.topic_khmer_name ?? ''} ${lesson.subject_name} ${lesson.description ?? ''}`.toLowerCase();
          if (!searchable.includes(qSearch)) return false;
        }
        return true;
      })
      .sort((a, b) => a.grade_number - b.grade_number || a.subject_name.localeCompare(b.subject_name) || a.topic_name.localeCompare(b.topic_name) || a.title.localeCompare(b.title));
  }

  return rows.sort((a, b) => a.grade_number - b.grade_number || a.subject_name.localeCompare(b.subject_name) || a.topic_name.localeCompare(b.topic_name) || a.title.localeCompare(b.title));
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
