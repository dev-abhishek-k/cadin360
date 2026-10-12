import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Plans from './Plans.jsx';
import ToastContainer from '../components/common/ToastContainer.jsx';
import * as api from '../services/api.js';
import { AuthProvider } from '../context/AuthContext.jsx';
import { ToastProvider } from '../context/ToastContext.jsx';

vi.mock('../services/api.js', () => ({
  fetchCurrentUser: vi.fn(),
  fetchPlans: vi.fn(),
  createMockPaymentAttempt: vi.fn(),
  simulateMockPayment: vi.fn(),
  fetchJourneySummary: vi.fn(),
  fetchHealth: vi.fn(),
  createGuestSession: vi.fn(),
  fetchGuestSession: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test('Plans page renders available mock plans loaded from backend', async () => {
  api.createGuestSession.mockResolvedValue({ data: { success: true, guestCredential: 'mock_guest_cred' } });
  api.fetchCurrentUser.mockRejectedValue(new Error('unauthenticated'));
  api.fetchJourneySummary.mockResolvedValue({ data: { data: { stages: { paid: false } } } });
  api.fetchPlans.mockResolvedValueOnce({
    data: {
      success: true,
      data: [
        { id: 'starter', name: 'Starter Modeler', amount: 29, currency: 'USD', features: ['2D Tools'] },
        { id: 'pro', name: 'Professional Engineer', amount: 79, currency: 'USD', features: ['3D Assemblies'] },
      ],
    },
  });

  render(
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>
          <Plans />
          <ToastContainer />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );

  await waitFor(() => {
    expect(screen.getByText('Starter Modeler')).toBeTruthy();
    expect(screen.getByText('Professional Engineer')).toBeTruthy();
    expect(screen.getByText('$29')).toBeTruthy();
    expect(screen.getByText('$79')).toBeTruthy();
  });
});

test('Creates mock payment attempt and simulates verified success', async () => {
  api.createGuestSession.mockResolvedValue({ data: { success: true, guestCredential: 'mock_guest_cred' } });
  api.fetchCurrentUser.mockResolvedValue({
    data: { success: true, user: { id: 'u1', name: 'Tester', email: 'test@example.com', role: 'user' } },
  });
  api.fetchJourneySummary.mockResolvedValue({ data: { data: { stages: { paid: false } } } });
  api.fetchPlans.mockResolvedValueOnce({
    data: {
      success: true,
      data: [
        { id: 'pro', name: 'Professional Engineer', amount: 79, currency: 'USD', features: ['3D Assemblies'] },
      ],
    },
  });

  api.createMockPaymentAttempt.mockResolvedValueOnce({
    data: {
      success: true,
      data: {
        paymentAttemptId: 'pay_att_test_123',
        planId: 'pro',
        planName: 'Professional Engineer',
        amount: 79,
        currency: 'USD',
        status: 'pending',
        journeyIdentity: 'user_u1',
      },
    },
  });

  api.simulateMockPayment.mockResolvedValueOnce({
    data: {
      success: true,
      verified: true,
      duplicate: false,
      message: 'Payment verified successfully',
      data: {
        paymentAttemptId: 'pay_att_test_123',
        planId: 'pro',
        planName: 'Professional Engineer',
        amount: 79,
        currency: 'USD',
        status: 'succeeded',
      },
      event: { eventId: 'pay_evt_pay_att_test_123' },
    },
  });

  render(
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>
          <Plans />
          <ToastContainer />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );

  await waitFor(() => {
    expect(screen.getByText('Professional Engineer')).toBeTruthy();
  });

  const createBtn = screen.getByRole('button', { name: /Create Mock Payment Attempt/i });
  await userEvent.click(createBtn);

  await waitFor(() => {
    expect(screen.getByText('Active Payment Attempt')).toBeTruthy();
    expect(screen.getByText('pay_att_test_123')).toBeTruthy();
  });

  const successBtn = screen.getByRole('button', { name: /Simulate Verified Success/i });
  await userEvent.click(successBtn);

  await waitFor(() => {
    expect(api.simulateMockPayment).toHaveBeenCalledWith('pay_att_test_123', {
      outcome: 'success',
    });
    expect(screen.getAllByText('Payment verified successfully').length).toBeGreaterThanOrEqual(1);
  });
});
