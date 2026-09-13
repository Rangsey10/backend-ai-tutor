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
    description: 'Grade 12 Mathematics (Limits of Functions) supported by Visual Tutor',
  },
];

const subjects: CatalogSubject[] = [
  {
    subject_id: 'math',
    subject_name: 'Mathematics',
    subject_code: 'MATH',
    icon_url: null,
    description: 'Math tutoring, visual problem solving, and quiz practice',
    display_order: 1,
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
    topic_id: 'limits-of-functions-g12',
    subject_id: 'math',
    grade_level_id: 'grade-12',
    topic_name: 'Limits of Functions',
    topic_code: 'LIMITS_OF_FUNCTIONS',
    difficulty_level: 'advanced',
    learning_objective: 'Evaluate limits of a function at a point and at infinity, including one-sided limits.',
  },
  {
    topic_id: 'basic-quadratic-graphs-g10', subject_id: 'math', grade_level_id: 'grade-10',
    topic_name: 'Basic Quadratic Graphs', topic_code: 'BASIC_QUADRATIC_GRAPHS', difficulty_level: 'intermediate',
    learning_objective: 'Graph a numeric parabola by finding its vertex and using symmetry.',
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
