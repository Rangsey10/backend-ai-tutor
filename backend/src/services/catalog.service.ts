type CatalogGrade = {
  grade_level_id: string;
  grade_name: string;
  grade_number: number;
  description: string;
};

type CatalogSubject = {
  subject_id: string;
  subject_name: string;
  subject_code: string;
  icon_url: string | null;
  description: string;
  display_order: number;
};

type CatalogTopic = {
  topic_id: string;
  subject_id: string;
  grade_level_id: string;
  topic_name: string;
  topic_code: string;
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  learning_objective: string;
};

const grades: CatalogGrade[] = [
  {
    grade_level_id: 'grade-8',
    grade_name: 'Grade 8',
    grade_number: 8,
    description: 'Grade 8 Mathematics foundations supported by Visual Tutor',
  },
  {
    grade_level_id: 'grade-9',
    grade_name: 'Grade 9',
    grade_number: 9,
    description: 'Grade 9 equations and coordinate-graph foundations supported by Visual Tutor',
  },
  {
    grade_level_id: 'grade-10',
    grade_name: 'Grade 10',
    grade_number: 10,
    description: 'Grade 10 linear equations and basic quadratic graphs supported by Visual Tutor',
  },
  {
    grade_level_id: 'grade-12',
    grade_name: 'Grade 12',
    grade_number: 12,
    description: 'Grade 12 STEM (Mathematics, Physics, Chemistry) supported by Visual Tutor',
  },
];

const subjects: CatalogSubject[] = [
  {
    subject_id: 'math',
    subject_name: 'Mathematics',
    subject_code: 'MATH',
    icon_url: null,
    description: 'Math tutoring, visual problem solving, and worked solutions',
    display_order: 1,
  },
  {
    subject_id: 'physics',
    subject_name: 'Physics',
    subject_code: 'PHYS',
    icon_url: null,
    description: 'Physics tutoring, kinematics, dynamics, and visual simulations',
    display_order: 2,
  },
  {
    subject_id: 'chemistry',
    subject_name: 'Chemistry',
    subject_code: 'CHEM',
    icon_url: null,
    description: 'Chemistry tutoring, reaction balancing, stoichiometry, and molecular diagrams',
    display_order: 3,
  },
];

const topics: CatalogTopic[] = [
  {
    topic_id: 'integer-fraction-decimal-arithmetic-g8', subject_id: 'math', grade_level_id: 'grade-8',
    topic_name: 'Integer, Fraction & Decimal Arithmetic', topic_code: 'INTEGER_FRACTION_DECIMAL_ARITHMETIC',
    difficulty_level: 'beginner', learning_objective: 'Use signs, order of operations, fractions, and finite decimals safely.',
  },
  {
    topic_id: 'percentages-g8', subject_id: 'math', grade_level_id: 'grade-8',
    topic_name: 'Percentages', topic_code: 'PERCENTAGES', difficulty_level: 'beginner',
    learning_objective: 'Convert a percent and calculate a percentage of a numeric base.',
  },
  {
    topic_id: 'linear-equations-g8', subject_id: 'math', grade_level_id: 'grade-8',
    topic_name: 'Linear Equations', topic_code: 'LINEAR_EQUATIONS', difficulty_level: 'beginner',
    learning_objective: 'Solve one-variable linear equations while preserving equality.',
  },
  {
    topic_id: 'linear-equations-g9', subject_id: 'math', grade_level_id: 'grade-9',
    topic_name: 'Linear Equations', topic_code: 'LINEAR_EQUATIONS', difficulty_level: 'intermediate',
    learning_objective: 'Solve and check one-variable linear equations, including both-side terms.',
  },
  {
    topic_id: 'slope-from-two-points-g9', subject_id: 'math', grade_level_id: 'grade-9',
    topic_name: 'Slope from Two Points', topic_code: 'SLOPE_FROM_TWO_POINTS', difficulty_level: 'beginner',
    learning_objective: 'Calculate slope as vertical change divided by horizontal change.',
  },
  {
    topic_id: 'straight-line-graphs-g9', subject_id: 'math', grade_level_id: 'grade-9',
    topic_name: 'Straight-Line Graphs', topic_code: 'STRAIGHT_LINE_GRAPHS', difficulty_level: 'intermediate',
    learning_objective: 'Read and graph a numeric straight line from its equation or two points.',
  },
  {
    topic_id: 'linear-equations-g10',
    subject_id: 'math',
    grade_level_id: 'grade-10',
    topic_name: 'Linear Equations',
    topic_code: 'LINEAR_EQUATIONS',
    difficulty_level: 'beginner',
    learning_objective: 'Solve one-variable equations by preserving balance on both sides.',
  },
  {
    topic_id: 'basic-quadratic-graphs-g10', subject_id: 'math', grade_level_id: 'grade-10',
    topic_name: 'Basic Quadratic Graphs', topic_code: 'BASIC_QUADRATIC_GRAPHS', difficulty_level: 'intermediate',
    learning_objective: 'Graph a numeric parabola by finding its vertex and using symmetry.',
  },
  // Grade 12 Mathematics
  {
    topic_id: 'limits-of-functions-g12',
    subject_id: 'math',
    grade_level_id: 'grade-12',
    topic_name: 'Limits of Functions',
    topic_code: 'LIMITS_OF_FUNCTIONS',
    difficulty_level: 'advanced',
    learning_objective: 'Evaluate limits of a function at a point and at infinity, including indeterminate forms 0/0.',
  },
  {
    topic_id: 'derivatives-g12',
    subject_id: 'math',
    grade_level_id: 'grade-12',
    topic_name: 'Derivatives of Functions',
    topic_code: 'DERIVATIVES_OF_FUNCTIONS',
    difficulty_level: 'advanced',
    learning_objective: 'Calculate derivatives, instantaneous rates of change, and tangent line equations.',
  },
  {
    topic_id: 'integrals-g12',
    subject_id: 'math',
    grade_level_id: 'grade-12',
    topic_name: 'Integrals & Area Calculation',
    topic_code: 'INTEGRALS',
    difficulty_level: 'advanced',
    learning_objective: 'Evaluate indefinite and definite integrals to calculate area under curves.',
  },
  {
    topic_id: 'complex-numbers-g12',
    subject_id: 'math',
    grade_level_id: 'grade-12',
    topic_name: 'Complex Numbers',
    topic_code: 'COMPLEX_NUMBERS',
    difficulty_level: 'advanced',
    learning_objective: 'Represent and operate with complex numbers in algebraic and trigonometric forms.',
  },
  {
    topic_id: 'probability-g12',
    subject_id: 'math',
    grade_level_id: 'grade-12',
    topic_name: 'Probability & Combinatorics',
    topic_code: 'PROBABILITY',
    difficulty_level: 'intermediate',
    learning_objective: 'Compute combinations, permutations, and probability of discrete events.',
  },
  // Grade 12 Physics
  {
    topic_id: 'kinematics-g12',
    subject_id: 'physics',
    grade_level_id: 'grade-12',
    topic_name: 'Kinematics: Uniformly Accelerated Motion',
    topic_code: 'KINEMATICS',
    difficulty_level: 'intermediate',
    learning_objective: 'Solve 1D constant acceleration problems using standard kinematic equations with explicit units.',
  },
  {
    topic_id: 'dynamics-g12',
    subject_id: 'physics',
    grade_level_id: 'grade-12',
    topic_name: "Newton's Laws & Dynamics",
    topic_code: 'DYNAMICS',
    difficulty_level: 'intermediate',
    learning_objective: 'Construct free-body diagrams and calculate acceleration and resultant forces.',
  },
  {
    topic_id: 'work-energy-g12',
    subject_id: 'physics',
    grade_level_id: 'grade-12',
    topic_name: 'Work, Energy & Power',
    topic_code: 'WORK_ENERGY',
    difficulty_level: 'intermediate',
    learning_objective: 'Apply the work-energy theorem and mechanical energy conservation principles.',
  },
  {
    topic_id: 'waves-g12',
    subject_id: 'physics',
    grade_level_id: 'grade-12',
    topic_name: 'Mechanical Waves & Oscillations',
    topic_code: 'WAVES',
    difficulty_level: 'advanced',
    learning_objective: 'Relate wave frequency, period, wavelength, and propagation speed in material media.',
  },
  {
    topic_id: 'electromagnetism-g12',
    subject_id: 'physics',
    grade_level_id: 'grade-12',
    topic_name: 'Electromagnetism & Induction',
    topic_code: 'ELECTROMAGNETISM',
    difficulty_level: 'advanced',
    learning_objective: 'Calculate magnetic forces and induced electromotive force using Faraday and Lenz laws.',
  },
  // Grade 12 Chemistry
  {
    topic_id: 'stoichiometry-g12',
    subject_id: 'chemistry',
    grade_level_id: 'grade-12',
    topic_name: 'Stoichiometry & Reaction Balance',
    topic_code: 'STOICHIOMETRY',
    difficulty_level: 'intermediate',
    learning_objective: 'Balance chemical reactions and compute stoichiometric molar ratios and mass conservation.',
  },
  {
    topic_id: 'kinetics-g12',
    subject_id: 'chemistry',
    grade_level_id: 'grade-12',
    topic_name: 'Chemical Kinetics & Reaction Rates',
    topic_code: 'CHEMICAL_KINETICS',
    difficulty_level: 'advanced',
    learning_objective: 'Analyze rate laws, half-life, and factors affecting chemical reaction rates.',
  },
  {
    topic_id: 'equilibrium-g12',
    subject_id: 'chemistry',
    grade_level_id: 'grade-12',
    topic_name: 'Chemical Equilibrium & Le Chatelier',
    topic_code: 'EQUILIBRIUM',
    difficulty_level: 'advanced',
    learning_objective: 'Determine equilibrium constants and predict equilibrium shifts using Le Chatelier principle.',
  },
  {
    topic_id: 'acids-bases-g12',
    subject_id: 'chemistry',
    grade_level_id: 'grade-12',
    topic_name: 'Acids, Bases & pH Calculations',
    topic_code: 'ACIDS_BASES',
    difficulty_level: 'intermediate',
    learning_objective: 'Calculate pH, pOH, and hydronium/hydroxide concentrations in strong and weak acid/base solutions.',
  },
  {
    topic_id: 'organic-chemistry-g12',
    subject_id: 'chemistry',
    grade_level_id: 'grade-12',
    topic_name: 'Organic Chemistry: Functional Groups',
    topic_code: 'ORGANIC_CHEMISTRY',
    difficulty_level: 'advanced',
    learning_objective: 'Identify functional groups and apply IUPAC nomenclature for alcohols, aldehydes, and acids.',
  },
];

export type TopicQuery = {
  grade_level_id?: string;
  subject_id?: string;
};

export function listGrades(): CatalogGrade[] {
  return grades;
}

export function listSubjects(): CatalogSubject[] {
  return subjects;
}

export function listTopics(query: TopicQuery = {}): CatalogTopic[] {
  return topics.filter((topic) => {
    if (query.grade_level_id && topic.grade_level_id !== query.grade_level_id) {
      return false;
    }
    if (query.subject_id && topic.subject_id !== query.subject_id) {
      return false;
    }
    return true;
  });
}
