import { WebSocketServer } from 'ws';
import type WebSocket from 'ws';
import type { Server } from 'http';
import { parse as parseCookie } from 'cookie';
import { wsClientMessageSchema } from '@nff/shared';
import type { RoomService } from '../services/roomService.js';
import type { PlayerSessionRepository } from '../repositories/interfaces.js';
import type { SessionTokenService } from '../auth/sessionToken.js';

interface AuthedSocketState {
  roomCode: string;
  playerId: string;
}

export const startWs = (
  server: Server,
  roomService: RoomService,
  sessions: PlayerSessionRepository,
  tokenSvc: SessionTokenService,
) => {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const clientRooms = new WeakMap<WebSocket, AuthedSocketState>();

  wss.on('connection', async (socket, req) => {
    const url = new URL(req.url ?? '', 'http://localhost');
    const roomCode = url.searchParams.get('roomCode') ?? '';
    const token = parseCookie(req.headers.cookie ?? '').nff_session;

    if (!token) return socket.close(1008, 'Unauthorized');

    const parsed = await tokenSvc.verify(token);
    if (!parsed) return socket.close(1008, 'Unauthorized');

    const session = await sessions.findBySessionId(parsed.sid);
    if (!session || session.roomCode !== roomCode) return socket.close(1008, 'Unauthorized');

    try {
      await roomService.resolveMember(roomCode, session.playerId);
      clientRooms.set(socket, { roomCode, playerId: session.playerId });
      socket.send(JSON.stringify({ type: 'room.snapshot', payload: await roomService.getSnapshot(roomCode) }));
    } catch {
      return socket.close(1008, 'Unauthorized');
    }

    socket.on('message', async (data) => {
      let raw: unknown;
      try {
        raw = JSON.parse(data.toString());
      } catch {
        socket.send(JSON.stringify({ type: 'error', message: 'Invalid JSON message' }));
        return;
      }

      const parsedMsg = wsClientMessageSchema.safeParse(raw);
      if (!parsedMsg.success) {
        socket.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
        return;
      }

      const state = clientRooms.get(socket);
      if (!state) {
        socket.close(1008, 'Unauthorized');
        return;
      }

      if (parsedMsg.data.type === 'room.subscribe' && parsedMsg.data.roomCode !== state.roomCode) {
        socket.send(JSON.stringify({ type: 'error', message: 'Room mismatch' }));
        return;
      }

      if (parsedMsg.data.type === 'ping') {
        socket.send(JSON.stringify({ type: 'room.updated', payload: await roomService.getSnapshot(state.roomCode) }));
      }
    });
  });

  return {
    broadcastRoom: async (roomCode: string, type: 'room.updated' | 'room.started' = 'room.updated') => {
      try {
        const payload = await roomService.getSnapshot(roomCode);
        for (const client of wss.clients) {
          if (client.readyState !== 1) continue;
          const state = clientRooms.get(client as WebSocket);
          if (!state || state.roomCode !== roomCode) continue;
          client.send(JSON.stringify({ type, payload }));
        }
      } catch {
        // room could be deleted after leave; nothing to broadcast.
      }
    },
  };
};
