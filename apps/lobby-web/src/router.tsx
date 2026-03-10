import React from 'react';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { LobbyPage } from './routes/LobbyPage';
import { RoomPage } from './routes/RoomPage';
import { GamePage } from './routes/GamePage';
import { api } from './api/client';

const rootRoute = createRootRoute({
  component: () => (
    <>
      <Outlet />
    </>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: LobbyPage,
});

const roomRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/room/$roomCode',
  beforeLoad: async ({ params }) => {
    try {
      await api.bootstrapCsrf();
      await api.me(params.roomCode);
    } catch {
      throw redirect({ to: '/', search: { error: 'Session expired. Join the room again.' } });
    }
  },
  component: RoomPage,
});

const gameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/game/$roomCode',
  beforeLoad: async ({ params }) => {
    const session = await api.me(params.roomCode);
    if (session.room.status !== 'in_game') {
      throw redirect({ to: '/room/$roomCode', params: { roomCode: params.roomCode } });
    }
  },
  component: GamePage,
});

const routeTree = rootRoute.addChildren([indexRoute, roomRoute, gameRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
