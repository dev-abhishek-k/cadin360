import React from 'react';

const STAGES = [
  { key: 'arrived', label: 'Arrived', desc: 'Short link' },
  { key: 'explored', label: 'Explored', desc: 'Page view' },
  { key: 'signedUp', label: 'Signed up', desc: 'Registered' },
  { key: 'paid', label: 'Paid', desc: 'Verified pay' },
];

export default function JourneyOverviewCard({ journeySummary }) {
  const stages = journeySummary?.stages || { arrived: false, explored: false, signedUp: false, paid: false };
  const hasJourney = Boolean(journeySummary);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            Journey Milestone Progress
          </h3>
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/60">
            Module 4
          </span>
        </div>

        {hasJourney && (
          <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
            {journeySummary.journeyId} ({journeySummary.identityType})
          </span>
        )}
      </div>

      {/* 4-Stage Connected Funnel */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {STAGES.map(({ key, label, desc }) => {
          const active = !!stages[key];
          return (
            <div
              key={key}
              className={`p-3 rounded-xl border transition-all ${
                active
                  ? 'bg-slate-800/90 border-cyan-500/60 shadow-lg shadow-cyan-950/30'
                  : 'bg-slate-950/40 border-slate-800/70 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-[11px] font-bold uppercase tracking-wider ${active ? 'text-cyan-300' : 'text-slate-400'}`}>
                  {label}
                </span>
                <span
                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                    active ? 'bg-cyan-400 text-slate-950' : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {active ? '✓' : '—'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400">{desc}</p>
            </div>
          );
        })}
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
        <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/70">
          <span className="text-[10px] text-slate-400 uppercase block font-semibold">First Source</span>
          <span className="font-mono text-cyan-300 font-bold text-xs mt-0.5 block truncate">
            {journeySummary?.firstSource || 'Direct / None'}
          </span>
        </div>

        <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/70">
          <span className="text-[10px] text-slate-400 uppercase block font-semibold">Events Count</span>
          <span className="font-mono text-emerald-300 font-bold text-xs mt-0.5 block">
            {journeySummary ? `${journeySummary.uniqueEventCount} unique` : '0 unique'}
          </span>
        </div>

        <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/70">
          <span className="text-[10px] text-slate-400 uppercase block font-semibold">First Activity</span>
          <span className="font-mono text-slate-300 text-[11px] truncate mt-0.5 block">
            {journeySummary?.firstActivityAt
              ? new Date(journeySummary.firstActivityAt).toLocaleTimeString()
              : 'None'}
          </span>
        </div>

        <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/70">
          <span className="text-[10px] text-slate-400 uppercase block font-semibold">Last Activity</span>
          <span className="font-mono text-slate-300 text-[11px] truncate mt-0.5 block">
            {journeySummary?.lastActivityAt
              ? new Date(journeySummary.lastActivityAt).toLocaleTimeString()
              : 'None'}
          </span>
        </div>
      </div>
    </div>
  );
}
