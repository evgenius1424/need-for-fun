import type { Player, RoomListItem, RoomSnapshot } from '../types';

const API = import.meta.env.VITE_LOBBY_API_URL ?? 'http://localhost:3000/api';
let csrf = '';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(csrf ? { 'x-csrf-token': csrf } : {}),
    },
    ...init,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error?.message ?? 'Request failed');
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  async bootstrapCsrf() {
    const data = await req<{ csrfToken: string }>('/csrf');
    csrf = data.csrfToken;
  },
  listRooms: () => req<{ rooms: RoomListItem[] }>('/rooms'),
  createRoom: (displayName: string, roomName?: string) =>
    req<{ room: RoomSnapshot; player: Player }>('/rooms', {
      method: 'POST',
      body: JSON.stringify({ displayName, roomName }),
    }),
  joinRoom: (roomCode: string, displayName: string) =>
    req<{ room: RoomSnapshot; player: Player; restored: boolean }>(`/rooms/${roomCode}/join`, {
      method: 'POST',
      body: JSON.stringify({ displayName }),
    }),
  me: (roomCode: string) => req<{ room: { roomCode: string; status: 'waiting' | 'in_game' }; player: Player }>(`/session/me?roomCode=${roomCode}`),
  room: (roomCode: string) => req<{ room: RoomSnapshot }>(`/rooms/${roomCode}`),
  start: (roomCode: string) => req<{ room: RoomSnapshot }>(`/rooms/${roomCode}/start`, { method: 'POST', body: '{}' }),
  leave: (roomCode: string) => req<void>(`/rooms/${roomCode}/leave`, { method: 'POST', body: '{}' }),
};
