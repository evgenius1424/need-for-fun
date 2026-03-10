import { useEffect } from 'react';
import type { RoomSnapshot } from '../types';

const getWsBase = () => {
  if (typeof window === 'undefined') return 'ws://localhost:3000';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//localhost:3000`;
};

export const useRoomSocket = (
  roomCode: string,
  onSnapshot: (room: RoomSnapshot) => void,
  onError: (message: string) => void,
) => {
  useEffect(() => {
    const ws = new WebSocket(`${getWsBase()}/ws?roomCode=${roomCode}`);

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'error') onError(msg.message);
      if (msg.payload) onSnapshot(msg.payload);
    };

    ws.onopen = () => ws.send(JSON.stringify({ type: 'room.subscribe', roomCode }));
    ws.onclose = () => onError('Disconnected from room updates');

    return () => ws.close();
  }, [roomCode, onSnapshot, onError]);
};
