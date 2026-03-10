import { useEffect, useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { api } from '../api/client';
import { ErrorBanner, LoadingState } from '../components/UI';

export const GamePage = () => {
  const { roomCode } = useParams({ from: '/game/$roomCode' });
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      await api.me(roomCode);
      await import('@game/app/bootstrap.js');
      setLoading(false);
    })().catch((e) => {
      setError((e as Error).message || 'Unable to load game bundle');
      setLoading(false);
    });
  }, [roomCode]);

  if (loading) return <LoadingState>Loading game bundle...</LoadingState>;

  return (
    <main className="game-shell">
      {error ? (
        <div className="container">
          <ErrorBanner>{error}</ErrorBanner>
          <button onClick={() => navigate({ to: '/room/$roomCode', params: { roomCode } })}>Back to room</button>
        </div>
      ) : (
        <>
          <div id="game" />
          <div id="console">
            <div id="console-content">
              NFF-WEB<br />Press <strong>~</strong> to toggle console. Type <strong>help</strong> for commands.
            </div>
            <input id="console-input" placeholder="Enter command..." />
          </div>
        </>
      )}
    </main>
  );
};
