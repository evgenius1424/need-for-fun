import type { PlayerSession, Room } from '../domain/entities.js';

export interface RoomRepository {
  create(room: Room): Promise<void>;
  save(room: Room): Promise<void>;
  findByCode(roomCode: string): Promise<Room | null>;
  listPublic(): Promise<Room[]>;
  delete(roomCode: string): Promise<void>;
}

export interface PlayerSessionRepository {
  create(session: PlayerSession): Promise<void>;
  findBySessionId(sessionId: string): Promise<PlayerSession | null>;
  delete(sessionId: string): Promise<void>;
  deleteByPlayer(roomCode: string, playerId: string): Promise<void>;
  deleteExpired(now: Date): Promise<void>;
}
