import type { Response } from 'express';
import type { RoomSnapshot } from '@nff/shared';

type RoomEventType = 'room.snapshot' | 'room.updated' | 'room.started';

interface RoomSubscriber {
  playerId: string;
  res: Response;
}

export class RoomEventsBroker {
  private subscribers = new Map<string, Set<RoomSubscriber>>();

  subscribe(roomCode: string, playerId: string, res: Response): () => void {
    const roomSubs = this.subscribers.get(roomCode) ?? new Set<RoomSubscriber>();
    const sub: RoomSubscriber = { playerId, res };
    roomSubs.add(sub);
    this.subscribers.set(roomCode, roomSubs);
    return () => {
      const current = this.subscribers.get(roomCode);
      if (!current) return;
      current.delete(sub);
      if (current.size === 0) this.subscribers.delete(roomCode);
    };
  }

  broadcast(roomCode: string, type: RoomEventType, payload: RoomSnapshot): void {
    const roomSubs = this.subscribers.get(roomCode);
    if (!roomSubs) return;
    for (const sub of roomSubs) {
      sub.res.write(`event: ${type}\n`);
      sub.res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }
  }
}
