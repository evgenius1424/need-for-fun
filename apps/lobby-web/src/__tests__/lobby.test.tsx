import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import { vi, test, expect } from 'vitest';
import { router } from '../router';

vi.stubGlobal(
  'fetch',
  vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => (url.includes('/csrf') ? { csrfToken: 'x' } : { rooms: [] }),
  })) as never,
);

test('renders lobby title', async () => {
  const history = createMemoryHistory({ initialEntries: ['/'] });
  router.update({ history });
  render(<RouterProvider router={router} />);
  expect(await screen.findByText('Need For Fun Lobby')).toBeTruthy();
});
