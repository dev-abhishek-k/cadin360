import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({ email: '', password: '' });
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
    setSubmitting(true);

    try {
      const result = await login(formData);
      if (result.success) {
        navigate('/');
      } else {
        setLocalError(result.error || 'Invalid credentials');
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
            Secure Access
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Sign In</h1>
            <p className="mt-2 text-sm text-slate-400">
              Access your CADIN360 visitor journey analytics and dashboard.
            </p>
          </div>

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

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="login-email" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                Email Address
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={formData.email}
                onChange={handleChange}
                placeholder="operator@cadin360.com"
                className="w-full rounded-xl border border-slate-700/80 bg-slate-800/80 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="login-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
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
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••••"
                className="w-full rounded-xl border border-slate-700/80 bg-slate-800/80 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition"
              />
            </div>

            <button
              type="submit"
              id="login-submit-btn"
              disabled={submitting}
              className="w-full mt-2 rounded-xl bg-cyan-400 py-3.5 px-4 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-wait shadow-lg shadow-cyan-500/20"
            >
              {submitting ? 'Authenticating…' : 'Sign In with HttpOnly Cookie'}
            </button>
          </form>

          <div className="mt-8 border-t border-slate-800 pt-6 text-center text-sm text-slate-400">
            Don’t have an account?{' '}
            <Link to="/register" className="font-semibold text-cyan-400 hover:text-cyan-300 transition">
              Create an account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
