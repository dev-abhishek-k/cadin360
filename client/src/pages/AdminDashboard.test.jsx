import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AdminDashboard from './AdminDashboard.jsx';
import { fetchAdminJourneys } from '../services/api.js';
import * as AuthContextModule from '../context/AuthContext.jsx';

vi.mock('../services/api.js', () => ({
  fetchAdminJourneys: vi.fn(),
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
    <MemoryRouter>
      <AdminDashboard />
    </MemoryRouter>
  );
  expect(screen.getByText('Access Denied')).toBeDefined();
  expect(screen.getByText(/Required: admin/)).toBeDefined();
});

test('renders summary cards and journeys table when user is admin', async () => {
  vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
    user: { id: 'admin1', name: 'Admin Jane', email: 'admin@example.com', role: 'admin' },
    loading: false,
  });

  fetchAdminJourneys.mockResolvedValue({
    data: {
      success: true,
      data: {
        journeys: [
          {
            journeyId: 'user_u100',
            identityType: 'user',
            displayIdentity: 'Visitor Alice',
            firstActivityAt: '2026-10-10T09:00:00.000Z',
            lastActivityAt: '2026-10-10T09:30:00.000Z',
            firstSource: 'youtube',
            uniqueEventCount: 4,
            stages: { arrived: true, explored: true, signedUp: true, paid: false },
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
        summaryMetrics: {
          totalJourneys: 1,
          arrived: 1,
          explored: 1,
          signedUp: 1,
          paid: 0,
        },
      },
    },
  });

  render(
    <MemoryRouter>
      <AdminDashboard />
    </MemoryRouter>
  );

  await waitFor(() => {
    expect(screen.getByText('Admin Journey Dashboard')).toBeDefined();
    expect(screen.getByText('Visitor Alice')).toBeDefined();
    expect(screen.getByText('user_u100')).toBeDefined();
    expect(screen.getByText('youtube')).toBeDefined();
    expect(screen.getByText('View Details')).toBeDefined();
  });
});
