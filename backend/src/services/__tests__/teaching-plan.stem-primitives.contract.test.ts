/**
 * The six STEM visual primitives must survive the gateway.
 *
 * The AI service declares them in teaching_plan_contract.py and the Flutter client
 * renders all six with per-type payload validation (live_board_state.dart). The
 * gateway sits between them, so a type or field it does not know is replaced with
 * "One board item could not be shown" — silently losing a physics diagram or a
 * molecule with no error anywhere.
 */
import { TeachingPlanContractError, validateTeachingPlan } from '../teaching-plan.contract';

function planWith(action: Record<string, unknown>) {
  return {
    schema_version: 1,
    representation: 'conceptual_explanation',
    learning_objective: 'Read the diagram.',
    teaching_message: 'Look at the diagram and name each part.',
    board_actions: [
      { id: 'intro', type: 'write_text', sequence_index: 0, text: 'Study the diagram.' },
      action,
      {
        id: 'task',
        type: 'student_task',
        sequence_index: 2,
        text: 'Name one force acting on the block.',
        requires_student_response: true,
      },
    ],
    active_student_task: 'Name one force acting on the block.',
    allowed_student_actions: ['submit_step'],
    hidden_answer_policy: { mode: 'hidden', deterministic_policy_permits_final_reveal: false },
    next_state_policy: {
      correct: 'continue',
      invalid: 'reteach',
      incomplete: 'ask_for_work',
      stuck: 'reteach',
      hint: 'ask_for_work',
      explain_differently: 'reteach',
    },
  };
}

const VALID_PRIMITIVES: Array<[string, Record<string, unknown>]> = [
  [
    'draw_free_body_diagram',
    {
      id: 'fbd',
      type: 'draw_free_body_diagram',
      sequence_index: 1,
      forces: [
        { label: 'Weight', direction: 'down', magnitude: 20 },
        { label: 'Normal', direction: 'up', magnitude: 20 },
      ],
    },
  ],
  [
    'draw_molecule',
    {
      id: 'molecule',
      type: 'draw_molecule',
      sequence_index: 1,
      points: [
        { x: 0.3, y: 0.5, label: 'H' },
        { x: 0.7, y: 0.5, label: 'O' },
      ],
      molecule_bonds: [{ from_index: 0, to_index: 1, order: 1 }],
    },
  ],
  [
    'draw_atom_model',
    {
      id: 'atom',
      type: 'draw_atom_model',
      sequence_index: 1,
      atom_model: { symbol: 'Na', protons: 11, neutrons: 12, shells: [2, 8, 1] },
    },
  ],
  [
    'draw_particle_diagram',
    {
      id: 'particles',
      type: 'draw_particle_diagram',
      sequence_index: 1,
      particle_diagram: { state: 'gas', particle_count: 12 },
    },
  ],
  [
    'draw_circuit_diagram',
    {
      id: 'circuit',
      type: 'draw_circuit_diagram',
      sequence_index: 1,
      circuit_diagram: {
        components: [
          { kind: 'battery', label: '6 V' },
          { kind: 'resistor', label: '3 Ω' },
        ],
      },
    },
  ],
  [
    'show_reaction_layout',
    {
      id: 'reaction',
      type: 'show_reaction_layout',
      sequence_index: 1,
      reaction_layout: {
        reactants: ['2H2', 'O2'],
        products: ['2H2O'],
      },
    },
  ],
];

describe('the gateway carries every STEM visual primitive the AI service can draw', () => {
  it.each(VALID_PRIMITIVES)('accepts a well-formed %s', (_label, action) => {
    expect(() => validateTeachingPlan(planWith(action))).not.toThrow();
  });
});

describe('a malformed primitive is still refused', () => {
  it('rejects a free-body diagram with no forces', () => {
    expect(() =>
      validateTeachingPlan(
        planWith({ id: 'fbd', type: 'draw_free_body_diagram', sequence_index: 1, forces: [] })
      )
    ).toThrow(TeachingPlanContractError);
  });

  it('rejects a free-body diagram that omits forces entirely', () => {
    expect(() =>
      validateTeachingPlan(
        planWith({ id: 'fbd', type: 'draw_free_body_diagram', sequence_index: 1 })
      )
    ).toThrow(TeachingPlanContractError);
  });

  it('rejects an atom model with no data', () => {
    expect(() =>
      validateTeachingPlan(
        planWith({ id: 'atom', type: 'draw_atom_model', sequence_index: 1 })
      )
    ).toThrow(TeachingPlanContractError);
  });

  it('rejects a particle diagram with no data', () => {
    expect(() =>
      validateTeachingPlan(
        planWith({ id: 'p', type: 'draw_particle_diagram', sequence_index: 1 })
      )
    ).toThrow(TeachingPlanContractError);
  });

  it('rejects a circuit diagram with no data', () => {
    expect(() =>
      validateTeachingPlan(
        planWith({ id: 'c', type: 'draw_circuit_diagram', sequence_index: 1 })
      )
    ).toThrow(TeachingPlanContractError);
  });

  it('rejects a reaction layout with no data', () => {
    expect(() =>
      validateTeachingPlan(
        planWith({ id: 'r', type: 'show_reaction_layout', sequence_index: 1 })
      )
    ).toThrow(TeachingPlanContractError);
  });

  it('rejects a molecule bond pointing outside its atom list', () => {
    expect(() =>
      validateTeachingPlan(
        planWith({
          id: 'molecule',
          type: 'draw_molecule',
          sequence_index: 1,
          points: [{ x: 0.3, y: 0.5, label: 'H' }],
          molecule_bonds: [{ from_index: 0, to_index: 4, order: 1 }],
        })
      )
    ).toThrow(TeachingPlanContractError);
  });

  it('still rejects an action type nobody declares', () => {
    expect(() =>
      validateTeachingPlan(
        planWith({ id: 'x', type: 'draw_whatever_it_likes', sequence_index: 1 })
      )
    ).toThrow(TeachingPlanContractError);
  });

  it('still rejects an unknown field on a known primitive', () => {
    expect(() =>
      validateTeachingPlan(
        planWith({
          id: 'fbd',
          type: 'draw_free_body_diagram',
          sequence_index: 1,
          forces: [{ label: 'Weight', direction: 'down', magnitude: 20 }],
          answer_key: 'the block accelerates down',
        })
      )
    ).toThrow(TeachingPlanContractError);
  });
});
