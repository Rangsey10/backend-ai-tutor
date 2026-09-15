import {
  TeachingPlanContractError,
  recoverPublicTutorTurn,
  validatePublicTutorTurn,
  validateTeachingPlan,
} from '../teaching-plan.contract';

const plan = {
  schema_version: 1,
  representation: 'equation_transformation',
  learning_objective: 'Use inverse operations to keep both sides balanced.',
  teaching_message: 'Remove the constant from both sides.',
  board_actions: [
    { id: 'equation', type: 'write_equation', sequence_index: 0, latex: '2x + 10 = 20' },
    { id: 'task', type: 'student_task', sequence_index: 1, text: 'What operation removes +10?', requires_student_response: true },
  ],
  allowed_student_actions: ['submit_answer', 'request_hint', 'stuck'],
  hidden_answer_policy: { mode: 'hidden', deterministic_policy_permits_final_reveal: false },
  next_state_policy: { correct: 'continue', invalid: 'reteach', incomplete: 'ask_for_work', stuck: 'reteach', hint: 'ask_for_work', explain_differently: 'reteach' },
};

describe('teaching plan contract', () => {
  const publicTurn = {
    schema_version: 1,
    session_id: 'session-public-1',
    turn_id: 'turn-public-1',
    board_version: 2,
    tutor_status: 'Waiting for you',
    teaching_plan: {
      schema_version: 1,
      representation: plan.representation,
      learning_objective: plan.learning_objective,
      teaching_message: plan.teaching_message,
      visible_board_actions: [plan.board_actions[0]],
      active_student_task: plan.board_actions[1],
      allowed_student_actions: plan.allowed_student_actions,
      hidden_answer_policy: plan.hidden_answer_policy,
      next_state_policy: plan.next_state_policy,
    },
    verification: {
      status: 'cannot_verify',
      verified: false,
      concise_evidence: 'No submitted step yet.',
      student_facing_feedback: 'Submit your next step when ready.',
    },
    recovery: { state: 'ready' },
  };

  it('accepts only the compact public tutor-turn envelope at the gateway boundary', () => {
    expect(() => validatePublicTutorTurn(publicTurn)).not.toThrow();
  });

  it('accepts renderer-safe semantic layout fields in a public tutor turn', () => {
    expect(() => validatePublicTutorTurn({
      ...publicTurn,
      teaching_plan: {
        ...publicTurn.teaching_plan,
        visible_board_actions: [{
          ...plan.board_actions[0],
          section_id: 'logic-intro',
          layout_zone: 'working',
          layout_flow: 'vertical',
        }],
        active_student_task: {
          ...plan.board_actions[1],
          section_id: 'logic-task',
          layout_zone: 'student_task',
          layout_flow: 'vertical',
        },
      },
    })).not.toThrow();
  });

  it('rejects invalid semantic layout values and private board-action fields', () => {
    expect(() => validatePublicTutorTurn({
      ...publicTurn,
      teaching_plan: {
        ...publicTurn.teaching_plan,
        visible_board_actions: [{ ...plan.board_actions[0], layout_zone: 'sidebar' }],
      },
    })).toThrow(TeachingPlanContractError);
    expect(() => validatePublicTutorTurn({
      ...publicTurn,
      teaching_plan: {
        ...publicTurn.teaching_plan,
        visible_board_actions: [{ ...plan.board_actions[0], expected_step: '2x = 10' }],
      },
    })).toThrow(TeachingPlanContractError);
  });

  it('accepts the schema-v2 authoritative lesson state without private fields', () => {
    const lessonState = {
      problem_instance_id: 'problem-1', lesson_id: 'lesson-problem-1',
      active_step_id: 'lesson-problem-1:step-0:task', current_step_index: 0,
      expected_student_action_id: 'task', teaching_stage: 'waiting_for_student',
      lesson_state: 'ask', final_answer_locked: true, board_version: 2,
      base_board_version: 1,
    };
    const actionIdentity = {
      problem_instance_id: lessonState.problem_instance_id,
      active_step_id: lessonState.active_step_id,
      action_id: 'equation', board_version: 2, base_board_version: 1,
    };
    expect(() => validatePublicTutorTurn({
      ...publicTurn, schema_version: 2, base_board_version: 1,
      board_update_mode: 'replace', lesson_state: lessonState,
      teaching_plan: {
        ...publicTurn.teaching_plan,
        visible_board_actions: [{ ...plan.board_actions[0], ...actionIdentity }],
        active_student_task: { ...plan.board_actions[1], ...actionIdentity, action_id: 'task' },
      },
    })).not.toThrow();
  });

  it('rejects legacy or persistence fields from the production public envelope', () => {
    expect(() => validatePublicTutorTurn({
      ...publicTurn,
      board_actions: plan.board_actions,
    })).toThrow(TeachingPlanContractError);
    expect(() => validatePublicTutorTurn({
      ...publicTurn,
      metadata: { solver_facts: { solution_set: 'x=5' } },
    })).toThrow(TeachingPlanContractError);
    expect(() => validatePublicTutorTurn({
      ...publicTurn,
      teaching_plan: {
        ...publicTurn.teaching_plan,
        visible_board_actions: [{ ...plan.board_actions[0], expected_step: '2x = 10' }],
      },
    })).toThrow(TeachingPlanContractError);
  });

  it('rejects arbitrary action properties instead of passing them to Flutter', () => {
    expect(() => validatePublicTutorTurn({
      ...publicTurn,
      teaching_plan: {
        ...publicTurn.teaching_plan,
        visible_board_actions: [{ ...plan.board_actions[0], arbitrary_widget: 'EvilWidget()' }],
      },
    })).toThrow(TeachingPlanContractError);
  });

  it('recovers one legacy/private action while preserving valid public siblings', () => {
    const recovered = recoverPublicTutorTurn({
      ...publicTurn,
      teaching_plan: {
        ...publicTurn.teaching_plan,
        visible_board_actions: [
          plan.board_actions[0],
          {
            id: 'legacy-private', type: 'write_text', sequence_index: 1,
            text: 'Do not lose the equation above.', expected_step: '2x = 10',
          },
          {
            id: 'unsafe', type: 'write_text', sequence_index: 2,
            text: 'Bad extension.', arbitrary_widget: 'EvilWidget()',
          },
        ],
      },
    });

    expect(() => validatePublicTutorTurn(recovered)).not.toThrow();
    const actions = (recovered as any).teaching_plan.visible_board_actions;
    expect(actions.map((action: any) => action.id)).toEqual([
      'equation', 'legacy-private', 'board-recovery-2',
    ]);
    expect(actions[1].expected_step).toBeUndefined();
    expect(actions[2].type).toBe('show_feedback');
  });

  it('rejects hidden verifier hints and non-opaque public targets', () => {
    expect(() => validatePublicTutorTurn({
      ...publicTurn,
      teaching_plan: {
        ...publicTurn.teaching_plan,
        active_student_task: {
          ...plan.board_actions[1],
          accepted_answer_forms: ['subtract 5'],
        },
      },
    })).toThrow(TeachingPlanContractError);
    expect(() => validatePublicTutorTurn({
      ...publicTurn,
      teaching_plan: {
        ...publicTurn.teaching_plan,
        visible_board_actions: [{ ...plan.board_actions[0], target_id: 'x = 5' }],
      },
    })).toThrow(TeachingPlanContractError);
  });

  it('accepts the safe linear-equation fixture', () => {
    expect(() => validateTeachingPlan(plan)).not.toThrow();
  });

  it('accepts a bounded live teaching timeline and rejects incomplete markers', () => {
    const timeline = {
      ...plan,
      board_actions: [
        { id: 'say', type: 'speak_marker', sequence_index: 0, duration_ms: 0 },
        { id: 'current', type: 'write_equation', sequence_index: 1, duration_ms: 420, latex: '2x + 10 = 20', wait_for_speech_marker: true },
        { id: 'focus', type: 'highlight', sequence_index: 2, duration_ms: 220, target_id: 'current' },
        { id: 'think', type: 'pause_marker', sequence_index: 3, duration_ms: 650 },
        { ...plan.board_actions[1], sequence_index: 4 },
      ],
    };
    expect(() => validateTeachingPlan(timeline)).not.toThrow();
    expect(() => validatePublicTutorTurn({
      ...publicTurn,
      teaching_plan: {
        ...publicTurn.teaching_plan,
        visible_board_actions: timeline.board_actions.slice(0, 4),
        active_student_task: timeline.board_actions[4],
      },
    })).not.toThrow();
    expect(() => validateTeachingPlan({
      ...timeline,
      board_actions: timeline.board_actions.filter((action) => action.id !== 'think'),
    })).toThrow(TeachingPlanContractError);
  });

  it('accepts null optional LaTeX from the Python contract', () => {
    expect(() => validateTeachingPlan({
      ...plan,
      board_actions: [
        plan.board_actions[0],
        { ...plan.board_actions[1], latex: null },
      ],
    })).not.toThrow();
  });

  it('accepts renderer-safe mathematical LaTeX but rejects markup', () => {
    expect(() => validateTeachingPlan({
      ...plan,
      board_actions: [
        { ...plan.board_actions[0], latex: '\\frac{20 - 10}{2} = 5' },
        plan.board_actions[1],
      ],
    })).not.toThrow();
    expect(() => validateTeachingPlan({
      ...plan,
      board_actions: [
        { ...plan.board_actions[0], latex: '<script>alert(1)</script>' },
        plan.board_actions[1],
      ],
    })).toThrow(TeachingPlanContractError);
  });

  it('rejects raw UI code, unknown actions, and unauthorized answer reveal', () => {
    expect(() => validateTeachingPlan({ ...plan, teaching_message: '<script>alert(1)</script>' })).toThrow(TeachingPlanContractError);
    expect(() => validateTeachingPlan({ ...plan, board_actions: [{ id: 'widget', type: 'custom_widget', text: 'bad' }, ...plan.board_actions] })).toThrow(TeachingPlanContractError);
    expect(() => validateTeachingPlan({ ...plan, board_actions: [{ id: 'reveal', type: 'final_answer_reveal', text: 'x = 5' }, ...plan.board_actions], hidden_answer_policy: { mode: 'hidden', deterministic_policy_permits_final_reveal: false } })).toThrow(TeachingPlanContractError);
  });

  it('accepts strict graph payloads and rejects invalid axes', () => {
    const graphPlan = { ...plan, representation: 'coordinate_graph', board_actions: [
      { id: 'graph', type: 'show_graph', sequence_index: 0, graph: { x_min: -5, x_max: 5, y_min: -4, y_max: 8, function_expression: 'x^2 - 2' }, width: 500, height: 300 },
      plan.board_actions[1],
    ] };
    expect(() => validateTeachingPlan(graphPlan)).not.toThrow();
    expect(() => validateTeachingPlan({ ...graphPlan, board_actions: [{ ...graphPlan.board_actions[0], graph: { x_min: 5, x_max: -5, y_min: -4, y_max: 8, function_expression: 'x^2' } }, plan.board_actions[1]] })).toThrow(TeachingPlanContractError);
  });

  it('rejects overlapping explicit board rectangles', () => {
    const overlapping = { ...plan, board_actions: [
      { ...plan.board_actions[0], x: 40, y: 40, width: 300, height: 80 },
      { id: 'overlap', type: 'write_text', sequence_index: 1, text: 'Overlapping note', x: 100, y: 70, width: 300, height: 80 },
    ] };
    expect(() => validateTeachingPlan(overlapping)).toThrow(TeachingPlanContractError);
  });
});
