import React from 'react';

export default function GuestSessionCard({
  guestCredential,
  generatingGuest,
  user,
  onCreateGuest,
  onCopyCredential,
  onClearGuest,
  onAssociate,
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              Guest Session
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Cryptographic 256-bit unguessable guest credentials stored as SHA-256 hashes.
          </p>
        </div>

        <button
          onClick={onCreateGuest}
          disabled={generatingGuest}
          className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-3.5 py-1.5 text-xs font-semibold text-white transition shadow-lg shadow-indigo-600/20 disabled:opacity-50 flex items-center gap-1.5"
        >
          {generatingGuest ? (
            <>
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Generating…</span>
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>{guestCredential ? 'Renew Guest' : 'Generate Guest'}</span>
            </>
          )}
        </button>
      </div>

      <div className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-4">
        {guestCredential ? (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Active Guest Session
              </span>

              <div className="flex items-center gap-2">
                {user && (
                  <button
                    onClick={onAssociate}
                    className="text-xs bg-indigo-600/90 hover:bg-indigo-500 text-white font-semibold px-2.5 py-1 rounded-lg transition shadow-sm"
                    title="Associate this active guest session to your logged-in account"
                  >
                    Link to My Account
                  </button>
                )}
                <button
                  onClick={onCopyCredential}
                  className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 bg-cyan-950/50 hover:bg-cyan-950 px-2.5 py-1 rounded-lg border border-cyan-800/50 transition flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </button>
                <button
                  onClick={onClearGuest}
                  className="text-xs text-slate-400 hover:text-rose-300 px-2 py-1 transition"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-900/90 font-mono text-[11px] text-slate-300 break-all select-all border border-slate-800/80 flex items-center justify-between gap-2">
              <span className="truncate">{guestCredential}</span>
            </div>
          </div>
        ) : (
          <div className="text-center py-3">
            <p className="text-xs text-slate-300 font-medium">No guest session active</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Generate a guest session or sign in to start tracking visitor events.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
