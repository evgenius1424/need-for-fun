import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { api } from '../api/client';
import type { Player, RoomSnapshot } from '../types';
import { PlayerList } from '../components/PlayerList';
import { ErrorBanner, LoadingState } from '../components/UI';
import { useRoomSocket } from '../hooks/useRoomSocket';

export const RoomPage = () => {
  const { roomCode } = useParams({ from: '/room/$roomCode' });
  const navigate = useNavigate();
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [error, setError] = useState('');

  const onSnapshot = useCallback((snapshot: RoomSnapshot) => setRoom(snapshot), []);
  const onError = useCallback((msg: string) => setError(msg), []);
  useRoomSocket(roomCode, onSnapshot, onError);

  useEffect(() => {
    (async () => {
      const me = await api.me(roomCode);
      setPlayer(me.player);
      const roomResponse = await api.room(roomCode);
      setRoom(roomResponse.room);
    })().catch(() => {
      setError('Session invalid. Please rejoin from lobby.');
      setTimeout(() => {
        void navigate({ to: '/' });
      }, 1200);
    });
  }, [roomCode, navigate]);

  if (!room || !player) return <LoadingState>Loading room...</LoadingState>;

  return (
    <main className="container">
      <h1>{room.roomName}</h1>
      <p>
        Room code: <code>{room.roomCode}</code>
      </p>
      <p>Status: {room.status}</p>
      {error ? <ErrorBanner>{error}</ErrorBanner> : null}
      <PlayerList players={room.players} />
      {player.role === 'host' ? (
        <button
          onClick={() =>
            api
              .start(roomCode)
              .then(() => navigate({ to: '/game/$roomCode', params: { roomCode } }))
              .catch((e) => setError(e.message))
          }
        >
          Start game
        </button>
      ) : null}
      <button onClick={() => api.leave(roomCode).then(() => navigate({ to: '/' })).catch((e) => setError(e.message))}>
        Leave room
      </button>
    </main>
  );
};
