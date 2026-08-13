export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode = 500,
    isOperational = true,
    code = 'APP_ERROR',
    details?: unknown
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}
