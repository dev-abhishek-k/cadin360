import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import JourneyDetails from './JourneyDetails.jsx';
import { fetchAdminJourneyDetails } from '../services/api.js';
import * as AuthContextModule from '../context/AuthContext.jsx';

vi.mock('../services/api.js', () => ({
  fetchAdminJourneyDetails: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test('renders Access Denied when user is not an admin', () => {
  vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
    user: { id: 'u1', name: 'John Doe', email: 'john@example.com', role: 'user' },
    loading: false,
  });

  render(
    <MemoryRouter initialEntries={['/admin/journeys/user_u1']}>
      <Routes>
        <Route path="/admin/journeys/:journeyId" element={<JourneyDetails />} />
      </Routes>
    </MemoryRouter>
  );

  expect(screen.getByText('Access Denied')).toBeDefined();
  expect(screen.getByText(/Administrator permissions are required/)).toBeDefined();
});

test('renders Journey Not Found state when API returns 404', async () => {
  vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
    user: { id: 'admin1', name: 'Admin Jane', email: 'admin@example.com', role: 'admin' },
    loading: false,
  });

  fetchAdminJourneyDetails.mockRejectedValue({
    response: {
      status: 404,
      data: { message: 'Journey with ID "user_unknown" not found' },
    },
  });

  render(
    <MemoryRouter initialEntries={['/admin/journeys/user_unknown']}>
      <Routes>
        <Route path="/admin/journeys/:journeyId" element={<JourneyDetails />} />
      </Routes>
    </MemoryRouter>
  );

  await waitFor(() => {
    expect(screen.getByText('Journey Not Found')).toBeDefined();
    expect(screen.getByText('Return to Dashboard')).toBeDefined();
  });
});

test('renders journey identity, summary metrics, stage progression, and event timeline', async () => {
  vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
    user: { id: 'admin1', name: 'Admin Jane', email: 'admin@example.com', role: 'admin' },
    loading: false,
  });

  fetchAdminJourneyDetails.mockResolvedValue({
    data: {
      success: true,
      data: {
        journeyId: 'user_u100',
        identityType: 'user',
        displayIdentity: 'Alice Cooper',
        email: 'alice@test.com',
        firstActivityAt: '2026-10-10T09:00:00.000Z',
        lastActivityAt: '2026-10-10T09:30:00.000Z',
        firstSource: 'youtube',
        uniqueEventCount: 3,
        stages: { arrived: true, explored: true, signedUp: true, paid: false },
        stageDetails: {
          arrived: { reached: true, reachedAt: '2026-10-10T09:00:00.000Z' },
          explored: { reached: true, reachedAt: '2026-10-10T09:10:00.000Z' },
          signedUp: { reached: true, reachedAt: '2026-10-10T09:20:00.000Z' },
          paid: { reached: false, reachedAt: null },
        },
        associatedGuestSessionCount: 1,
        associatedGuestSessions: [
          { guestSessionId: 'g_session_abc', createdAt: '2026-10-10T08:50:00.000Z' },
        ],
        timeline: [
          {
            eventId: 'evt_1',
            type: 'short_link_opened',
            occurredAt: '2026-10-10T09:00:00.000Z',
            receivedAt: '2026-10-10T09:00:01.000Z',
            canonicalRoute: '/pricing',
            originalRoute: '/pricing?ref=yt',
            canonicalLabel: 'Plans',
            source: 'youtube',
          },
          {
            eventId: 'evt_2',
            type: 'page_viewed',
            occurredAt: '2026-10-10T09:10:00.000Z',
            receivedAt: '2026-10-10T09:10:01.000Z',
            canonicalRoute: '/guest-dashboard/cad-practice/2d',
            originalRoute: '/guest-dashboard/cad-practice/2d',
            canonicalLabel: '2D Exercises',
          },
        ],
        pagination: {
          page: 1,
          limit: 50,
          total: 2,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
      },
    },
  });

  render(
    <MemoryRouter initialEntries={['/admin/journeys/user_u100']}>
      <Routes>
        <Route path="/admin/journeys/:journeyId" element={<JourneyDetails />} />
      </Routes>
    </MemoryRouter>
  );

  await waitFor(() => {
    expect(screen.getByText('Alice Cooper')).toBeDefined();
  });

  expect(screen.getByText('Registered User')).toBeDefined();
  expect(screen.getAllByText('user_u100').length).toBeGreaterThanOrEqual(1);
  expect(screen.getAllByText(/youtube/i).length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText('Journey Stage Progression')).toBeDefined();
  expect(screen.getByText('Arrived')).toBeDefined();
  expect(screen.getByText('Explored')).toBeDefined();
  expect(screen.getByText('Signed Up')).toBeDefined();
  expect(screen.getByText('Paid')).toBeDefined();
  expect(screen.getByText('guest_g_session_abc')).toBeDefined();
  expect(screen.getByText('Event Timeline')).toBeDefined();
  expect(screen.getByText('short_link_opened')).toBeDefined();
  expect(screen.getByText('page_viewed')).toBeDefined();
  expect(screen.getByText('Plans')).toBeDefined();
  expect(screen.getByText('2D Exercises')).toBeDefined();
  expect(screen.getByText('Back to Journeys')).toBeDefined();
});
