import type { PlayerSession, Room } from '../domain/entities.js';
import type { PlayerSessionRepository, RoomRepository } from './interfaces.js';

export class InMemoryRoomRepository implements RoomRepository {
  private rooms = new Map<string, Room>();
  async create(room: Room): Promise<void> { this.rooms.set(room.roomCode, room); }
  async save(room: Room): Promise<void> { this.rooms.set(room.roomCode, room); }
  async findByCode(roomCode: string): Promise<Room | null> { return this.rooms.get(roomCode) ?? null; }
  async listPublic(): Promise<Room[]> { return [...this.rooms.values()].filter((r) => r.players.length > 0); }
  async delete(roomCode: string): Promise<void> { this.rooms.delete(roomCode); }
}

export class InMemoryPlayerSessionRepository implements PlayerSessionRepository {
  private sessions = new Map<string, PlayerSession>();
  async create(session: PlayerSession): Promise<void> { this.sessions.set(session.sessionId, session); }
  async findBySessionId(sessionId: string): Promise<PlayerSession | null> { return this.sessions.get(sessionId) ?? null; }
  async delete(sessionId: string): Promise<void> { this.sessions.delete(sessionId); }
  async deleteByPlayer(roomCode: string, playerId: string): Promise<void> {
    for (const [key, session] of this.sessions.entries()) if (session.roomCode === roomCode && session.playerId === playerId) this.sessions.delete(key);
  }
  async deleteExpired(now: Date): Promise<void> {
    for (const [key, session] of this.sessions.entries()) if (session.expiresAt <= now) this.sessions.delete(key);
  }
}
