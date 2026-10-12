import React from 'react';

export default function EventTrackerActions({
  loadingEvents,
  onRefresh,
  onRecordEvent,
  onTestDuplicate,
  onTestMockPayment,
  lastIngestedEvent,
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              Visitor Event Simulator
            </h3>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/60">
              Module 2
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Trigger real visitor interactions. Recorded with client UUIDs, canonical route aliases, and atomic deduplication.
          </p>
        </div>

        <button
          onClick={onRefresh}
          disabled={loadingEvents}
          className="rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700/80 px-3.5 py-1.5 text-xs font-semibold text-slate-200 transition flex items-center gap-1.5 disabled:opacity-50"
        >
          <svg className={`w-3.5 h-3.5 text-slate-400 ${loadingEvents ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {loadingEvents ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Grid of Interactive Actions */}
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {/* Arrival: YouTube Short Link */}
        <button
          onClick={() =>
            onRecordEvent('short_link_opened', '/pricing?ref=youtube', { source: 'youtube' })
          }
          className="text-left rounded-xl bg-slate-950/70 hover:bg-slate-900 border border-indigo-900/40 hover:border-indigo-600/60 p-3.5 transition group"
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold text-indigo-400 text-xs flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              YouTube Short Link
            </span>
            <span className="text-[10px] text-indigo-400/80 font-mono">Arrived</span>
          </div>
          <span className="text-[11px] text-slate-400 block mt-1 font-mono truncate">
            /pricing?ref=youtube
          </span>
        </button>

        {/* Exploration: 2D Practice */}
        <button
          onClick={() =>
            onRecordEvent('page_viewed', '/guest-dashboard/cad-practice/2d', { source: 'nav' })
          }
          className="text-left rounded-xl bg-slate-950/70 hover:bg-slate-900 border border-cyan-900/40 hover:border-cyan-600/60 p-3.5 transition group"
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold text-cyan-400 text-xs flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              2D CAD Practice
            </span>
            <span className="text-[10px] text-cyan-400/80 font-mono">Explored</span>
          </div>
          <span className="text-[11px] text-slate-400 block mt-1 font-mono truncate">
            2D Exercises (/guest-dashboard...)
          </span>
        </button>

        {/* Exploration: 3D Gear Exercise */}
        <button
          onClick={() =>
            onRecordEvent('exercise_started', '/user-dashboard/cad-practice/3d', {
              exerciseName: 'Gear Assembly 3D',
            })
          }
          className="text-left rounded-xl bg-slate-950/70 hover:bg-slate-900 border border-emerald-900/40 hover:border-emerald-600/60 p-3.5 transition group"
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold text-emerald-400 text-xs flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Start 3D Exercise
            </span>
            <span className="text-[10px] text-emerald-400/80 font-mono">3D Exercises</span>
          </div>
          <span className="text-[11px] text-slate-400 block mt-1 font-mono truncate">
            Gear Assembly 3D
          </span>
        </button>

        {/* Evaluation: View Plans */}
        <button
          onClick={() =>
            onRecordEvent('plan_viewed', '/pricing', { source: 'pricing_table' })
          }
          className="text-left rounded-xl bg-slate-950/70 hover:bg-slate-900 border border-amber-900/40 hover:border-amber-600/60 p-3.5 transition group"
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold text-amber-400 text-xs flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              View Plans
            </span>
            <span className="text-[10px] text-amber-400/80 font-mono">Plans</span>
          </div>
          <span className="text-[11px] text-slate-400 block mt-1 font-mono truncate">
            /pricing
          </span>
        </button>

        {/* Conversion: Verify Mock Payment */}
        <button
          onClick={onTestMockPayment}
          className="text-left rounded-xl bg-slate-950/70 hover:bg-slate-900 border border-emerald-900/40 hover:border-emerald-600/60 p-3.5 transition group"
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold text-emerald-400 text-xs flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Verify Payment
            </span>
            <span className="text-[10px] text-emerald-400/80 font-mono">Paid</span>
          </div>
          <span className="text-[11px] text-slate-400 block mt-1 font-mono truncate">
            Server /api/payments/verify-mock
          </span>
        </button>

        {/* Reliability: Test Duplicate Retry */}
        <button
          onClick={onTestDuplicate}
          className="text-left rounded-xl bg-slate-950/70 hover:bg-slate-900 border border-purple-900/40 hover:border-purple-600/60 p-3.5 transition group"
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold text-purple-400 text-xs flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
              Test Duplicate Retry
            </span>
            <span className="text-[10px] text-purple-400/80 font-mono">Idempotent</span>
          </div>
          <span className="text-[11px] text-slate-400 block mt-1 font-mono truncate">
            Submits same eventId twice (200 OK dup)
          </span>
        </button>
      </div>

      {/* Latest Ingestion Result Pill */}
      {lastIngestedEvent && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3 text-xs font-mono">
          <div className="flex items-center justify-between text-slate-400 mb-1.5 font-sans font-semibold">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              Latest Ingestion Response
            </span>
            <span className={lastIngestedEvent.duplicate ? 'text-amber-400' : 'text-emerald-400'}>
              {lastIngestedEvent.duplicate ? 'Duplicate (200 OK)' : 'Saved (201 Created)'}
            </span>
          </div>
          <pre className="text-slate-300 overflow-x-auto p-2 bg-slate-900/60 rounded text-[11px]">
            {JSON.stringify(lastIngestedEvent.data || lastIngestedEvent, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
