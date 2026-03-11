import { v4 as uuidv4 } from 'uuid';
import type { Player, PlayerRole, Room } from '../domain/entities.js';
import type { PlayerSessionRepository, RoomRepository } from '../repositories/interfaces.js';

export class DomainError extends Error { constructor(public readonly code: string, message: string, public readonly status = 400) { super(message); } }

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const generateRoomCode = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

const toSnapshot = (room: Room) => ({ roomCode: room.roomCode, roomName: room.roomName, status: room.status, players: room.players, maxPlayers: room.maxPlayers });

export class RoomService {
  constructor(private rooms: RoomRepository, private sessions: PlayerSessionRepository) {}

  async listRooms() { return (await this.rooms.listPublic()).map((r) => ({ roomName: r.roomName, roomCode: r.roomCode, playersCount: r.players.length, maxPlayers: r.maxPlayers, status: r.status })); }

  async createRoom(displayName: string, roomName?: string) {
    const room: Room = { roomId: uuidv4(), roomCode: generateRoomCode(), roomName: roomName ?? `${displayName}'s room`, status: 'waiting', maxPlayers: 8, players: [], createdAt: new Date() };
    const player = this.createPlayer(displayName, 'host');
    room.players.push(player);
    await this.rooms.create(room);
    const session = await this.createSession(room.roomCode, player.playerId);
    return { room: toSnapshot(room), player, session };
  }

  async joinRoom(roomCode: string, displayName: string) {
    const room = await this.mustRoom(roomCode);
    if (room.players.length >= room.maxPlayers) throw new DomainError('room_full', 'Room is full', 409);
    if (room.status !== 'waiting') throw new DomainError('room_closed', 'Room is not joinable', 409);
    const player = this.createPlayer(displayName, 'player');
    room.players.push(player);
    await this.rooms.save(room);
    const session = await this.createSession(room.roomCode, player.playerId);
    return { room: toSnapshot(room), player, session };
  }

  async resolveMember(roomCode: string, playerId: string) {
    const room = await this.mustRoom(roomCode);
    const player = room.players.find((p) => p.playerId === playerId);
    if (!player) throw new DomainError('forbidden', 'Not a member', 403);
    return { room, player };
  }

  async leaveRoom(roomCode: string, playerId: string) {
    const room = await this.mustRoom(roomCode);
    const existing = room.players.find((p) => p.playerId === playerId);
    if (!existing) throw new DomainError('forbidden', 'Not a member', 403);
    room.players = room.players.filter((p) => p.playerId !== playerId);
    await this.sessions.deleteByPlayer(roomCode, playerId);
    if (room.players.length === 0) return this.rooms.delete(roomCode);
    if (existing.role === 'host') room.players[0].role = 'host';
    await this.rooms.save(room);
  }

  async startGame(roomCode: string, playerId: string) {
    const { room, player } = await this.resolveMember(roomCode, playerId);
    if (player.role !== 'host') throw new DomainError('forbidden', 'Only host can start', 403);
    room.status = 'in_game';
    await this.rooms.save(room);
    return toSnapshot(room);
  }

  async getSnapshot(roomCode: string) { return toSnapshot(await this.mustRoom(roomCode)); }

  async createSession(roomCode: string, playerId: string) {
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 12);
    const session = { sessionId: uuidv4(), roomCode, playerId, expiresAt };
    await this.sessions.create(session);
    return session;
  }

  private createPlayer(displayName: string, role: PlayerRole): Player { return { playerId: uuidv4(), displayName, role, connected: true }; }
  private async mustRoom(roomCode: string) { const room = await this.rooms.findByCode(roomCode); if (!room) throw new DomainError('not_found', 'Room not found', 404); return room; }
}
