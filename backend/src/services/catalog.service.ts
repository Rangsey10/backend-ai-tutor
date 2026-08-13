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
    grade_level_id: 'grade-10',
    grade_name: 'Grade 10',
    grade_number: 10,
    description: 'Cambodian high school Grade 10 foundation topics',
  },
  {
    grade_level_id: 'grade-11',
    grade_name: 'Grade 11',
    grade_number: 11,
    description: 'Cambodian high school Grade 11 function topics',
  },
  {
    grade_level_id: 'grade-12',
    grade_name: 'Grade 12',
    grade_number: 12,
    description: 'Cambodian high school Grade 12 exam preparation topics',
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
    topic_id: 'linear-equations-g10',
    subject_id: 'math',
    grade_level_id: 'grade-10',
    topic_name: 'Linear Equations',
    topic_code: 'LINEAR_EQUATIONS',
    difficulty_level: 'beginner',
    learning_objective: 'Solve one-variable equations by preserving balance on both sides.',
  },
  {
    topic_id: 'coordinate-plane-g10',
    subject_id: 'math',
    grade_level_id: 'grade-10',
    topic_name: 'Coordinate Plane',
    topic_code: 'COORDINATE_PLANE',
    difficulty_level: 'beginner',
    learning_objective: 'Plot points and interpret x/y coordinates.',
  },
  {
    topic_id: 'slope-g10',
    subject_id: 'math',
    grade_level_id: 'grade-10',
    topic_name: 'Slope',
    topic_code: 'SLOPE',
    difficulty_level: 'beginner',
    learning_objective: 'Calculate slope from two points or a graph.',
  },
  {
    topic_id: 'equation-of-line-g10',
    subject_id: 'math',
    grade_level_id: 'grade-10',
    topic_name: 'Equation of a Line',
    topic_code: 'EQUATION_OF_LINE',
    difficulty_level: 'intermediate',
    learning_objective: 'Find line equations from points, slope, and intercept.',
  },
  {
    topic_id: 'functions-g11',
    subject_id: 'math',
    grade_level_id: 'grade-11',
    topic_name: 'Functions',
    topic_code: 'FUNCTIONS',
    difficulty_level: 'intermediate',
    learning_objective: 'Understand function notation, inputs, outputs, domain, and range.',
  },
  {
    topic_id: 'quadratic-functions-g11',
    subject_id: 'math',
    grade_level_id: 'grade-11',
    topic_name: 'Quadratic Functions',
    topic_code: 'QUADRATIC_FUNCTIONS',
    difficulty_level: 'intermediate',
    learning_objective: 'Analyze and solve basic quadratic expressions and graphs.',
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
