import { Response } from 'express';

type ApiResponseBody<T> = {
  success: true;
  message: string;
  data: T;
};

export function sendSuccess<T>(
  res: Response,
  data: T,
  message = 'Success'
): Response<ApiResponseBody<T>> {
  return res.status(200).json({
    success: true,
    message,
    data,
  });
}

export function sendCreated<T>(
  res: Response,
  data: T,
  message = 'Created'
): Response<ApiResponseBody<T>> {
  return res.status(201).json({
    success: true,
    message,
    data,
  });
}

export function sendNoContent(res: Response): Response {
  return res.status(204).send();
}
