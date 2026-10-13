import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { USER_ROLES, AUTH_CONFIG } from '../constants/auth.constants.js';

export default function Register() {
  const { register, guestCredential } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: USER_ROLES.USER,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    if (localError) setLocalError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');

    if (formData.password !== formData.confirmPassword) {
      setLocalError('Passwords do not match');
      toast.warning('Passwords do not match');
      return;
    }

    if (formData.password.length < AUTH_CONFIG.PASSWORD_MIN_LENGTH) {
      const msg = `Password must be at least ${AUTH_CONFIG.PASSWORD_MIN_LENGTH} characters long`;
      setLocalError(msg);
      toast.warning(msg);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        role: formData.role,
        guestCredential: guestCredential || undefined,
      };

      const result = await register(payload);

      if (result.success) {
        if (result.user?.role === USER_ROLES.ADMIN) {
          toast.success('Admin privileges successfully granted!');
        }
        navigate('/');
      } else {
        setLocalError(result.error || 'Registration failed');
      }
    } catch (err) {
      setLocalError(err.message || 'An unexpected error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="w-full max-w-md">
        <div className="relative rounded-3xl border border-slate-800 bg-slate-900/90 p-8 sm:p-10 shadow-2xl backdrop-blur-xl">
          <div className="absolute -top-3 left-8 px-3 py-1 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/80 text-xs font-semibold uppercase tracking-wider">
            Visitor Onboarding
          </div>

          <div className="mb-6">
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Create Account</h1>
            <p className="mt-2 text-sm text-slate-400">
              Register an identity for CADIN360 visitor journey tracking.
            </p>
          </div>

          {guestCredential && (
            <div className="mb-6 rounded-2xl border border-indigo-500/40 bg-indigo-950/30 p-3.5 text-xs text-indigo-200 flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse flex-shrink-0"></span>
              <span>
                Active guest session detected. Your visitor history will be automatically linked upon signup.
              </span>
            </div>
          )}

          {localError && (
            <div
              role="alert"
              className="mb-6 rounded-2xl border border-rose-500/40 bg-rose-950/40 p-4 text-sm text-rose-200 flex items-start gap-3"
            >
              <svg className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{localError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="register-name" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                Full Name
              </label>
              <input
                id="register-name"
                name="name"
                type="text"
                required
                value={formData.name}
                onChange={handleChange}
                placeholder="Jane Doe"
                className="w-full rounded-xl border border-slate-700/80 bg-slate-800/80 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition"
              />
            </div>

            <div>
              <label htmlFor="register-email" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                Email Address
              </label>
              <input
                id="register-email"
                name="email"
                type="email"
                required
                value={formData.email}
                onChange={handleChange}
                placeholder="jane@example.com"
                className="w-full rounded-xl border border-slate-700/80 bg-slate-800/80 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition"
              />
            </div>

            <div>
              <label htmlFor="register-role" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                Account Role
              </label>
              <select
                id="register-role"
                name="role"
                value={formData.role}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-700/80 bg-slate-800/80 px-4 py-3 text-sm text-white focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition"
              >
                <option value={USER_ROLES.USER}>User (Standard)</option>
                <option value={USER_ROLES.ADMIN}>Admin (System operator)</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="register-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-xs text-cyan-400 hover:text-cyan-300 transition"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                id="register-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                value={formData.password}
                onChange={handleChange}
                placeholder="At least 6 characters"
                className="w-full rounded-xl border border-slate-700/80 bg-slate-800/80 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition"
              />
            </div>

            <div>
              <label htmlFor="register-confirm-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                Confirm Password
              </label>
              <input
                id="register-confirm-password"
                name="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                required
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Repeat password"
                className="w-full rounded-xl border border-slate-700/80 bg-slate-800/80 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition"
              />
            </div>

            <button
              type="submit"
              id="register-submit-btn"
              disabled={submitting}
              className="w-full mt-2 rounded-xl bg-cyan-400 py-3.5 px-4 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-wait shadow-lg shadow-cyan-500/20"
            >
              {submitting ? 'Creating Account…' : 'Register'}
            </button>
          </form>

          <div className="mt-8 border-t border-slate-800 pt-6 text-center text-sm text-slate-400">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-cyan-400 hover:text-cyan-300 transition">
              Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
