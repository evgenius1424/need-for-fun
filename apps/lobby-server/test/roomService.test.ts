import { describe, it, expect } from 'vitest';
import { RoomService } from '../src/services/roomService.js';
import { InMemoryPlayerSessionRepository, InMemoryRoomRepository } from '../src/repositories/inMemory.js';

describe('RoomService', () => {
  it('creates room and host, transfers host on leave', async () => {
    const service = new RoomService(new InMemoryRoomRepository(), new InMemoryPlayerSessionRepository());
    const created = await service.createRoom('Alice');
    const joined = await service.joinRoom(created.room.roomCode, 'Bob');
    await service.leaveRoom(created.room.roomCode, created.player.playerId);
    const snap = await service.getSnapshot(created.room.roomCode);
    expect(snap.players[0].playerId).toBe(joined.player.playerId);
    expect(snap.players[0].role).toBe('host');
  });
});
