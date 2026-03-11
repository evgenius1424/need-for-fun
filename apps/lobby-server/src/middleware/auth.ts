import type { RequestHandler } from 'express';
import type { PlayerSessionRepository } from '../repositories/interfaces.js';
import type { SessionTokenService } from '../auth/sessionToken.js';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: { sessionId: string; playerId: string; roomCode: string };
  }
}

export const authMiddleware = (sessions: PlayerSessionRepository, tokenSvc: SessionTokenService): RequestHandler => async (req, res, next) => {
  const token = req.cookies?.nff_session;
  if (!token) return res.status(401).json({ error: { code: 'unauthorized', message: 'Missing session' } });
  const parsed = await tokenSvc.verify(token);
  if (!parsed) return res.status(401).json({ error: { code: 'unauthorized', message: 'Invalid session' } });
  const session = await sessions.findBySessionId(parsed.sid);
  if (!session || session.expiresAt <= new Date()) return res.status(401).json({ error: { code: 'unauthorized', message: 'Expired session' } });
  req.auth = { sessionId: session.sessionId, playerId: session.playerId, roomCode: session.roomCode };
  next();
};
