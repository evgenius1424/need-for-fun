import { randomUUID } from 'crypto';
import type { RequestHandler } from 'express';

export const issueCsrf: RequestHandler = (_req, res) => {
  const token = randomUUID();
  res.cookie('nff_csrf', token, { httpOnly: false, sameSite: 'strict', secure: false });
  res.json({ csrfToken: token });
};

export const requireCsrf: RequestHandler = (req, res, next) => {
  const cookieToken = req.cookies?.nff_csrf;
  const headerToken = req.header('x-csrf-token');
  if (!cookieToken || !headerToken || cookieToken !== headerToken) return res.status(403).json({ error: { code: 'csrf_invalid', message: 'Invalid CSRF token' } });
  next();
};
