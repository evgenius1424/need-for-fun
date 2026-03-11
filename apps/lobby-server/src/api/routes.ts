import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createRoomRequestSchema, joinRoomRequestSchema, roomCodeSchema } from '@nff/shared';
import type { RoomService } from '../services/roomService.js';
import { authMiddleware } from '../middleware/auth.js';
import type { PlayerSessionRepository } from '../repositories/interfaces.js';
import type { SessionTokenService } from '../auth/sessionToken.js';
import { issueCsrf, requireCsrf } from '../middleware/csrf.js';

export const buildRoutes = (
  roomService: RoomService,
  sessions: PlayerSessionRepository,
  tokenSvc: SessionTokenService,
  onRoomChanged: (roomCode: string, eventType?: 'room.updated' | 'room.started') => Promise<void>,
) => {
  const router = Router();
  const auth = authMiddleware(sessions, tokenSvc);
  const limiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
  const joinLimiter = rateLimit({ windowMs: 60_000, max: 15, standardHeaders: true, legacyHeaders: false });

  router.get('/csrf', issueCsrf);
  router.get('/rooms', limiter, async (_req, res) => res.json({ rooms: await roomService.listRooms() }));

  router.get('/rooms/:roomCode/events', auth, async (req, res) => {
    const roomCode = roomCodeSchema.parse(req.params.roomCode);
    if (req.auth?.roomCode !== roomCode) return res.status(403).json({ error: { code: 'forbidden', message: 'Session not for this room' } });
    await roomService.resolveMember(roomCode, req.auth.playerId);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    req.app.locals.sseSubscribe(roomCode, req.auth.playerId, res);
    res.write('event: room.snapshot\n');
    res.write(`data: ${JSON.stringify(await roomService.getSnapshot(roomCode))}\n\n`);
    const heartbeat = setInterval(() => res.write('event: ping\ndata: {}\n\n'), 15_000);

    req.on('close', () => {
      clearInterval(heartbeat);
    });
  });

  router.post('/rooms', limiter, requireCsrf, async (req, res) => {
    const parsed = createRoomRequestSchema.parse(req.body);
    const created = await roomService.createRoom(parsed.displayName, parsed.roomName);
    const token = await tokenSvc.sign(created.session.sessionId, created.session.expiresAt);
    res.cookie('nff_session', token, { httpOnly: true, sameSite: 'strict', secure: false, maxAge: 12 * 3600 * 1000 });
    await onRoomChanged(created.room.roomCode);
    res.status(201).json({ roomCode: created.room.roomCode, player: created.player, room: created.room });
  });

  router.post('/rooms/:roomCode/join', joinLimiter, requireCsrf, async (req, res) => {
    const roomCode = roomCodeSchema.parse(req.params.roomCode);
    const parsed = joinRoomRequestSchema.parse(req.body);
    const joined = await roomService.joinRoom(roomCode, parsed.displayName);
    const token = await tokenSvc.sign(joined.session.sessionId, joined.session.expiresAt);
    res.cookie('nff_session', token, { httpOnly: true, sameSite: 'strict', secure: false, maxAge: 12 * 3600 * 1000 });
    await onRoomChanged(roomCode);
    res.json({ room: joined.room, player: joined.player });
  });

  router.get('/rooms/:roomCode', auth, async (req, res) => {
    const roomCode = roomCodeSchema.parse(req.params.roomCode);
    if (req.auth?.roomCode !== roomCode) return res.status(403).json({ error: { code: 'forbidden', message: 'Session not for this room' } });
    await roomService.resolveMember(roomCode, req.auth.playerId);
    res.json({ room: await roomService.getSnapshot(roomCode) });
  });

  router.post('/rooms/:roomCode/leave', auth, requireCsrf, async (req, res) => {
    const roomCode = roomCodeSchema.parse(req.params.roomCode);
    if (req.auth?.roomCode !== roomCode) return res.status(403).json({ error: { code: 'forbidden', message: 'Session not for this room' } });
    await roomService.leaveRoom(roomCode, req.auth.playerId);
    await onRoomChanged(roomCode);
    res.clearCookie('nff_session');
    res.status(204).send();
  });

  router.post('/rooms/:roomCode/start', auth, requireCsrf, async (req, res) => {
    const roomCode = roomCodeSchema.parse(req.params.roomCode);
    if (req.auth?.roomCode !== roomCode) return res.status(403).json({ error: { code: 'forbidden', message: 'Session not for this room' } });
    const room = await roomService.startGame(roomCode, req.auth.playerId);
    await onRoomChanged(roomCode, 'room.started');
    res.json({ room });
  });

  router.get('/session/me', auth, async (req, res) => {
    const roomCode = req.query.roomCode ? roomCodeSchema.parse(req.query.roomCode) : req.auth!.roomCode;
    if (req.auth?.roomCode !== roomCode) return res.status(401).json({ error: { code: 'unauthorized', message: 'Session room mismatch' } });
    const { room, player } = await roomService.resolveMember(roomCode, req.auth.playerId);
    res.json({ player, room: { roomCode: room.roomCode, roomName: room.roomName, status: room.status } });
  });

  return router;
};
