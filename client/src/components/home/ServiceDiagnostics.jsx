import React from 'react';

export default function ServiceDiagnostics({ state, onRetry }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
          <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          System Health & Connectivity
        </h3>
        <button
          onClick={onRetry}
          disabled={state.loading}
          className="rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700/80 px-3.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-600 disabled:opacity-50 flex items-center gap-1.5"
        >
          <svg className={`w-3.5 h-3.5 text-slate-400 ${state.loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Retry connection
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ['Backend connection', state.backend],
          ['MongoDB connection', state.database],
        ].map(([label, value]) => {
          const isOk = value === 'Connected';
          return (
            <div
              key={label}
              className={`rounded-xl border p-4 transition ${
                isOk
                  ? 'border-emerald-900/30 bg-emerald-950/10'
                  : 'border-rose-900/40 bg-rose-950/20'
              }`}
            >
              <p className="text-[11px] font-medium text-slate-400">{label}</p>
              <p className="mt-1.5 text-lg font-bold text-white flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isOk ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-rose-400 animate-pulse'
                  }`}
                />
                <span className={isOk ? 'text-emerald-300' : 'text-rose-300'}>{value}</span>
              </p>
            </div>
          );
        })}
      </div>

      {state.loading && (
        <p role="status" className="mt-3 text-xs text-cyan-300 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
          Checking service health…
        </p>
      )}

      {state.error && (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-200 flex items-center gap-2"
        >
          <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{state.error}</span>
        </div>
      )}
    </div>
  );
}
