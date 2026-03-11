import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LobbyPage } from '../pages/LobbyPage';
import { vi, test, expect } from 'vitest';

vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => url.includes('/csrf') ? { csrfToken: 'x' } : { rooms: [] } })) as any);

test('renders lobby title', async () => {
  render(<MemoryRouter><LobbyPage /></MemoryRouter>);
  expect(await screen.findByText('Need For Fun Lobby')).toBeTruthy();
});
