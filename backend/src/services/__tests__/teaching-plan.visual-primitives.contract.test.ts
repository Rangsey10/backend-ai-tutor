import {
  TeachingPlanContractError,
  validatePublicTutorTurn,
  validateTeachingPlan,
} from '../teaching-plan.contract';

const plan = {
  schema_version: 1,
  representation: 'coordinate_graph',
  learning_objective: 'Read safe board primitives.',
  teaching_message: 'Use the visual representation step by step.',
  board_actions: [
    { id: 'box', type: 'draw_rectangle', sequence_index: 0, x: 10, y: 10, width: 100, height: 50 },
    { id: 'circle', type: 'circle', sequence_index: 1, x: 130, y: 10, width: 48, height: 48 },
    { id: 'arrow', type: 'draw_arrow', sequence_index: 2, x: 10, y: 72, width: 150, height: 30, label: 'Next step' },
    { id: 'axes', type: 'draw_axes', sequence_index: 3, x: 200, y: 10, width: 160, height: 110 },
    { id: 'point', type: 'draw_point', sequence_index: 4, x: 240, y: 52, width: 16, height: 16, label: 'A (2, 3)' },
    { id: 'line', type: 'show_number_line', sequence_index: 5, x: 10, y: 130, width: 350, height: 58, number_line: { min: -2, max: 2, step: 1, labels: ['-2', '0', '2'] } },
    { id: 'table', type: 'show_table', sequence_index: 6, x: 10, y: 202, width: 170, height: 90, table: { columns: ['x', 'y'], rows: [[0, 1], [1, 3]] } },
    { id: 'annotation', type: 'graph_annotation', sequence_index: 7, x: 195, y: 210, width: 165, height: 32, text: 'Point A is above the axis.' },
    { id: 'source-equation', type: 'write_equation', sequence_index: 8, x: 10, y: 310, width: 350, height: 48, latex: '2x - 5 = 10' },
    { id: 'transform', type: 'transform_equation', sequence_index: 9, x: 10, y: 366, width: 350, height: 48, latex: '2x - 5 + 5 = 10 + 5', target_id: 'source-equation' },
    { id: 'task', type: 'student_task', sequence_index: 10, text: 'Name the inverse operation.', requires_student_response: true },
  ],
  allowed_student_actions: ['submit_answer', 'request_hint'],
  hidden_answer_policy: { mode: 'hidden', deterministic_policy_permits_final_reveal: false },
  next_state_policy: { correct: 'continue', invalid: 'reteach', incomplete: 'ask_for_work', stuck: 'reteach', hint: 'ask_for_work', explain_differently: 'reteach' },
};

describe('declarative teaching-board primitive contract', () => {
  it('accepts bounded declarative primitives and public labels', () => {
    expect(() => validateTeachingPlan(plan)).not.toThrow();
  });

  it.each([
    ['invalid geometry', { ...plan, board_actions: [{ ...plan.board_actions[0], width: 0 }, ...plan.board_actions.slice(1)] }],
    ['an unknown action property', { ...plan, board_actions: [{ ...plan.board_actions[0], widget: 'EvilWidget()' }, ...plan.board_actions.slice(1)] }],
    ['an unsafe label', { ...plan, board_actions: [...plan.board_actions.slice(0, 2), { ...plan.board_actions[2], label: '<script>alert(1)</script>' }, ...plan.board_actions.slice(3)] }],
    ['an invalid number line', { ...plan, board_actions: [...plan.board_actions.slice(0, 5), { ...plan.board_actions[5], number_line: { min: 2, max: -2, step: 1 } }, ...plan.board_actions.slice(6)] }],
    ['an unsafe table cell', { ...plan, board_actions: [...plan.board_actions.slice(0, 6), { ...plan.board_actions[6], table: { columns: ['x'], rows: [['<svg onload=alert(1)>']] } }, ...plan.board_actions.slice(7)] }],
  ])('rejects %s', (_reason, invalid) => {
    expect(() => validateTeachingPlan(invalid)).toThrow(TeachingPlanContractError);
  });

  it('permits primitives in the compact public envelope but never arbitrary properties', () => {
    const publicTurn = {
      schema_version: 1, session_id: 'session-1', turn_id: 'turn-1', board_version: 1,
      tutor_status: 'Waiting for you',
      teaching_plan: {
        schema_version: 1, representation: plan.representation,
        learning_objective: plan.learning_objective, teaching_message: plan.teaching_message,
        visible_board_actions: plan.board_actions.slice(0, -1),
        active_student_task: plan.board_actions[plan.board_actions.length - 1],
        allowed_student_actions: plan.allowed_student_actions,
        hidden_answer_policy: plan.hidden_answer_policy, next_state_policy: plan.next_state_policy,
      },
      verification: { status: 'cannot_verify', verified: false, concise_evidence: 'No answer yet.', student_facing_feedback: 'Try one step.' },
      recovery: { state: 'ready' },
    };
    expect(() => validatePublicTutorTurn(publicTurn)).not.toThrow();
    expect(() => validatePublicTutorTurn({
      ...publicTurn,
      teaching_plan: { ...publicTurn.teaching_plan, visible_board_actions: [{ ...plan.board_actions[0], javascript: 'alert(1)' }] },
    })).toThrow(TeachingPlanContractError);
  });

  it('keeps legacy equation payloads valid', () => {
    expect(() => validateTeachingPlan({
      ...plan,
      board_actions: [
        { id: 'equation', type: 'write_equation', sequence_index: 0, latex: '2x + 5 = 15' },
        { id: 'task', type: 'student_task', sequence_index: 1, text: 'What operation removes +5?', requires_student_response: true },
      ],
    })).not.toThrow();
  });
});
