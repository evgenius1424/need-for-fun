import type { RoomListItem, RoomSnapshot, Player } from '../types';

const API = '/api';
let csrf = '';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, { credentials: 'include', headers: { 'content-type': 'application/json', ...(csrf ? { 'x-csrf-token': csrf } : {}) }, ...init });
  if (!r.ok) throw new Error((await r.json()).error?.message ?? 'Request failed');
  return (r.status === 204 ? undefined : await r.json()) as T;
}

export const api = {
  async bootstrapCsrf() { const data = await req<{ csrfToken: string }>('/csrf'); csrf = data.csrfToken; },
  listRooms: () => req<{ rooms: RoomListItem[] }>('/rooms'),
  createRoom: (displayName: string, roomName?: string) => req<{ room: RoomSnapshot; player: Player }>('/rooms', { method: 'POST', body: JSON.stringify({ displayName, roomName }) }),
  joinRoom: (roomCode: string, displayName: string) => req<{ room: RoomSnapshot; player: Player }>(`/rooms/${roomCode}/join`, { method: 'POST', body: JSON.stringify({ displayName }) }),
  me: (roomCode: string) => req<{ room: { roomCode: string }; player: Player }>(`/session/me?roomCode=${roomCode}`),
  room: (roomCode: string) => req<{ room: RoomSnapshot }>(`/rooms/${roomCode}`),
  start: (roomCode: string) => req<{ room: RoomSnapshot }>(`/rooms/${roomCode}/start`, { method: 'POST', body: '{}' }),
  leave: (roomCode: string) => req<void>(`/rooms/${roomCode}/leave`, { method: 'POST', body: '{}' }),
};
