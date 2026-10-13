import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login.jsx';
import Register from './Register.jsx';
import Navbar from '../components/common/Navbar.jsx';
import ToastContainer from '../components/common/ToastContainer.jsx';
import * as api from '../services/api.js';
import { AuthProvider } from '../context/AuthContext.jsx';
import { ToastProvider } from '../context/ToastContext.jsx';

vi.mock('../services/api.js', () => ({
  fetchCurrentUser: vi.fn(),
  loginUser: vi.fn(),
  signupUser: vi.fn(),
  registerUser: vi.fn(),
  logoutUser: vi.fn(),
  fetchHealth: vi.fn(),
  createGuestSession: vi.fn(),
  fetchGuestSession: vi.fn(),
  ingestEvent: vi.fn(),
  fetchJourneyEvents: vi.fn(),
  verifyMockPayment: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test('Login page submits credentials and handles error with toast and alert', async () => {
  api.fetchCurrentUser.mockRejectedValue(new Error('unauthenticated'));
  api.loginUser.mockRejectedValueOnce({
    response: { data: { message: 'Invalid email or password' } },
  });

  render(
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>
          <Login />
          <ToastContainer />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );

  const emailInput = screen.getByLabelText(/Email Address/i);
  const passwordInput = screen.getByLabelText(/Password/i);
  const submitButton = screen.getByRole('button', { name: /^Sign In$/i });

  await userEvent.type(emailInput, 'wrong@example.com');
  await userEvent.type(passwordInput, 'wrongpassword');
  await userEvent.click(submitButton);

  await waitFor(() => {
    const alerts = screen.getAllByRole('alert');
    expect(alerts.some((el) => el.textContent.includes('Invalid email or password'))).toBe(true);
  });
});

test('Toast displays backend success message upon registration', async () => {
  api.fetchCurrentUser.mockRejectedValue(new Error('unauthenticated'));
  api.signupUser.mockResolvedValueOnce({
    data: {
      success: true,
      message: 'Registration successful',
      user: { id: 'u1', name: 'Tester', email: 'test@example.com', role: 'user' },
    },
  });

  render(
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>
          <Register />
          <ToastContainer />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );

  await userEvent.type(screen.getByLabelText(/Full Name/i), 'Tester');
  await userEvent.type(screen.getByLabelText(/Email Address/i), 'test@example.com');
  await userEvent.type(screen.getByLabelText(/^Password$/i), 'password123');
  await userEvent.type(screen.getByLabelText(/Confirm Password/i), 'password123');
  await userEvent.click(screen.getByRole('button', { name: /^Register$/i }));

  await waitFor(() => {
    expect(screen.getByText('Registration successful')).toBeTruthy();
  });
});

test('Register page validates password confirmation and short password', async () => {
  api.fetchCurrentUser.mockRejectedValue(new Error('unauthenticated'));

  render(
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>
          <Register />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );

  const nameInput = screen.getByLabelText(/Full Name/i);
  const emailInput = screen.getByLabelText(/Email Address/i);
  const passwordInput = screen.getByLabelText(/^Password$/i);
  const confirmPasswordInput = screen.getByLabelText(/Confirm Password/i);
  const submitButton = screen.getByRole('button', { name: /^Register$/i });

  await userEvent.type(nameInput, 'Bob Tester');
  await userEvent.type(emailInput, 'bob@example.com');
  await userEvent.type(passwordInput, 'short');
  await userEvent.type(confirmPasswordInput, 'short');
  await userEvent.click(submitButton);

  let alerts = screen.getAllByRole('alert');
  expect(alerts.some((a) => a.textContent.includes('Password must be at least 6 characters long'))).toBe(true);

  await userEvent.clear(passwordInput);
  await userEvent.clear(confirmPasswordInput);
  await userEvent.type(passwordInput, 'secret123');
  await userEvent.type(confirmPasswordInput, 'different123');
  await userEvent.click(submitButton);

  alerts = screen.getAllByRole('alert');
  expect(alerts.some((a) => a.textContent.includes('Passwords do not match'))).toBe(true);
});

test('Navbar displays authenticated user and allows logout with toast notification', async () => {
  api.fetchCurrentUser.mockResolvedValueOnce({
    data: {
      success: true,
      user: { id: 'u123', name: 'Alice Admin', email: 'alice@example.com', role: 'admin' },
    },
  });
  api.logoutUser.mockResolvedValueOnce({ data: { success: true, message: 'Logged out successfully' } });

  render(
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>
          <Navbar />
          <ToastContainer />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );

  await waitFor(() => {
    expect(screen.getByText('Alice Admin')).toBeTruthy();
    expect(screen.getByText('admin')).toBeTruthy();
  });

  const logoutBtn = screen.getByRole('button', { name: /Log out/i });
  await userEvent.click(logoutBtn);

  await waitFor(() => {
    expect(screen.getByRole('link', { name: /Log In/i })).toBeTruthy();
    expect(screen.getByText('Logged out successfully')).toBeTruthy();
  });
});

test('Register page sends selected admin role without a secret', async () => {
  api.fetchCurrentUser.mockRejectedValue(new Error('unauthenticated'));
  api.signupUser.mockResolvedValueOnce({
    data: {
      success: true,
      message: 'Registration successful',
      user: { id: 'u2', name: 'Admin User', email: 'admin@example.com', role: 'admin' },
    },
  });

  render(
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>
          <Register />
          <ToastContainer />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );

  const roleSelect = screen.getByLabelText(/Account Role/i);
  await userEvent.selectOptions(roleSelect, 'admin');

  expect(screen.queryByLabelText(/Admin Security Key/i)).toBeNull();

  await userEvent.type(screen.getByLabelText(/Full Name/i), 'Admin User');
  await userEvent.type(screen.getByLabelText(/Email Address/i), 'admin@example.com');
  await userEvent.type(screen.getByLabelText(/^Password$/i), 'password123');
  await userEvent.type(screen.getByLabelText(/Confirm Password/i), 'password123');
  await userEvent.click(screen.getByRole('button', { name: /^Register$/i }));

  await waitFor(() => {
    expect(api.signupUser).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Admin User',
        email: 'admin@example.com',
        role: 'admin',
      })
    );
  });
});
