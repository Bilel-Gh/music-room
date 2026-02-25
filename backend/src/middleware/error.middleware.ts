import type { ErrorRequestHandler } from 'express';

interface AppError extends Error {
  status?: number;
}

export const errorHandler: ErrorRequestHandler = (err: AppError, _req, res, _next) => {
  const status = err.status || 500;
  const message = status === 500 ? 'Internal server error' : err.message;

  if (status === 500) {
    console.error(err);
  }

  res.status(status).json({ success: false, error: message });
};
