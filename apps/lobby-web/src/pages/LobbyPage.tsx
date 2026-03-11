import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { displayNameSchema, roomNameSchema } from '@nff/shared';
import { api } from '../api/client';
import type { RoomListItem } from '../types';
import { ErrorBanner, LoadingState } from '../components/UI';
import { RoomCard } from '../components/RoomCard';

export const LobbyPage = () => {
  const [displayName, setDisplayName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      await api.bootstrapCsrf();
      const r = await api.listRooms();
      setRooms(r.rooms);
      setLoading(false);
    })().catch((e) => {
      setError(e.message);
      setLoading(false);
    });
  }, []);

  const validName = displayNameSchema.safeParse(displayName).success;
  const validRoomName = roomName.trim().length === 0 || roomNameSchema.safeParse(roomName).success;

  const withAction = async (action: () => Promise<{ room: { roomCode: string } }>) => {
    if (!validName) return setError('Please enter a valid display name');
    if (!validRoomName) return setError('Room name must be 2-40 chars with letters, numbers, spaces, _ or -');
    try {
      setSubmitting(true);
      setError('');
      const r = await action();
      navigate(`/room/${r.room.roomCode}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="container">
      <h1>Need For Fun Lobby</h1>
      <p>Join or create a room</p>
      <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" />
      <input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="Optional room name" />
      <button disabled={!validName || !validRoomName || submitting} onClick={() => withAction(() => api.createRoom(displayName, roomName || undefined))}>
        Create room
      </button>
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <h2>Public rooms</h2>
      {loading ? (
        <LoadingState>Loading rooms...</LoadingState>
      ) : rooms.length === 0 ? (
        <p>No rooms yet.</p>
      ) : (
        <ul>{rooms.map((room) => <RoomCard key={room.roomCode} room={room} disabled={!validName || submitting} onJoin={() => withAction(() => api.joinRoom(room.roomCode, displayName))} />)}</ul>
      )}
    </main>
  );
};
