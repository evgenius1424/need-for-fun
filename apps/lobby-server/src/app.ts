import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import pino from 'pino';
import { randomUUID } from 'crypto';
import path from 'path';
import { InMemoryPlayerSessionRepository, InMemoryRoomRepository } from './repositories/inMemory.js';
import { RoomService } from './services/roomService.js';
import { SessionTokenService } from './auth/sessionToken.js';
import { buildRoutes } from './api/routes.js';
import { errorHandler } from './middleware/errors.js';
import { RoomEventsBroker } from './sse/roomEvents.js';

export const createApp = () => {
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  const app = express();
  const rooms = new InMemoryRoomRepository();
  const sessions = new InMemoryPlayerSessionRepository();
  const roomService = new RoomService(rooms, sessions);
  const tokenSvc = new SessionTokenService(process.env.SESSION_SECRET ?? 'dev-secret-change-me');
  const broker = new RoomEventsBroker();

  app.locals.sseSubscribe = (roomCode, _playerId, res) => {
    const unsubscribe = broker.subscribe(roomCode, _playerId, res);
    res.on('close', unsubscribe);
  };
  app.use(pinoHttp({ logger, genReqId: () => randomUUID() }));
  app.use(helmet());
  const allowedOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5174';
  app.use(cors({ origin: allowedOrigin, credentials: true }));
  app.use(express.json({ limit: '16kb' }));
  app.use(cookieParser());

  app.use(
    '/api',
    buildRoutes(roomService, sessions, tokenSvc, async (roomCode, eventType = 'room.updated') => {
      const snapshot = await roomService.getSnapshot(roomCode);
      broker.broadcast(roomCode, eventType === 'room.started' ? 'room.started' : 'room.updated', snapshot);
    }),
  );

  const webDist = path.resolve(process.cwd(), 'apps/lobby-web/dist');
  app.use(express.static(webDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(webDist, 'index.html'));
  });

  app.use(errorHandler);

  return { app };
};
