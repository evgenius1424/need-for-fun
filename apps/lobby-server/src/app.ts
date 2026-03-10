import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import pino from 'pino';
import { randomUUID } from 'crypto';
import { InMemoryPlayerSessionRepository, InMemoryRoomRepository } from './repositories/inMemory.js';
import { RoomService } from './services/roomService.js';
import { SessionTokenService } from './auth/sessionToken.js';
import { buildRoutes } from './api/routes.js';
import { errorHandler } from './middleware/errors.js';

export const createApp = (onRoomChanged: (roomCode: string, eventType?: 'room.updated' | 'room.started') => Promise<void>) => {
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  const app = express();
  const rooms = new InMemoryRoomRepository();
  const sessions = new InMemoryPlayerSessionRepository();
  const roomService = new RoomService(rooms, sessions);
  const tokenSvc = new SessionTokenService(process.env.SESSION_SECRET ?? 'dev-secret-change-me');

  app.use(pinoHttp({ logger, genReqId: () => randomUUID() }));
  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5174', credentials: true }));
  app.use(express.json({ limit: '16kb' }));
  app.use(cookieParser());

  app.use('/api', buildRoutes(roomService, sessions, tokenSvc, onRoomChanged));
  app.use(errorHandler);

  return { app, roomService, sessions, tokenSvc };
};
