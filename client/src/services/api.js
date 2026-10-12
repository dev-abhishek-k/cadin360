import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
  timeout: 8000,
  withCredentials: true,
});

// Auto-attach guest credential from localStorage if active
api.interceptors.request.use((config) => {
  try {
    const guestCred = localStorage.getItem('cadin360_guest_credential');
    if (guestCred && !config.headers['x-guest-session-credential']) {
      config.headers['x-guest-session-credential'] = guestCred;
    }
  } catch (_e) {}
  return config;
});

export const fetchHealth = () => api.get('/health');
export const signupUser = (userData) => api.post('/auth/signup', userData);
export const registerUser = (userData) => signupUser(userData);
export const loginUser = (credentials) => api.post('/auth/login', credentials);
export const logoutUser = () => api.post('/auth/logout');
export const fetchCurrentUser = () => api.get('/auth/me');

// Guest session endpoints
export const createGuestSession = () => api.post('/guest-sessions');
export const fetchGuestSession = (credential) =>
  api.get('/guest-sessions/current', {
    headers: { 'x-guest-session-credential': credential },
  });
export const associateGuestSession = (credential) =>
  api.post('/guest-sessions/associate', credential ? { guestCredential: credential } : {});


// Event ingestion endpoints
export const ingestEvent = (eventData) => api.post('/events', eventData);
export const fetchJourneyEvents = () => api.get('/events/journey');
export const fetchJourneySummary = (params = {}) => api.get('/events/journey/summary', { params });

// Mock payment verification endpoints (Module 7)
export const verifyMockPayment = (paymentData) => api.post('/payments/verify-mock', paymentData);
export const fetchPlans = () => api.get('/mock-payments/plans');
export const createMockPaymentAttempt = (payload) => api.post('/mock-payments', payload);
export const simulateMockPayment = (attemptId, payload) =>
  api.post(`/mock-payments/${encodeURIComponent(attemptId)}/simulate`, payload);
export const fetchMockPaymentStatus = (attemptId) =>
  api.get(`/mock-payments/${encodeURIComponent(attemptId)}`);

// Admin journey dashboard endpoints
export const fetchAdminJourneys = (params = {}) => api.get('/admin/journeys', { params });
export const fetchAdminJourneyDetails = (journeyId, params = {}) =>
  api.get(`/admin/journeys/${encodeURIComponent(journeyId)}`, { params });

export default api;
