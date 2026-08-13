import type { Request, Response } from 'express';
import type {
  CreateQuizRequestInput,
  GetQuizByTopicQueryInput,
  QuizIdParamsInput,
  QuizTopicParamsInput,
  SubmitQuizRequestInput,
} from '../schemas/quiz-request.schema';
import {
  createOrRetrieveQuiz,
  getQuizByTopic,
  submitQuizAnswers,
} from '../services/quiz.service';
import { asyncHandler } from '../utils/asyncHandler';
import { sendCreated, sendSuccess } from '../utils/ApiResponse';

export const getQuizForTopic = asyncHandler(async (req: Request, res: Response) => {
  const params = req.params as QuizTopicParamsInput;
  const quiz = await getQuizByTopic(req.user!.uid, params.topicId, req.query as GetQuizByTopicQueryInput);
  sendSuccess(res, quiz, 'Quiz retrieved successfully');
});

export const createQuiz = asyncHandler(async (req: Request, res: Response) => {
  const quiz = await createOrRetrieveQuiz(req.user!.uid, req.body as CreateQuizRequestInput);
  sendCreated(res, quiz, 'Quiz ready successfully');
});

export const submitQuiz = asyncHandler(async (req: Request, res: Response) => {
  const params = req.params as QuizIdParamsInput;
  const result = await submitQuizAnswers(
    req.user!.uid,
    params.quizId,
    req.body as SubmitQuizRequestInput
  );
  sendCreated(res, result, 'Quiz submitted successfully');
});
