import React from 'react';

export default function AuthPanel({
  user,
  testingSession,
  sessionTestResult,
  onTestSession,
  onLogout,
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            Authentication & Identity
          </h3>
        </div>
      </div>

      {user ? (
        <div className="rounded-xl border border-cyan-900/40 bg-cyan-950/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 flex items-center justify-center text-base font-bold uppercase shadow-sm">
                {user.name?.charAt(0) || 'U'}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">{user.name}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-cyan-950 text-cyan-300 border border-cyan-700/60">
                    {user.role}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{user.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onTestSession}
                disabled={testingSession}
                className="rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700/80 px-3.5 py-1.5 text-xs font-semibold text-slate-200 transition disabled:opacity-50 flex items-center gap-1.5"
              >
                <svg className={`w-3.5 h-3.5 text-cyan-400 ${testingSession ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                {testingSession ? 'Verifying…' : 'Verify Session'}
              </button>
              <button
                onClick={onLogout}
                className="rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 px-3.5 py-1.5 text-xs font-semibold text-rose-300 transition"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-xs font-bold text-white">Unauthenticated Visitor</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              No active session cookie found. Sign in to link guest interactions to your account.
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <a
              href="/login"
              className="flex-1 sm:flex-initial text-center rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3.5 py-1.5 text-xs font-semibold text-slate-200 transition"
            >
              Sign In
            </a>
            <a
              href="/register"
              className="flex-1 sm:flex-initial text-center rounded-xl bg-cyan-400 hover:bg-cyan-300 px-3.5 py-1.5 text-xs font-bold text-slate-950 transition shadow-lg shadow-cyan-500/20"
            >
              Register
            </a>
          </div>
        </div>
      )}

      {/* Live Cookie Inspection Box */}
      {sessionTestResult && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3 text-xs font-mono">
          <div className="flex items-center justify-between text-slate-400 mb-1.5 font-sans font-semibold">
            <span>/api/auth/me Verified Response</span>
            <span className={sessionTestResult.ok ? 'text-emerald-400' : 'text-rose-400'}>
              {sessionTestResult.ok ? '200 OK' : `${sessionTestResult.status} Error`}
            </span>
          </div>
          <pre className="text-slate-300 overflow-x-auto p-2 bg-slate-900/60 rounded text-[11px]">
            {JSON.stringify(sessionTestResult.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
