import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from './Home.jsx';
import { fetchHealth } from '../services/api.js';

vi.mock('../services/api.js', () => ({ fetchHealth: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

test('shows successful backend and database status', async () => {
  fetchHealth.mockResolvedValue({ data: { success: true, database: 'connected' } });
  render(<Home />);
  await waitFor(() => expect(screen.getAllByText('Connected')).toHaveLength(2));
});
test('shows request error and retries successfully', async () => {
  fetchHealth.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: { success: true, database: 'connected' } });
  render(<Home />);
  expect((await screen.findByRole('alert')).textContent).toContain('Could not reach the API');
  await userEvent.click(screen.getByRole('button', { name: 'Retry connection' }));
  await waitFor(() => expect(screen.getAllByText('Connected')).toHaveLength(2));
  expect(fetchHealth).toHaveBeenCalledTimes(2);
});
