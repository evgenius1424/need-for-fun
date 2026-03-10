import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { displayNameSchema } from '@nff/shared';
import { api } from '../api/client';
import type { RoomListItem } from '../types';
import { ErrorBanner, LoadingState } from '../components/UI';
import { RoomCard } from '../components/RoomCard';

export const LobbyPage = () => {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      await api.bootstrapCsrf();
      const listResponse = await api.listRooms();
      setRooms(listResponse.rooms);
      setLoading(false);
    })().catch((e) => {
      setError((e as Error).message);
      setLoading(false);
    });
  }, []);

  const validName = useMemo(() => displayNameSchema.safeParse(displayName).success, [displayName]);

  const execute = async (action: () => Promise<{ room: { roomCode: string } }>) => {
    if (!validName) {
      setError('Please enter a valid display name');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      const response = await action();
      await navigate({ to: '/room/$roomCode', params: { roomCode: response.room.roomCode } });
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
      <input
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder="Display name"
      />
      <button disabled={!validName || submitting} onClick={() => execute(() => api.createRoom(displayName))}>
        Create room
      </button>
      {error ? <ErrorBanner>{error}</ErrorBanner> : null}
      <h2>Public rooms</h2>
      {loading ? (
        <LoadingState>Loading rooms...</LoadingState>
      ) : rooms.length === 0 ? (
        <p>No rooms yet.</p>
      ) : (
        <ul>
          {rooms.map((room) => (
            <RoomCard
              key={room.roomCode}
              room={room}
              disabled={!validName || submitting}
              onJoin={() => execute(() => api.joinRoom(room.roomCode, displayName))}
            />
          ))}
        </ul>
      )}
    </main>
  );
};
