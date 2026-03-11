import { useEffect } from 'react';
import type { RoomSnapshot } from '../types';

export const useRoomEvents = (roomCode: string, onSnapshot: (room: RoomSnapshot) => void, onError: (message: string) => void) => {
  useEffect(() => {
    const source = new EventSource(`/api/rooms/${roomCode}/events`, { withCredentials: true });
    const handler = (event: MessageEvent) => onSnapshot(JSON.parse(event.data) as RoomSnapshot);

    source.addEventListener('room.snapshot', handler as EventListener);
    source.addEventListener('room.updated', handler as EventListener);
    source.addEventListener('room.started', handler as EventListener);

    source.onerror = () => onError('Live updates disconnected. Retrying...');

    return () => source.close();
  }, [roomCode, onSnapshot, onError]);
};
