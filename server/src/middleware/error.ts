import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../lib/logger.js';

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: 'not_found' });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'validation_error', issues: err.flatten() });
    return;
  }
  if (err && typeof err === 'object' && 'statusCode' in err) {
    const e = err as { statusCode: number; message?: string; code?: string };
    res.status(e.statusCode).json({ error: e.code ?? 'error', message: e.message });
    return;
  }
  logger.error({ err }, 'unhandled error');
  res.status(500).json({ error: 'internal_error' });
}

export class HttpError extends Error {
  statusCode: number;
  code: string;
  constructor(statusCode: number, code: string, message?: string) {
    super(message ?? code);
    this.statusCode = statusCode;
    this.code = code;
  }
}
