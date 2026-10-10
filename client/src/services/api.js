import axios from 'axios';

const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api', timeout: 8000 });
export const fetchHealth = () => api.get('/health');
export default api;
