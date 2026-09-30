import { getFirestore } from '../config/firebase';

export type CurriculumTopicCard = {
  lesson_id: string;
  curriculum_version_id: string;
  grade_level_id: string;
  grade: number;
  subject_id: string;
  subject_name: string;
  topic_id: string;
  topic_name: string;
  title: string;
  english_title: string;
  description: string;
  khmer_description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
  problem_count: number;
  is_available: boolean;
  starter_problem: string;
};

export type ListCurriculumCatalogQuery = {
  grade?: number | string;
  subject_id?: string;
  topic_id?: string;
  search?: string;
};

export const FALLBACK_STEM_CATALOG: CurriculumTopicCard[] = [
  // ── Grade 12 ─────────────────────────────────────────────────────────────
  // Mathematics
  {
    lesson_id: 'math.g12.limits',
    curriculum_version_id: 'g12-stem-v1',
    grade_level_id: 'grade-12',
    grade: 12,
    subject_id: 'math',
    subject_name: 'Mathematics',
    topic_id: 'math-g12-limits-of-functions',
    topic_name: 'Limits of Functions',
    title: 'លីមីតនៃអនុគមន៍',
    english_title: 'Limits of Functions',
    description: 'Calculate finite limits, indeterminate forms 0/0, and rational function limits.',
    khmer_description: 'គណនាលីមីតកំណត់ រាងមិនកំណត់ 0/0 និងលីមីតនៃអនុគមន៍សនិទាន។',
    difficulty: 'beginner',
    tags: ['Limits', 'Rational Functions', '0/0 Indeterminate'],
    problem_count: 6,
    is_available: true,
    starter_problem: '\\lim_{x \\to 3} \\frac{x^2 - 9}{x - 3}',
  },
  {
    lesson_id: 'math.g12.derivatives',
    curriculum_version_id: 'g12-stem-v1',
    grade_level_id: 'grade-12',
    grade: 12,
    subject_id: 'math',
    subject_name: 'Mathematics',
    topic_id: 'math-g12-derivatives',
    topic_name: 'Derivatives of Functions',
    title: 'ដេរីវេនៃអនុគមន៍',
    english_title: 'Derivatives of Functions',
    description: 'Evaluate derivatives, instantaneous rates of change, and tangent lines.',
    khmer_description: 'គណនាដេរីវេ អត្រាបម្រែបម្រួល និងសមីការបន្ទាត់ប៉ះ។',
    difficulty: 'intermediate',
    tags: ['Derivatives', 'Power Rule', 'Chain Rule', 'Tangents'],
    problem_count: 5,
    is_available: true,
    starter_problem: 'f(x) = x^3 - 3x^2 + 2, \\quad \\text{find } f^\\prime(2)',
  },
  {
    lesson_id: 'math.g12.integrals',
    curriculum_version_id: 'g12-stem-v1',
    grade_level_id: 'grade-12',
    grade: 12,
    subject_id: 'math',
    subject_name: 'Mathematics',
    topic_id: 'math-g12-integrals',
    topic_name: 'Integrals & Area Calculation',
    title: 'អាំងតេក្រាល និងផ្ទៃក្រឡា',
    english_title: 'Integrals & Area Calculation',
    description: 'Evaluate definite and indefinite integrals and find the area under curves.',
    khmer_description: 'គណនាអាំងតេក្រាលមិនកំណត់ និងអាំងតេក្រាលកំណត់សម្រាប់រកផ្ទៃក្រឡា។',
    difficulty: 'advanced',
    tags: ['Definite Integrals', 'Substitution', 'Area Under Curve'],
    problem_count: 4,
    is_available: true,
    starter_problem: '\\int_0^2 (3x^2 + 2x) \\, dx',
  },
  {
    lesson_id: 'math.g12.complex_numbers',
    curriculum_version_id: 'g12-stem-v1',
    grade_level_id: 'grade-12',
    grade: 12,
    subject_id: 'math',
    subject_name: 'Mathematics',
    topic_id: 'topic-grade-12-mathematics-complex-numbers',
    topic_name: 'Complex Numbers',
    title: 'ចំនួនកុំផ្លិច',
    english_title: 'Complex Numbers',
    description: 'Master complex numbers: algebraic, trigonometric, and Euler exponential forms, modulus, argument, and De Moivre formula.',
    khmer_description: 'សិក្សាចំនួនកុំផ្លិចក្នុងទម្រង់ពីជគណិត ទម្រង់ត្រីកោណមាត្រ និងទម្រង់និទស្សន្ត ម៉ូឌុល និងអាគុយម៉ង់ រូបមន្តដឺម័រ។',
    difficulty: 'intermediate',
    tags: ['Complex Numbers', 'De Moivre', 'Modulus', 'Argument', 'Trigonometric Form'],
    problem_count: 4,
    is_available: true,
    starter_problem: 'z = 1 + i\\sqrt{3}, \\quad \\text{find } |z|, \\arg(z), \\text{ and } z^6',
  },
  {
    lesson_id: 'math.g12.differential_equations',
    curriculum_version_id: 'g12-stem-v1',
    grade_level_id: 'grade-12',
    grade: 12,
    subject_id: 'math',
    subject_name: 'Mathematics',
    topic_id: 'topic-grade-12-mathematics-differential-equations',
    topic_name: 'Differential Equations',
    title: 'សមីការឌីផេរ៉ង់ស្យែល',
    english_title: 'Differential Equations',
    description: 'Solve first-order separable and linear differential equations, and second-order linear homogeneous equations with constant coefficients.',
    khmer_description: 'ដោះស្រាយសមីការឌីផេរ៉ង់ស្យែលលីនេអ៊ែរលំដាប់ទី១ និងលំដាប់ទី២មេគុណថេរ ព្រមទាំងរកចម្លើយទូទៅ និងចម្លើយពិសេស។',
    difficulty: 'advanced',
    tags: ['Differential Equations', 'Characteristic Equation', 'First Order', 'Second Order'],
    problem_count: 4,
    is_available: true,
    starter_problem: 'y^{\\prime\\prime} - 5y^\\prime + 6y = 0, \\quad y(0) = 1, \\, y^\\prime(0) = 0',
  },
  {
    lesson_id: 'math.g12.function_analysis',
    curriculum_version_id: 'g12-stem-v1',
    grade_level_id: 'grade-12',
    grade: 12,
    subject_id: 'math',
    subject_name: 'Mathematics',
    topic_id: 'topic-grade-12-mathematics-function-analysis-and-curve-sketching',
    topic_name: 'Function Analysis and Curve Sketching',
    title: 'ការសិក្សាអនុគមន៍ និងសង់ក្រាប',
    english_title: 'Function Analysis and Curve Sketching',
    description: 'Perform complete function analysis: domain, derivatives, critical points, variation table, asymptotes, inflection points, and curve sketching.',
    khmer_description: 'សិក្សាអថេរភាព និងសង់ក្រាបនៃអនុគមន៍ រកដែនកំណត់ ដេរីវេ តារាងអថេរភាព ចំណុចរបត់ និងអាស៊ីមតូត។',
    difficulty: 'advanced',
    tags: ['Function Analysis', 'Variation Table', 'Asymptotes', 'Inflection Points', 'Curve Sketching'],
    problem_count: 4,
    is_available: true,
    starter_problem: 'f(x) = \\frac{2x - 1}{x + 1}, \\quad \\text{study the variations and sketch } (C)',
  },
  {
    lesson_id: 'math.g12.probability',
    curriculum_version_id: 'g12-stem-v1',
    grade_level_id: 'grade-12',
    grade: 12,
    subject_id: 'math',
    subject_name: 'Mathematics',
    topic_id: 'topic-grade-12-mathematics-probability-and-combinatorics',
    topic_name: 'Probability and Combinatorics',
    title: 'ប្រូបាប៊ីលីតេ និងបន្សំ',
    english_title: 'Probability and Combinatorics',
    description: 'Calculate permutations, combinations, conditional probability, independent events, and binomial random variables.',
    khmer_description: 'គណនាចម្លាស់ អារ៉ង់ស្យម៉ង់ បន្សំ ប្រូបាបមានលក្ខខណ្ឌ ព្រឹត្តិការណ៍មិនទាក់ទងគ្នា និងអថេរចៃដន្យទ្វេធា។',
    difficulty: 'intermediate',
    tags: ['Probability', 'Combinatorics', 'Combinations', 'Conditional Probability', 'Binomial'],
    problem_count: 4,
    is_available: true,
    starter_problem: 'A \\text{ box has } 5 \\text{ red and } 3 \\text{ blue balls. Draw } 2 \\text{ at random. Find } P(\\text{both red}).',
  },
  {
    lesson_id: 'math.g12.vectors_conics',
    curriculum_version_id: 'g12-stem-v1',
    grade_level_id: 'grade-12',
    grade: 12,
    subject_id: 'math',
    subject_name: 'Mathematics',
    topic_id: 'topic-grade-12-mathematics-vectors-in-3d-space-and-conic-sections',
    topic_name: 'Vectors in 3D Space and Conic Sections',
    title: 'វ៉ិចទ័រក្នុងលំហ និងកោនិក',
    english_title: 'Vectors in 3D Space and Conic Sections',
    description: 'Analyze 3D vectors, dot and cross products, planes, spheres, and conic sections: parabola, ellipse, and hyperbola.',
    khmer_description: 'សិក្សាផលគុណស្កាលែ និងផលគុណវ៉ិចទ័រក្នុងលំហ សមីការប្លង់ សមីការស្វ៊ែរ ព្រមទាំងកោនិក (ប៉ារ៉ាបូល អេលីប និងអ៊ីពែបូល)។',
    difficulty: 'advanced',
    tags: ['3D Vectors', 'Planes', 'Conic Sections', 'Parabola', 'Ellipse', 'Hyperbola'],
    problem_count: 4,
    is_available: true,
    starter_problem: '\\text{Find the plane through } A(1, 2, -1) \\text{ with normal vector } \\vec{n} = (2, -1, 3)',
  },

  // Physics
  {
    lesson_id: 'physics.g12.kinematics',
    curriculum_version_id: 'g12-stem-v1',
    grade_level_id: 'grade-12',
    grade: 12,
    subject_id: 'physics',
    subject_name: 'Physics',
    topic_id: 'physics-g12-kinematics',
    topic_name: '1D Kinematics',
    title: 'ស៊ីនេម៉ាទិចនៃចលនាត្រង់',
    english_title: '1D Kinematics',
    description: 'Analyze constant acceleration equations: displacement, velocity, and time.',
    khmer_description: 'វិភាគចលនាត្រង់ប្រែប្រួលស្មើ៖ ចម្ងាយចរ ល្បឿន និងរយៈពេល។',
    difficulty: 'beginner',
    tags: ['Kinematics', 'Acceleration', 'Velocity', 'Free Fall'],
    problem_count: 5,
    is_available: true,
    starter_problem: 'A car accelerates from rest at 2 m/s^2 for 5 seconds. Find its final velocity.',
  },
  {
    lesson_id: 'physics.g12.optics',
    curriculum_version_id: 'g12-stem-v1',
    grade_level_id: 'grade-12',
    grade: 12,
    subject_id: 'physics',
    subject_name: 'Physics',
    topic_id: 'physics-g12-optics',
    topic_name: 'Optics & Snell\'s Law',
    title: 'អុបទិច និងច្បាប់ដេកាត',
    english_title: 'Optics & Snell\'s Law',
    description: 'Refraction of light, index of refraction, and angle calculations using Snell\'s Law.',
    khmer_description: 'ចំណាំងបែរនៃពន្លឺ សន្ទស្សន៍ចំណាំងបែរ និងការគណនាមុំតាមច្បាប់ Snell-Descartes។',
    difficulty: 'intermediate',
    tags: ['Optics', 'Snell\'s Law', 'Refraction', 'Index of Refraction'],
    problem_count: 4,
    is_available: true,
    starter_problem: 'A ray enters glass (n=1.5) from air at 30 degrees. Find the angle of refraction.',
  },
  {
    lesson_id: 'physics.g12.thermodynamics',
    curriculum_version_id: 'g12-stem-v1',
    grade_level_id: 'grade-12',
    grade: 12,
    subject_id: 'physics',
    subject_name: 'Physics',
    topic_id: 'physics-g12-thermodynamics',
    topic_name: 'Thermodynamics & Ideal Gas Law',
    title: 'ទែរម៉ូឌីណាមិច និងឧស្ម័នបរិសុទ្ធ',
    english_title: 'Thermodynamics & Ideal Gas Law',
    description: 'State equations for ideal gases (PV = nRT), heat, work, and internal energy.',
    khmer_description: 'សមីការភាពនៃឧស្ម័នបរិសុទ្ធ PV = nRT បរិមាណកម្ដៅ និងកម្មន្ត។',
    difficulty: 'advanced',
    tags: ['Thermodynamics', 'Ideal Gas Law', 'Pressure', 'Temperature'],
    problem_count: 4,
    is_available: true,
    starter_problem: 'A 2.0 L container holds 0.5 mol of gas at 300 K. What is the pressure?',
  },

  // Chemistry
  {
    lesson_id: 'chem.g12.stoichiometry',
    curriculum_version_id: 'g12-stem-v1',
    grade_level_id: 'grade-12',
    grade: 12,
    subject_id: 'chemistry',
    subject_name: 'Chemistry',
    topic_id: 'chem-g12-stoichiometry',
    topic_name: 'Stoichiometry & Reaction Tables',
    title: 'ស្តូគ្យូមេទ្រី និងតារាងប្រតិកម្ម',
    english_title: 'Stoichiometry & Reaction Tables',
    description: 'Balance chemical equations, calculate mole ratios, and construct ICE reaction tables.',
    khmer_description: 'ថ្លឹងសមីការគីមី គណនាផលធៀបម៉ូល និងតារាងតុល្យភាពប្រតិកម្ម ICE។',
    difficulty: 'beginner',
    tags: ['Stoichiometry', 'Mole Ratios', 'ICE Table', 'Limiting Reagent'],
    problem_count: 6,
    is_available: true,
    starter_problem: '2H_2 + O_2 \\to 2H_2O, \\quad \\text{find moles of water from 4 mol } H_2',
  },
  {
    lesson_id: 'chem.g12.acids-bases',
    curriculum_version_id: 'g12-stem-v1',
    grade_level_id: 'grade-12',
    grade: 12,
    subject_id: 'chemistry',
    subject_name: 'Chemistry',
    topic_id: 'chem-g12-acids-bases',
    topic_name: 'Acids & Bases (Titration & pH)',
    title: 'អាស៊ីត និងបាស (អត្រាកម្ម និង pH)',
    english_title: 'Acids & Bases (Titration & pH)',
    description: 'Calculate pH, hydrogen ion concentration, and neutralization volumes in titrations.',
    khmer_description: 'គណនា pH កំហាប់អ៊ីយ៉ុងអ៊ីដ្រូញ៉ូម និងមាឌបន្សាបក្នុងការធ្វើអត្រាកម្ម។',
    difficulty: 'intermediate',
    tags: ['Acids & Bases', 'pH', 'Titration', 'Neutralization'],
    problem_count: 5,
    is_available: true,
    starter_problem: '\\text{What volume of 0.1 M NaOH neutralizes 25 mL of 0.2 M HCl?}',
  },
  {
    lesson_id: 'chem.g12.organic',
    curriculum_version_id: 'g12-stem-v1',
    grade_level_id: 'grade-12',
    grade: 12,
    subject_id: 'chemistry',
    subject_name: 'Chemistry',
    topic_id: 'chem-g12-organic',
    topic_name: 'Organic Chemistry & Functional Groups',
    title: 'គីមីសរីរាង្គ និងក្រុមនាទី',
    english_title: 'Organic Chemistry & Functional Groups',
    description: 'Nomenclature of hydrocarbons, functional groups, alcohols, and carboxylic acids.',
    khmer_description: 'នាមវលីនៃអ៊ីដ្រូកាបួ ក្រុមនាទី អាល់កុល និងអាស៊ីតកាបុកស៊ីលិក។',
    difficulty: 'advanced',
    tags: ['Organic Chemistry', 'Functional Groups', 'Alkanes', 'Alcohols'],
    problem_count: 4,
    is_available: true,
    starter_problem: '\\text{Name the IUPAC compound: } CH_3-CH_2-CH(OH)-CH_3',
  },

  // ── Grade 11 ─────────────────────────────────────────────────────────────
  {
    lesson_id: 'math.g11.trig',
    curriculum_version_id: 'g11-stem-v1',
    grade_level_id: 'grade-11',
    grade: 11,
    subject_id: 'math',
    subject_name: 'Mathematics',
    topic_id: 'math-g11-trigonometry',
    topic_name: 'Trigonometry & Law of Cosines',
    title: 'ត្រីកោណមាត្រ និងទ្រឹស្តីបទកូស៊ីនុស',
    english_title: 'Trigonometry & Law of Cosines',
    description: 'Evaluate angles and side lengths using the Law of Sines and Law of Cosines.',
    khmer_description: 'គណនាមុំ និងប្រវែងជ្រុងតាមទ្រឹស្តីបទស៊ីនុស និងកូស៊ីនុស។',
    difficulty: 'intermediate',
    tags: ['Trigonometry', 'Law of Cosines', 'Law of Sines'],
    problem_count: 5,
    is_available: true,
    starter_problem: 'In triangle ABC, a=5, b=7, and angle C=60 degrees. Find side c.',
  },
  {
    lesson_id: 'physics.g11.forces',
    curriculum_version_id: 'g11-stem-v1',
    grade_level_id: 'grade-11',
    grade: 11,
    subject_id: 'physics',
    subject_name: 'Physics',
    topic_id: 'physics-g11-newton-laws',
    topic_name: 'Newton\'s Laws of Motion',
    title: 'ច្បាប់ចលនារបស់ញូតុន',
    english_title: 'Newton\'s Laws of Motion',
    description: 'Analyze net force, mass, and acceleration with free body diagrams.',
    khmer_description: 'វិភាគកម្លាំងផ្គួប ម៉ាស និងសំទុះតាមដ្យាក្រាមកម្លាំងសេរី។',
    difficulty: 'intermediate',
    tags: ['Newton\'s Laws', 'Forces', 'F=ma', 'Friction'],
    problem_count: 5,
    is_available: true,
    starter_problem: 'A 10 kg block is pushed with a 50 N horizontal force on a frictionless surface. Find acceleration.',
  },
  {
    lesson_id: 'chem.g11.solutions',
    curriculum_version_id: 'g11-stem-v1',
    grade_level_id: 'grade-11',
    grade: 11,
    subject_id: 'chemistry',
    subject_name: 'Chemistry',
    topic_id: 'chem-g11-solutions-molarity',
    topic_name: 'Solutions & Molarity',
    title: 'សូលុយស្យុង និងកំហាប់ម៉ូល',
    english_title: 'Solutions & Molarity',
    description: 'Calculate molarity, dilution equations (C1V1 = C2V2), and solute mass.',
    khmer_description: 'គណនាកំហាប់ម៉ូល C = n/V និងរូបមន្តពង្រាវ C1V1 = C2V2។',
    difficulty: 'intermediate',
    tags: ['Solutions', 'Molarity', 'Dilution', 'Concentration'],
    problem_count: 4,
    is_available: true,
    starter_problem: 'How many grams of NaCl are needed to prepare 500 mL of 0.2 M solution?',
  },

  // ── Grade 10 ─────────────────────────────────────────────────────────────
  {
    lesson_id: 'math.g10.linear',
    curriculum_version_id: 'g10-stem-v1',
    grade_level_id: 'grade-10',
    grade: 10,
    subject_id: 'math',
    subject_name: 'Mathematics',
    topic_id: 'math-g10-linear-equations',
    topic_name: 'Linear Equations & Systems',
    title: 'សមីការ និងប្រព័ន្ធសមីការលីនេអ៊ែរ',
    english_title: 'Linear Equations & Systems',
    description: 'Solve one and two-variable linear equations by substitution and elimination.',
    khmer_description: 'ដោះស្រាយសមីការ និងប្រព័ន្ធសមីការដឺក្រេទីមួយមានពីរអញ្ញាត។',
    difficulty: 'beginner',
    tags: ['Linear Equations', 'Systems of Equations', 'Substitution'],
    problem_count: 5,
    is_available: true,
    starter_problem: 'Solve the system: 2x + y = 7 and x - y = 2.',
  },
  {
    lesson_id: 'physics.g10.motion',
    curriculum_version_id: 'g10-stem-v1',
    grade_level_id: 'grade-10',
    grade: 10,
    subject_id: 'physics',
    subject_name: 'Physics',
    topic_id: 'physics-g10-uniform-motion',
    topic_name: 'Uniform Rectilinear Motion',
    title: 'ចលនាត្រង់ស្មើ',
    english_title: 'Uniform Rectilinear Motion',
    description: 'Velocity, displacement, and time relationship for constant velocity motion.',
    khmer_description: 'ល្បឿន ចម្ងាយចរ និងរយៈពេលសម្រាប់ចលនាត្រង់ស្មើ v = d/t។',
    difficulty: 'beginner',
    tags: ['Uniform Motion', 'Velocity', 'Distance', 'Time'],
    problem_count: 4,
    is_available: true,
    starter_problem: 'A train moves at a constant speed of 72 km/h. How far does it travel in 30 minutes?',
  },
  {
    lesson_id: 'chem.g10.atomic',
    curriculum_version_id: 'g10-stem-v1',
    grade_level_id: 'grade-10',
    grade: 10,
    subject_id: 'chemistry',
    subject_name: 'Chemistry',
    topic_id: 'chem-g10-atomic-structure',
    topic_name: 'Atomic Structure & Periodic Table',
    title: 'ទម្រង់អាតូម និងតារាងខួប',
    english_title: 'Atomic Structure & Periodic Table',
    description: 'Protons, neutrons, electrons, electron configuration, and periodic trends.',
    khmer_description: 'ប្រូតុង ណឺត្រុង អេឡិចត្រុង និងការរៀបចំអេឡិចត្រុងក្នុងអាតូម។',
    difficulty: 'beginner',
    tags: ['Atomic Structure', 'Protons', 'Electrons', 'Periodic Table'],
    problem_count: 5,
    is_available: true,
    starter_problem: 'Write the electron configuration of Carbon (Z = 6) and identify valence electrons.',
  },
];

function normalizeCatalogSubjectId(rawSubjectId: string, rawSubjectName = ''): string {
  const combined = `${rawSubjectId} ${rawSubjectName}`.toLowerCase();
  if (combined.includes('chem')) return 'chemistry';
  if (combined.includes('phys')) return 'physics';
  if (combined.includes('math')) return 'math';
  return rawSubjectId.trim().toLowerCase();
}

let cachedDbTopics: CurriculumTopicCard[] | null = null;
let cachedDbTopicsExpiry = 0;
const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function clearCurriculumCatalogCache(): void {
  cachedDbTopics = null;
  cachedDbTopicsExpiry = 0;
}

export async function getCurriculumCatalog(
  query: ListCurriculumCatalogQuery = {}
): Promise<{ topics: CurriculumTopicCard[]; total: number }> {
  const now = Date.now();
  if (process.env.NODE_ENV !== 'test' && cachedDbTopics && now < cachedDbTopicsExpiry) {
    const filtered = filterTopics(cachedDbTopics, query);
    return { topics: filtered, total: filtered.length };
  }

  try {
    const db = getFirestore();
    const versionsSnap = await db.collection('curriculum_versions').where('status', '==', 'published').get();

    if (!versionsSnap.empty) {
      const dbTopics: CurriculumTopicCard[] = [];
      const seenTopicKeys = new Set<string>();

      for (const verDoc of versionsSnap.docs) {
        const ver = verDoc.data();
        const verId = String(ver.curriculum_version_id || verDoc.id);
        const gradeLevelId = String(ver.grade_level_id || 'grade-12');
        const subjectId = String(ver.subject_id || 'math');

        const [gradeDoc, subjDoc, contentsSnap] = await Promise.all([
          db.collection('grade_levels').doc(gradeLevelId).get(),
          db.collection('subjects').doc(subjectId).get(),
          db.collection('admin_curriculum_content').where('curriculum_version_id', '==', verId).get(),
        ]);

        const gradeNum = gradeDoc.exists ? Number(gradeDoc.data()?.grade_number || 12) : 12;
        const subjName = subjDoc.exists ? String(subjDoc.data()?.subject_name || subjectId) : subjectId;
        const canonicalSubject = normalizeCatalogSubjectId(subjectId, subjName);

        const docsByTopic = new Map<string, Array<Record<string, unknown>>>();
        for (const cDoc of contentsSnap.docs) {
          const content = { ...cDoc.data(), content_id: cDoc.data().content_id || cDoc.id } as Record<string, unknown>;
          const topicId = String(content.topic_id || cDoc.id);
          if (!docsByTopic.has(topicId)) docsByTopic.set(topicId, []);
          docsByTopic.get(topicId)!.push(content);
        }

        for (const [topicId, topicContents] of docsByTopic.entries()) {
          if (seenTopicKeys.has(`${gradeLevelId}:${canonicalSubject}:${topicId}`)) continue;
          seenTopicKeys.add(`${gradeLevelId}:${canonicalSubject}:${topicId}`);

          let topicData: Record<string, unknown> | undefined;
          try {
            const topicSnap = await db.collection('topics').doc(topicId).get();
            if (topicSnap.exists) topicData = topicSnap.data() as Record<string, unknown>;
          } catch {
            // Ignore if topics collection is not mocked in unit tests
          }

          const primaryContent =
            topicContents.find((c) => c.is_lesson_entry === true) ||
            topicContents.find((c) => c.kind === 'concept') ||
            topicContents[0];

          const topicName = String(
            topicData?.topic_name || primaryContent.topic_name || primaryContent.title || 'Curriculum Topic'
          );
          const khmerTitle = String(
            topicData?.khmer_name || primaryContent.title_km || primaryContent.topic_khmer || topicName
          );
          const description = String(
            topicData?.description || primaryContent.summary || primaryContent.description || primaryContent.body || ''
          );
          const khmerDescription = String(
            topicData?.khmer_description || primaryContent.khmer_description || khmerTitle || description
          );
          const rawDiff = String(
            topicData?.difficulty_level || primaryContent.difficulty || primaryContent.difficulty_level || 'intermediate'
          ).toLowerCase();
          const difficulty: 'beginner' | 'intermediate' | 'advanced' =
            rawDiff === 'advanced' ? 'advanced' : rawDiff === 'beginner' || rawDiff === 'easy' || rawDiff === 'basic' ? 'beginner' : 'intermediate';

          const tagSet = new Set<string>();
          for (const c of topicContents) {
            if (Array.isArray(c.tags)) {
              for (const t of c.tags) {
                if (typeof t === 'string' && t.trim()) tagSet.add(t.trim());
              }
            }
          }
          const tags = tagSet.size > 0 ? Array.from(tagSet).slice(0, 8) : [topicName, subjName];

          const exampleAndExerciseDocs = topicContents.filter((c) => c.kind === 'example' || c.kind === 'exercise').length;
          const problemCount =
            exampleAndExerciseDocs > 0
              ? exampleAndExerciseDocs
              : Number(primaryContent.problem_count || (Array.isArray(primaryContent.exercises) ? primaryContent.exercises.length : 4));

          const firstFormulaDoc = topicContents.find((c) => c.kind === 'formula' && typeof c.expression === 'string' && String(c.expression).trim());
          const starterProblem = String(
            topicData?.starter_problem ||
            primaryContent.starter_problem ||
            (firstFormulaDoc ? firstFormulaDoc.expression : '') ||
            (Array.isArray(primaryContent.formulas) ? primaryContent.formulas[0] : '') ||
            ''
          );

          dbTopics.push({
            lesson_id: String(primaryContent.chunk_id || primaryContent.content_id || topicId),
            curriculum_version_id: verId,
            grade_level_id: gradeLevelId,
            grade: gradeNum,
            subject_id: canonicalSubject,
            subject_name: subjName,
            topic_id: topicId,
            topic_name: topicName,
            title: khmerTitle,
            english_title: topicName,
            description,
            khmer_description: khmerDescription,
            difficulty,
            tags,
            problem_count: problemCount,
            is_available: primaryContent.is_available !== false,
            starter_problem: starterProblem,
          });
        }
      }

      if (dbTopics.length > 0) {
        cachedDbTopics = dbTopics;
        cachedDbTopicsExpiry = now + CATALOG_CACHE_TTL_MS;
        const filtered = filterTopics(dbTopics, query);
        return { topics: filtered, total: filtered.length };
      }
    }
  } catch (_err) {
    console.warn('[getCurriculumCatalog] Firestore query failed; using cached or fallback catalog:', (_err as Error)?.message || _err);
  }

  const base = cachedDbTopics && cachedDbTopics.length > 0 ? cachedDbTopics : FALLBACK_STEM_CATALOG;
  const filtered = filterTopics(base, query);
  return { topics: filtered, total: filtered.length };
}

function filterTopics(topics: CurriculumTopicCard[], query: ListCurriculumCatalogQuery): CurriculumTopicCard[] {
  let result = [...topics];

  if (query.grade !== undefined && query.grade !== null && String(query.grade).trim() !== '') {
    const targetGrade = Number(String(query.grade).replace(/[^0-9]/g, ''));
    if (!Number.isNaN(targetGrade) && targetGrade > 0) {
      result = result.filter((t) => t.grade === targetGrade);
    }
  }

  if (query.subject_id && query.subject_id.trim() !== '') {
    const rawTarget = query.subject_id.trim().toLowerCase();
    const canonicalTarget = normalizeCatalogSubjectId(rawTarget);
    result = result.filter(
      (t) =>
        t.subject_id.toLowerCase() === rawTarget ||
        normalizeCatalogSubjectId(t.subject_id, t.subject_name) === canonicalTarget
    );
  }

  if (query.topic_id && query.topic_id.trim() !== '') {
    const targetTopic = query.topic_id.trim().toLowerCase();
    result = result.filter((t) => t.topic_id.toLowerCase() === targetTopic);
  }

  if (query.search && query.search.trim() !== '') {
    const s = query.search.trim().toLowerCase();
    result = result.filter(
      (t) =>
        t.topic_name.toLowerCase().includes(s) ||
        t.title.toLowerCase().includes(s) ||
        t.english_title.toLowerCase().includes(s) ||
        t.description.toLowerCase().includes(s) ||
        t.khmer_description.toLowerCase().includes(s) ||
        t.tags.some((tag) => tag.toLowerCase().includes(s))
    );
  }

  return result;
}

