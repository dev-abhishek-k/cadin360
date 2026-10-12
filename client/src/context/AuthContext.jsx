import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  fetchCurrentUser,
  loginUser,
  signupUser,
  logoutUser,
  createGuestSession,
  associateGuestSession,
} from '../services/api.js';
import { useToast } from './ToastContext.jsx';

const AuthContext = createContext(null);
const GUEST_STORAGE_KEY = 'cadin360_guest_credential';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [guestCredential, setGuestCredential] = useState(() => {
    try {
      return localStorage.getItem(GUEST_STORAGE_KEY) || null;
    } catch {
      return null;
    }
  });

  const toast = useToast();

  const checkAuth = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await fetchCurrentUser();
      if (data?.success && data?.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (_err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const initGuestSession = async () => {
    try {
      const { data } = await createGuestSession();
      if (data?.success && data?.guestCredential) {
        setGuestCredential(data.guestCredential);
        try {
          localStorage.setItem(GUEST_STORAGE_KEY, data.guestCredential);
        } catch (_e) {}
        toast.info('New guest session established');
        return { success: true, guestCredential: data.guestCredential, guestSession: data.guestSession };
      }
      throw new Error(data?.message || 'Failed to initialize guest session');
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Could not create guest session';
      toast.error(msg);
      return { success: false, error: msg };
    }
  };

  const clearGuestSession = () => {
    setGuestCredential(null);
    try {
      localStorage.removeItem(GUEST_STORAGE_KEY);
    } catch (_e) {}
  };

  const login = async (credentials) => {
    setError(null);
    try {
      const payload = {
        ...credentials,
        guestCredential: credentials.guestCredential || guestCredential || undefined,
      };
      const { data } = await loginUser(payload);
      if (data?.success && data?.user) {
        setUser(data.user);
        if (data.guestSession) {
          clearGuestSession();
          toast.info('Guest session activity successfully linked to your account');
        }
        toast.success(data.message || 'Login successful');
        return { success: true, user: data.user, message: data.message };
      }
      throw new Error(data?.message || 'Login failed');
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Login failed';
      setError(msg);
      toast.error(msg);
      return { success: false, error: msg };
    }
  };

  const register = async (userData) => {
    setError(null);
    try {
      // Pass guest credential if available to associate visitor journey
      const payload = {
        ...userData,
        guestCredential: userData.guestCredential || guestCredential || undefined,
      };

      const { data } = await signupUser(payload);
      if (data?.success && data?.user) {
        setUser(data.user);
        clearGuestSession();
        toast.success(data.message || 'Registration successful');
        if (data.guestSession) {
          toast.info('Guest session activity successfully linked to your account');
        }
        return {
          success: true,
          user: data.user,
          guestSession: data.guestSession,
          message: data.message,
        };
      }
      throw new Error(data?.message || 'Registration failed');
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Registration failed';
      setError(msg);
      toast.error(msg);
      return { success: false, error: msg };
    }
  };

  const associateActiveGuestSession = async () => {
    if (!guestCredential) {
      toast.warning('No active guest session to associate');
      return { success: false };
    }
    try {
      const { data } = await associateGuestSession(guestCredential);
      if (data?.success) {
        clearGuestSession();
        toast.success(data.message || 'Guest session successfully associated with your account');
        return { success: true, data: data.data };
      }
      throw new Error(data?.message || 'Association failed');
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Association failed';
      toast.error(msg);
      return { success: false, error: msg };
    }
  };

  const logout = async () => {
    setError(null);
    try {
      const { data } = await logoutUser();
      toast.info(data?.message || 'Logged out successfully');
    } catch (_err) {
      toast.info('Logged out');
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        setError,
        guestCredential,
        initGuestSession,
        clearGuestSession,
        associateActiveGuestSession,
        login,
        register,
        signup: register,
        logout,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    return {
      user: null,
      loading: false,
      error: null,
      guestCredential: null,
      initGuestSession: async () => ({ success: false }),
      clearGuestSession: () => {},
      login: async () => ({ success: false }),
      register: async () => ({ success: false }),
      signup: async () => ({ success: false }),
      logout: async () => {},
      checkAuth: async () => {},
    };
  }
  return context;
}
