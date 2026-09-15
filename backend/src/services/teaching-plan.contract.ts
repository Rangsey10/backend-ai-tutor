/** Renderer-safe mirror of ai-service teaching_plan_contract.py (schema v1). */

export const TEACHING_PLAN_SCHEMA_VERSION = 1 as const;
/** Outer student-facing envelope. Schema v1 remains read-compatible only. */
export const PUBLIC_TUTOR_TURN_SCHEMA_VERSION = 2 as const;

const representations = new Set([
  'equation_transformation', 'balance_scale', 'worked_example', 'number_line',
  'coordinate_graph', 'table', 'conceptual_explanation', 'error_analysis',
]);
const actions = new Set([
  'write_text', 'write_equation', 'transform_equation', 'highlight', 'cross_out',
  'fade_previous', 'speak_marker', 'pause_marker',
  'draw_rectangle', 'circle', 'draw_arrow', 'draw_point', 'show_hint', 'show_feedback', 'student_task', 'show_number_line',
  'draw_axes', 'show_graph', 'plot_function', 'graph_annotation', 'show_table',
  'final_answer_reveal',
]);
const nextStates = new Set([
  'continue', 'reteach', 'ask_for_work', 'offer_practice', 'reveal_progressively',
  'unsupported_recovery',
]);
const unsafe = /<\s*\/?\s*[a-z][^>]*>|\b(?:flutter|dart|javascript|typescript|html|css|svg)\b|\b(?:https?|javascript|data):|\b(?:widget|class|function)\s*\(/i;

export class TeachingPlanContractError extends Error {}

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonObject : null;
}

/**
 * Remove known server-only verifier fields and turn an unsafe individual
 * action into a compact public notice. This is deliberately a projection,
 * never an attempt to execute or reinterpret model-authored UI data.
 */
export function recoverPublicTutorTurn(value: unknown): unknown {
  const turn = object(value);
  const plan = object(turn?.teaching_plan);
  if (!turn || !plan || !Array.isArray(plan.visible_board_actions)) return value;
  const publicKeys = new Set([
    'id', 'type', 'sequence_index', 'duration_ms', 'wait_for_speech_marker',
    'x', 'y', 'width', 'height', 'text', 'latex', 'target_id', 'graph',
    'requires_student_response', 'task_type', 'explanation_required',
    'points', 'label', 'number_line', 'table', 'section_id', 'layout_zone',
    'layout_flow', 'problem_instance_id', 'active_step_id', 'action_id',
    'board_version', 'base_board_version',
  ]);
  const privateKeys = new Set([
    'accepted_answer_forms', 'expected_operation', 'expected_step', 'hidden',
    'metadata', 'verifier', 'answer', 'answer_key', 'solution',
  ]);
  const identity = object(turn.lesson_state);
  const publicIdentity = (action: JsonObject): JsonObject => {
    if (turn.schema_version !== PUBLIC_TUTOR_TURN_SCHEMA_VERSION || !identity) return action;
    return {
      ...action,
      problem_instance_id: identity.problem_instance_id,
      active_step_id: identity.active_step_id,
      action_id: action.id,
      board_version: turn.board_version,
      base_board_version: turn.base_board_version,
    };
  };
  const notice = (index: number, task = false): JsonObject => publicIdentity({
    id: task ? 'board-recovery-task' : `board-recovery-${index}`,
    type: task ? 'student_task' : 'show_feedback',
    sequence_index: Math.min(Math.max(index, 0), 24),
    text: task
      ? 'Please answer the current question or ask for a hint.'
      : 'One board item could not be shown. Continue with this step.',
    ...(task ? { requires_student_response: true, task_type: 'conceptual_operation', layout_zone: 'student_task' } : { layout_zone: 'feedback' }),
    layout_flow: 'vertical',
  });
  const sanitize = (raw: unknown, index: number, task = false): JsonObject => {
    const action = object(raw);
    if (!action || Object.keys(action).some((key) => !publicKeys.has(key) && !privateKeys.has(key))) {
      return notice(index, task);
    }
    const candidate = Object.fromEntries(Object.entries(action).filter(([key]) => publicKeys.has(key)));
    if (typeof candidate.id !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(candidate.id) ||
        typeof candidate.type !== 'string' || !actions.has(candidate.type) ||
        !Number.isInteger(candidate.sequence_index) || (candidate.sequence_index as number) < 0 ||
        (candidate.sequence_index as number) > 24 || (task && candidate.type !== 'student_task')) {
      return notice(index, task);
    }
    // Apply the same bounded primitive validation to one action at a time.
    // This prevents a malformed graph/shape from making the whole public turn
    // fail while retaining valid siblings. Identity fields are accepted by the
    // internal validator as opaque transport identifiers.
    const fallbackVisual = {
      id: 'public-recovery-visual', type: 'write_text', sequence_index: 0,
      text: 'Continue with this step.',
    };
    const fallbackTask = {
      id: 'public-recovery-task', type: 'student_task', sequence_index: 1,
      text: 'Please answer the current question.', requires_student_response: true,
      task_type: 'conceptual_operation',
    };
    try {
      validateTeachingPlan({
        schema_version: plan.schema_version,
        representation: plan.representation,
        learning_objective: plan.learning_objective,
        teaching_message: plan.teaching_message,
        board_actions: task ? [fallbackVisual, candidate] : [candidate, fallbackTask],
        allowed_student_actions: plan.allowed_student_actions,
        hidden_answer_policy: plan.hidden_answer_policy,
        next_state_policy: plan.next_state_policy,
      });
    } catch {
      return notice(index, task);
    }
    return publicIdentity(candidate);
  };
  const visible = plan.visible_board_actions.map((action, index) => sanitize(action, index));
  const task = sanitize(plan.active_student_task, visible.length, true);
  return {
    ...turn,
    teaching_plan: { ...plan, visible_board_actions: visible, active_student_task: task },
  };
}

function safeText(value: unknown, label: string): void {
  if (typeof value !== 'string' || !value.trim() || value.length > 1000 || unsafe.test(value)) {
    throw new TeachingPlanContractError(`${label} is not safe teaching text`);
  }
}

// LaTeX is data interpreted only by Flutter's allow-listed math renderer. The
// trusted Python service validates it as part of the strict teaching-plan
// contract before it reaches this boundary. Re-applying the prose/code regex
// here produced false positives for ordinary equations, so this second-layer
// check intentionally enforces only its structural limits.
function safeLatex(value: unknown, label: string): void {
  if (typeof value !== 'string' || !value.trim() || value.length > 1000 ||
      /[<>]|\b(?:https?|javascript|data):/i.test(value)) {
    throw new TeachingPlanContractError(`${label} is not safe mathematical LaTeX`);
  }
}

function finiteBounded(value: unknown, label: string, positive = false): void {
  if (value !== undefined && value !== null &&
    (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 10000 || (positive && value <= 0))) {
    throw new TeachingPlanContractError(`${label} is outside supported board bounds`);
  }
}

function validateGraph(value: unknown): void {
  const graph = object(value);
  if (!graph) throw new TeachingPlanContractError('graph action needs graph data');
  const allowed = new Set(['x_min', 'x_max', 'y_min', 'y_max', 'function_expression', 'points', 'labels', 'domain', 'annotations']);
  if (Object.keys(graph).some((key) => !allowed.has(key))) {
    throw new TeachingPlanContractError('graph has unknown fields');
  }
  for (const key of ['x_min', 'x_max', 'y_min', 'y_max']) finiteBounded(graph[key], key);
  if (typeof graph.x_min !== 'number' || typeof graph.x_max !== 'number' ||
      typeof graph.y_min !== 'number' || typeof graph.y_max !== 'number' ||
      graph.x_min >= graph.x_max || graph.y_min >= graph.y_max) {
    throw new TeachingPlanContractError('graph axes are invalid');
  }
  const hasExpression = typeof graph.function_expression === 'string' && graph.function_expression.trim().length > 0;
  const hasPoints = Array.isArray(graph.points) && graph.points.length > 0;
  if (graph.points !== undefined) validatePoints(graph.points, 'graph');
  if (!hasExpression && !hasPoints) throw new TeachingPlanContractError('graph needs an expression or points');
  if (hasExpression) safeText(graph.function_expression, 'graph expression');
  const labels = graph.labels;
  if (labels !== undefined && (!Array.isArray(labels) || labels.length > 20 || !labels.every((entry) => {
    try { safeText(entry, 'graph label'); return true; } catch { return false; }
  }))) throw new TeachingPlanContractError('graph labels are invalid');
  const annotations = graph.annotations;
  if (annotations !== undefined && (!Array.isArray(annotations) || annotations.length > 20 || !annotations.every((entry) => {
    const annotation = object(entry);
    const annotationKeys = new Set(['text', 'x', 'y']);
    if (!annotation || Object.keys(annotation).some((key) => !annotationKeys.has(key))) return false;
    try {
      safeText(annotation.text, 'graph annotation');
      finiteBounded(annotation.x, 'graph annotation x');
      finiteBounded(annotation.y, 'graph annotation y');
      return typeof annotation.x === 'number' && typeof annotation.y === 'number';
    } catch { return false; }
  }))) throw new TeachingPlanContractError('graph annotations are invalid');
  const domain = graph.domain;
  if (domain !== undefined && (!Array.isArray(domain) || domain.length !== 2 || domain.some((item) =>
    typeof item !== 'number' || !Number.isFinite(item) || Math.abs(item) > 10000) || domain[0] >= domain[1])) {
    throw new TeachingPlanContractError('graph domain is invalid');
  }
}

function validatePoints(value: unknown, label: string, requireY = true): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 100) {
    throw new TeachingPlanContractError(`${label} points are invalid`);
  }
  for (const rawPoint of value) {
    const point = object(rawPoint);
    const allowed = new Set(['x', 'y', 'label', 'open']);
    if (!point || Object.keys(point).some((key) => !allowed.has(key))) {
      throw new TeachingPlanContractError(`${label} point has unknown fields`);
    }
    finiteBounded(point.x, `${label} point x`);
    if (typeof point.x !== 'number' || (requireY && typeof point.y !== 'number')) {
      throw new TeachingPlanContractError(`${label} point coordinates are invalid`);
    }
    if (requireY) finiteBounded(point.y, `${label} point y`);
    if (point.label !== undefined) {
      if (typeof point.label !== 'string' || point.label.length > 120) {
        throw new TeachingPlanContractError(`${label} point label is invalid`);
      }
      safeText(point.label, `${label} point label`);
    }
    if (point.open !== undefined && typeof point.open !== 'boolean') {
      throw new TeachingPlanContractError(`${label} point open is invalid`);
    }
  }
}

function validateNumberLine(value: unknown): void {
  const line = object(value);
  const allowed = new Set(['min', 'max', 'step', 'labels']);
  if (!line || Object.keys(line).some((key) => !allowed.has(key))) {
    throw new TeachingPlanContractError('number line is invalid');
  }
  finiteBounded(line.min, 'number line min');
  finiteBounded(line.max, 'number line max');
  finiteBounded(line.step, 'number line step', true);
  if (typeof line.min !== 'number' || typeof line.max !== 'number' || typeof line.step !== 'number' || line.min >= line.max) {
    throw new TeachingPlanContractError('number line range is invalid');
  }
  if (line.labels !== undefined && (!Array.isArray(line.labels) || line.labels.length > 20 || !line.labels.every((item) => {
    try { return typeof item === 'string' && item.length <= 120 && (safeText(item, 'number line label'), true); } catch { return false; }
  }))) throw new TeachingPlanContractError('number line labels are invalid');
}

function validateTable(value: unknown): void {
  const table = object(value);
  const allowed = new Set(['columns', 'rows']);
  if (!table || Object.keys(table).some((key) => !allowed.has(key)) || !Array.isArray(table.columns) ||
      table.columns.length < 1 || table.columns.length > 6 || !Array.isArray(table.rows) ||
      table.rows.length < 1 || table.rows.length > 10) {
    throw new TeachingPlanContractError('table is invalid');
  }
  const safeCell = (cell: unknown): boolean => {
    if (typeof cell === 'number') return Number.isFinite(cell) && Math.abs(cell) <= 10000;
    try { return typeof cell === 'string' && cell.length <= 160 && (safeText(cell, 'table cell'), true); } catch { return false; }
  };
  const columns = table.columns as unknown[];
  const rows = table.rows as unknown[];
  if (!columns.every(safeCell) || !rows.every((row) => Array.isArray(row) && row.length === columns.length && row.every(safeCell))) {
    throw new TeachingPlanContractError('table cells are invalid');
  }
}

/** Throws for unsafe, malformed, unknown, or policy-incompatible plans. */
export function validateTeachingPlan(value: unknown): void {
  const plan = object(value);
  if (!plan || plan.schema_version !== TEACHING_PLAN_SCHEMA_VERSION ||
      typeof plan.representation !== 'string' || !representations.has(plan.representation)) {
    throw new TeachingPlanContractError('teaching plan schema or representation is invalid');
  }
  safeText(plan.learning_objective, 'learning objective');
  safeText(plan.teaching_message, 'teaching message');
  if (!Array.isArray(plan.board_actions) || plan.board_actions.length < 1 || plan.board_actions.length > 24) {
    throw new TeachingPlanContractError('teaching plan action count is invalid');
  }
  const ids = new Set<string>();
  const boxes: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];
  let visibleTasks = 0;
  let finalReveal = false;
  for (const rawAction of plan.board_actions) {
    const action = object(rawAction);
    const id = typeof action?.id === 'string' ? action.id : '';
    const type = typeof action?.type === 'string' ? action.type : '';
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(id) || ids.has(id) || !actions.has(type)) {
      throw new TeachingPlanContractError('unknown or duplicate teaching-plan action');
    }
    if (!Number.isInteger(action?.sequence_index) || (action?.sequence_index as number) < 0 || (action?.sequence_index as number) > 24) {
      throw new TeachingPlanContractError('teaching-plan sequence index is invalid');
    }
    ids.add(id);
    const allowedActionKeys = new Set([
      'id', 'type', 'sequence_index', 'duration_ms', 'wait_for_speech_marker', 'x', 'y', 'width', 'height', 'text', 'latex',
      'target_id', 'graph', 'points', 'label', 'number_line', 'table', 'hidden',
      // Semantic layout is renderer-safe data. The Flutter client calculates
      // final coordinates; it is not planner or answer-key metadata.
      'section_id', 'layout_zone', 'layout_flow',
      'requires_student_response', 'task_type', 'accepted_answer_forms', 'expected_operation',
      'expected_step', 'explanation_required',
      // Schema-v2 identity fields are injected by the public projection and
      // remain harmless, opaque identifiers at this gateway boundary.
      'problem_instance_id', 'active_step_id', 'action_id', 'board_version', 'base_board_version',
    ]);
    if (!action || Object.keys(action).some((key) => !allowedActionKeys.has(key))) {
      throw new TeachingPlanContractError('teaching-plan action contains an unknown field');
    }
    const durationMs = action.duration_ms ?? 0;
    if (!Number.isInteger(durationMs) || (durationMs as number) < 0 || (durationMs as number) > 8000) {
      throw new TeachingPlanContractError('teaching-plan action duration is invalid');
    }
    if (action.wait_for_speech_marker !== undefined && typeof action.wait_for_speech_marker !== 'boolean') {
      throw new TeachingPlanContractError('teaching-plan speech wait is invalid');
    }
    if (action.target_id !== undefined &&
        (typeof action.target_id !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(action.target_id))) {
      throw new TeachingPlanContractError('teaching-plan target is invalid');
    }
    if (action.section_id !== undefined &&
        (typeof action.section_id !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(action.section_id))) {
      throw new TeachingPlanContractError('teaching-plan section is invalid');
    }
    if (action.layout_zone !== undefined &&
        !['problem', 'working', 'visual', 'student_task', 'reference', 'feedback'].includes(String(action.layout_zone))) {
      throw new TeachingPlanContractError('teaching-plan layout zone is invalid');
    }
    if (action.layout_flow !== undefined &&
        !['vertical', 'horizontal', 'overlay', 'diagram'].includes(String(action.layout_flow))) {
      throw new TeachingPlanContractError('teaching-plan layout flow is invalid');
    }
    if (type === 'speak_marker' && durationMs !== 0) {
      throw new TeachingPlanContractError('speak marker has no visual duration');
    }
    if (type === 'pause_marker' && ((durationMs as number) < 150 || (durationMs as number) > 8000)) {
      throw new TeachingPlanContractError('pause marker duration is invalid');
    }
    for (const key of ['x', 'y']) finiteBounded(action?.[key], key);
    for (const key of ['width', 'height']) finiteBounded(action?.[key], key, true);
    if (['write_text', 'write_equation', 'transform_equation', 'show_hint', 'show_feedback', 'student_task', 'graph_annotation', 'final_answer_reveal'].includes(type)) {
      if (!(typeof action?.text === 'string' && action.text.trim()) && !(typeof action?.latex === 'string' && action.latex.trim())) {
        throw new TeachingPlanContractError('text action is missing content');
      }
      if (action?.text !== undefined) safeText(action.text, 'board action');
      // Python serializes optional LaTeX as null for text-only actions.
      // Treat null exactly like an omitted optional field.
      if (action?.latex !== undefined && action?.latex !== null) {
        safeLatex(action.latex, 'board action latex');
      }
    }
    if (type === 'show_graph' || type === 'plot_function') validateGraph(action?.graph);
    validatePoints(action?.points, 'board action');
    if (action?.label !== undefined) {
      if (typeof action.label !== 'string' || action.label.length > 120) {
        throw new TeachingPlanContractError('board action label is invalid');
      }
      safeText(action.label, 'board action label');
    }
    if (type === 'draw_rectangle' || type === 'circle') {
      if (typeof action?.x !== 'number' || typeof action?.y !== 'number' ||
          typeof action?.width !== 'number' || typeof action?.height !== 'number' ||
          action.width <= 0 || action.height <= 0) {
        throw new TeachingPlanContractError('shape action needs bounded geometry');
      }
    }
    if (type === 'draw_arrow') {
      const hasBox = typeof action?.x === 'number' && typeof action?.y === 'number' &&
        typeof action?.width === 'number' && typeof action?.height === 'number' &&
        action.width > 0 && action.height > 0;
      if (!hasBox && (!Array.isArray(action?.points) || action.points.length < 2)) {
        throw new TeachingPlanContractError('arrow action needs bounded geometry or two points');
      }
    }
    if (type === 'draw_point' && (typeof action?.x !== 'number' || typeof action?.y !== 'number')) {
      throw new TeachingPlanContractError('point action needs bounded coordinates');
    }
    if (type === 'show_number_line') validateNumberLine(action?.number_line);
    if (type === 'show_table') validateTable(action?.table);
    if (type === 'student_task') {
      if (action?.hidden === true || action?.requires_student_response !== true) {
        throw new TeachingPlanContractError('student task must be visible and active');
      }
      visibleTasks += 1;
    }
    if (type === 'final_answer_reveal') finalReveal = true;
    const isOverlay = ['highlight', 'cross_out', 'draw_arrow', 'graph_annotation', 'draw_axes', 'plot_function', 'fade_previous', 'speak_marker', 'pause_marker'].includes(type);
    if (!isOverlay && typeof action?.x === 'number' && typeof action?.y === 'number' &&
        typeof action?.width === 'number' && typeof action?.height === 'number') {
      const box = { id, x: action.x, y: action.y, width: action.width, height: action.height };
      if (boxes.some((other) => box.x < other.x + other.width && box.x + box.width > other.x &&
          box.y < other.y + other.height && box.y + box.height > other.y)) {
        throw new TeachingPlanContractError('teaching-plan actions must not overlap');
      }
      boxes.push(box);
    }
  }
  validateTeachingTimeline(plan.board_actions);
  if (visibleTasks !== 1) throw new TeachingPlanContractError('teaching plan needs exactly one student task');
  if (!Array.isArray(plan.allowed_student_actions) || plan.allowed_student_actions.length < 1 || plan.allowed_student_actions.length > 8 ||
      !plan.allowed_student_actions.every((item) => typeof item === 'string' && /^[a-z_]{1,50}$/.test(item))) {
    throw new TeachingPlanContractError('allowed student actions are invalid');
  }
  const hiddenAnswerPolicy = object(plan.hidden_answer_policy);
  if (!hiddenAnswerPolicy || !['hidden', 'partial', 'reveal_allowed'].includes(String(hiddenAnswerPolicy.mode))) {
    throw new TeachingPlanContractError('hidden answer policy is invalid');
  }
  if (finalReveal && (hiddenAnswerPolicy.mode !== 'reveal_allowed' || hiddenAnswerPolicy.deterministic_policy_permits_final_reveal !== true)) {
    throw new TeachingPlanContractError('final answer reveal is not authorized by deterministic policy');
  }
  const nextPolicy = object(plan.next_state_policy);
  for (const key of ['correct', 'invalid', 'incomplete', 'stuck', 'hint', 'explain_differently']) {
    if (!nextPolicy || typeof nextPolicy[key] !== 'string' || !nextStates.has(nextPolicy[key] as string)) {
      throw new TeachingPlanContractError(`next state policy ${key} is invalid`);
    }
  }
}

/** Validate the only tutor-turn shape permitted to reach a student client. */
export function validatePublicTutorTurn(value: unknown): void {
  const turn = object(value);
  const allowedTopLevel = new Set([
    'schema_version', 'session_id', 'turn_id', 'board_version', 'tutor_status',
    'teaching_plan', 'verification', 'recovery',
    'base_board_version', 'board_update_mode', 'lesson_state',
  ]);
  const schemaVersion = turn?.schema_version;
  if (!turn || (schemaVersion !== 1 && schemaVersion !== 2) ||
      Object.keys(turn).some((key) => !allowedTopLevel.has(key)) ||
      typeof turn.session_id !== 'string' || !turn.session_id.trim() ||
      typeof turn.turn_id !== 'string' || !turn.turn_id.trim() ||
      !Number.isInteger(turn.board_version) || (turn.board_version as number) < 0 ||
      typeof turn.tutor_status !== 'string' || !turn.tutor_status.trim()) {
    throw new TeachingPlanContractError('public tutor-turn envelope is invalid');
  }
  if (schemaVersion === 2) {
    if (!Number.isInteger(turn.base_board_version) || (turn.base_board_version as number) < 0 ||
        !['replace', 'patch'].includes(String(turn.board_update_mode))) {
      throw new TeachingPlanContractError('public tutor-turn board state is invalid');
    }
    const lessonState = object(turn.lesson_state);
    const allowedLessonKeys = new Set([
      'problem_instance_id', 'lesson_id', 'active_step_id', 'current_step_index',
      'expected_student_action_id', 'teaching_stage', 'lesson_state',
      'final_answer_locked', 'board_version', 'base_board_version',
    ]);
    if (!lessonState || Object.keys(lessonState).some((key) => !allowedLessonKeys.has(key)) ||
        typeof lessonState.problem_instance_id !== 'string' || !lessonState.problem_instance_id ||
        typeof lessonState.lesson_id !== 'string' || !lessonState.lesson_id ||
        typeof lessonState.active_step_id !== 'string' || !lessonState.active_step_id ||
        !Number.isInteger(lessonState.current_step_index) || (lessonState.current_step_index as number) < 0 ||
        typeof lessonState.expected_student_action_id !== 'string' || !lessonState.expected_student_action_id ||
        typeof lessonState.final_answer_locked !== 'boolean' ||
        lessonState.board_version !== turn.board_version || lessonState.base_board_version !== turn.base_board_version) {
      throw new TeachingPlanContractError('public tutor-turn lesson state is invalid');
    }
  }

  const publicPlan = object(turn.teaching_plan);
  const allowedPlanKeys = new Set([
    'schema_version', 'representation', 'learning_objective', 'teaching_message',
    'visible_board_actions', 'active_student_task', 'allowed_student_actions',
    'hidden_answer_policy', 'next_state_policy',
  ]);
  if (!publicPlan || Object.keys(publicPlan).some((key) => !allowedPlanKeys.has(key)) ||
      !Array.isArray(publicPlan.visible_board_actions) ||
      !object(publicPlan.active_student_task)) {
    throw new TeachingPlanContractError('public tutor-turn teaching plan is invalid');
  }
  const publicActions = [...publicPlan.visible_board_actions, publicPlan.active_student_task];
  const allowedPublicActionKeys = new Set([
    'id', 'type', 'sequence_index', 'duration_ms', 'wait_for_speech_marker', 'x', 'y', 'width', 'height', 'text',
    'latex', 'target_id', 'graph', 'requires_student_response', 'task_type',
    'explanation_required', 'points', 'label', 'number_line', 'table',
    'section_id', 'layout_zone', 'layout_flow',
    'problem_instance_id', 'active_step_id', 'action_id', 'board_version', 'base_board_version',
  ]);
  for (const action of publicActions) {
    const item = object(action);
    if (!item || Object.keys(item).some((key) => !allowedPublicActionKeys.has(key))) {
      throw new TeachingPlanContractError('public tutor-turn contains a private board action field');
    }
  }
  if (schemaVersion === 2) {
    const lessonState = object(turn.lesson_state)!;
    for (const action of publicActions) {
      const item = object(action)!;
      if (item.problem_instance_id !== lessonState.problem_instance_id ||
          item.active_step_id !== lessonState.active_step_id ||
          item.action_id !== item.id || item.board_version !== turn.board_version ||
          item.base_board_version !== turn.base_board_version) {
        throw new TeachingPlanContractError('public tutor-turn action identity is invalid');
      }
    }
  }
  validateTeachingPlan({
    ...publicPlan,
    board_actions: publicActions,
  });

  const verification = object(turn.verification);
  const allowedVerification = new Set([
    'status', 'verified', 'concise_evidence', 'student_facing_feedback',
  ]);
  const validStatuses = new Set([
    'correct', 'mathematically_valid_but_inefficient', 'invalid', 'incomplete', 'cannot_verify',
  ]);
  if (!verification || Object.keys(verification).some((key) => !allowedVerification.has(key)) ||
      typeof verification.status !== 'string' || !validStatuses.has(verification.status) ||
      typeof verification.verified !== 'boolean') {
    throw new TeachingPlanContractError('public tutor-turn verification is invalid');
  }
  safeText(verification.concise_evidence, 'public verification evidence');
  safeText(verification.student_facing_feedback, 'public verification feedback');

  const recovery = object(turn.recovery);
  if (!recovery || typeof recovery.state !== 'string' || recovery.state.length > 80) {
    throw new TeachingPlanContractError('public tutor-turn recovery is invalid');
  }
}

/** Timeline markers are optional for legacy persisted plans, but mandatory
 * once a plan opts into the live teaching timeline. */
function validateTeachingTimeline(rawActions: unknown[]): void {
  const ordered = rawActions
    .map(object)
    .filter((action): action is JsonObject => action !== null)
    .sort((a, b) => Number(a.sequence_index) - Number(b.sequence_index));
  const usesTimeline = ordered.some((action) =>
    action.type === 'speak_marker' || action.type === 'pause_marker');
  if (!usesTimeline) return;
  const visualTypes = new Set([
    'write_text', 'write_equation', 'transform_equation', 'draw_rectangle',
    'circle', 'draw_arrow', 'draw_point', 'show_number_line', 'draw_axes', 'show_graph',
    'plot_function', 'show_table', 'graph_annotation',
  ]);
  const visualIndexes = ordered.reduce<number[]>((indexes, action, index) => {
    if (visualTypes.has(String(action.type))) indexes.push(index);
    return indexes;
  }, []);
  if (visualIndexes.length > 1) {
    throw new TeachingPlanContractError('a teaching turn may contain only one primary visual idea');
  }
  if (visualIndexes.length === 1) {
    const visualIndex = visualIndexes[0];
    if (!ordered.slice(0, visualIndex).some((action) => action.type === 'speak_marker') ||
        !ordered.slice(visualIndex + 1).some((action) => action.type === 'pause_marker')) {
      throw new TeachingPlanContractError('timeline visual action needs speak and pause markers');
    }
  }
}
