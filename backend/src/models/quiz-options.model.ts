export interface QuizOption {
  quiz_option_id: string;
  quiz_question_id: string;
  option_label: string;
  option_text: string;
  is_correct: boolean;
  display_order: number;
}

export interface QuizOptionCreateInput {
  quiz_question_id: string;
  option_label: string;
  option_text: string;
  is_correct: boolean;
  display_order?: number;
}

export interface QuizOptionUpdateInput {
  quiz_question_id?: string;
  option_label?: string;
  option_text?: string;
  is_correct?: boolean;
  display_order?: number;
}
