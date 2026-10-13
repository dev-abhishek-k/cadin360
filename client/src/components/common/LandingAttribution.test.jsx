import { StrictMode } from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import LandingAttribution, { getLandingSource } from './LandingAttribution.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ingestEvent } from '../../services/api.js';

vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../../services/api.js', () => ({ ingestEvent: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test('a Twitter guest landing creates a session and records one arrival without signup', async () => {
  const initGuestSession = vi.fn().mockResolvedValue({ success: true, guestCredential: 'guest-secret' });
  useAuth.mockReturnValue({ user: null, loading: false, guestCredential: null, initGuestSession });
  ingestEvent.mockResolvedValue({ data: { success: true } });

  render(
    <StrictMode>
      <MemoryRouter initialEntries={['/guest-dashboard/cad-practice/2d?utm_source=twitter']}>
        <LandingAttribution />
      </MemoryRouter>
    </StrictMode>
  );

  await waitFor(() => expect(ingestEvent).toHaveBeenCalledTimes(1));
  expect(initGuestSession).toHaveBeenCalledTimes(1);
  expect(ingestEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'short_link_opened',
      source: 'twitter',
      canonicalRoute: '/guest-dashboard/cad-practice/2d',
      originalRoute: '/guest-dashboard/cad-practice/2d?utm_source=twitter',
    }),
    'guest-secret'
  );
});

test('recognizes Twitter referral links without a query tag', () => {
  expect(getLandingSource('', 'https://t.co/example')).toBe('twitter');
  expect(getLandingSource('?ref=x')).toBe('twitter');
});
