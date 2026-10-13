import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-0 sm:h-16 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-2">
        <Link to="/" className="flex items-center gap-3 group self-start shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition-transform duration-200">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              CADIN360
              <span className="hidden sm:inline text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-400 border border-cyan-800/60">
                Auth Ready
              </span>
            </span>
            <span className="text-xs text-slate-400 hidden sm:inline">Visitor Journey System</span>
          </div>
        </Link>

        <nav className="flex flex-wrap items-center gap-1 sm:gap-3 w-full sm:w-auto min-w-0">
          <Link
            to="/"
            className="text-xs sm:text-sm font-medium text-slate-300 hover:text-white px-2 sm:px-3 py-1.5 rounded-lg hover:bg-slate-800/60 transition"
          >
            System Status
          </Link>

          <Link
            to="/plans"
            id="nav-plans-link"
            className="text-xs sm:text-sm font-medium text-slate-300 hover:text-white px-2 sm:px-3 py-1.5 rounded-lg hover:bg-slate-800/60 transition flex items-center gap-1.5"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Plans & Mock Pay
          </Link>

          {user?.role === 'admin' && (
            <Link
              to="/admin/journeys"
              id="nav-admin-link"
              className="text-xs sm:text-sm font-semibold text-cyan-400 hover:text-cyan-300 px-2 sm:px-3 py-1.5 rounded-lg hover:bg-cyan-950/40 border border-cyan-800/50 transition flex items-center gap-1.5"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              Admin Dashboard
            </Link>
          )}

          {user ? (
            <div className="flex items-center gap-2 sm:gap-3 sm:pl-3 sm:border-l border-slate-800">
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800">
                <div className="w-6 h-6 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 flex items-center justify-center text-xs font-bold uppercase">
                  {user.name?.charAt(0) || 'U'}
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-slate-200">{user.name}</span>
                  <span className="text-[10px] text-cyan-400 uppercase tracking-wider">{user.role}</span>
                </div>
              </div>
              <button
                onClick={handleLogout}
                id="logout-btn"
                className="text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-950/30 hover:bg-rose-950/60 border border-rose-800/40 px-3 py-2 rounded-xl transition"
              >
                Log out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                id="nav-login-link"
                className="text-sm font-medium text-slate-200 hover:text-white px-4 py-2 rounded-xl hover:bg-slate-800/80 transition"
              >
                Log In
              </Link>
              <Link
                to="/register"
                id="nav-register-link"
                className="text-sm font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 px-4 py-2 rounded-xl shadow-lg shadow-cyan-500/20 transition hover:shadow-cyan-400/30"
              >
                Register
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
