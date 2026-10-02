/**
 * Maths answers must be graded on what they mean, not how they are typed.
 *
 * Grading used to compare strings, so a student who wrote `x=5` where the key
 * said `5`, or `x=2 or x=3` where the key said `x = 3 or x = 2`, was marked
 * wrong. These tests pin the equivalence path, and — just as important — pin
 * that a verifier outage never silently marks a correct answer wrong.
 */
import { submitQuizAnswers } from '../quiz.service';

const QUIZ_ID = 'quiz-grade-10-linear-equations-basic';
const NUMERIC_QUESTION = 'linear-q2'; // "After 2x = 10, what is x?", key "5"

async function gradeNumericAnswer(answer: string) {
  const result = await submitQuizAnswers('student-grading', QUIZ_ID, {
    answers: [{ question_id: NUMERIC_QUESTION, answer }],
  } as never);
  const scored = result.answers.find((entry) => entry.question_id === NUMERIC_QUESTION);
  if (!scored) throw new Error('graded answer missing from the attempt');
  return scored;
}

describe('maths quiz answers are graded by mathematical equivalence', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockVerifier(
    decide: (submitted: string, expected: string) => {
      status: string;
      equivalent: boolean;
    }
  ) {
    global.fetch = jest.fn(async (_url: unknown, init: unknown) => {
      const body = JSON.parse(String((init as { body?: string })?.body ?? '{}'));
      const verdict = decide(body.submitted_answer, body.expected_answer);
      return {
        ok: true,
        status: 200,
        json: async () => ({ ...verdict, detail: 'test verdict' }),
      };
    }) as never;
  }

  it.each([
    ['5', 'the exact key'],
    ['x = 5', 'the value restated with its variable'],
    ['10/2', 'an unreduced fraction'],
    ['5.0', 'a decimal form'],
  ])('accepts %p (%s)', async (answer) => {
    mockVerifier(() => ({ status: 'equivalent', equivalent: true }));
    const scored = await gradeNumericAnswer(answer);
    expect(scored.is_correct).toBe(true);
    expect(scored.score_awarded).toBe(1);
  });

  it('still rejects a genuinely wrong answer', async () => {
    mockVerifier(() => ({ status: 'different', equivalent: false }));
    const scored = await gradeNumericAnswer('4');
    expect(scored.is_correct).toBe(false);
    expect(scored.score_awarded).toBe(0);
  });

  it('records the verification method on the graded answer for admin review', async () => {
    mockVerifier(() => ({ status: 'equivalent', equivalent: true }));
    const scored = await gradeNumericAnswer('10/2');
    expect(scored.verification).toEqual(
      expect.objectContaining({ status: 'equivalent', source: 'verifier' })
    );
  });

  describe('when the verifier is unavailable', () => {
    it('does not mark a string-equal answer wrong', async () => {
      global.fetch = jest.fn(async () => {
        throw new Error('verifier unreachable');
      }) as never;

      const scored = await gradeNumericAnswer('5');
      expect(scored.is_correct).toBe(true);
    });

    it('flags an answer the fallback cannot decide, so a human can review it', async () => {
      global.fetch = jest.fn(async () => {
        throw new Error('verifier unreachable');
      }) as never;

      // The string comparison cannot tell that `x = 5` answers a key of `5`, so
      // the mark is withheld — but never silently.
      const scored = await gradeNumericAnswer('x = 5');
      expect(scored.verification).toEqual(
        expect.objectContaining({
          source: 'fallback_exact_match',
          needs_review: true,
        })
      );
    });

    it('does not ask for review when the fallback itself proves the answer', async () => {
      global.fetch = jest.fn(async () => {
        throw new Error('verifier unreachable');
      }) as never;

      const scored = await gradeNumericAnswer('10/2');
      expect(scored.is_correct).toBe(true);
      expect(scored.verification.needs_review).toBe(false);
    });

    it('treats cannot_verify the same way as an outage, not as a wrong answer', async () => {
      mockVerifier(() => ({ status: 'cannot_verify', equivalent: false }));
      const scored = await gradeNumericAnswer('5');
      expect(scored.is_correct).toBe(true);
      expect(scored.verification).toEqual(
        expect.objectContaining({ needs_review: true })
      );
    });
  });

  it('does not call the verifier for a multiple-choice question', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'equivalent', equivalent: true, detail: '' }),
    }));
    global.fetch = fetchMock as never;

    const result = await submitQuizAnswers('student-grading', QUIZ_ID, {
      answers: [{ question_id: 'linear-q1', selected_option_id: 'linear-q1-a' }],
    } as never);

    expect(result.answers[0].is_correct).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
