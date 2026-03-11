import { ZodError } from 'zod';
import type { ErrorRequestHandler } from 'express';
import { DomainError } from '../services/roomService.js';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  req.log?.error({ err, path: req.path }, 'request_failed');
  if (err instanceof ZodError) return res.status(400).json({ error: { code: 'validation_error', message: err.issues[0]?.message ?? 'Invalid payload' } });
  if (err instanceof DomainError) return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  return res.status(500).json({ error: { code: 'internal_error', message: 'Unexpected server error' } });
};
