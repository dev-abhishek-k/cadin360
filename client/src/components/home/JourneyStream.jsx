import React from 'react';

export default function JourneyStream({ journeyEvents = [] }) {
  const getEventBadge = (type) => {
    switch (type) {
      case 'short_link_opened':
        return { color: 'indigo', label: 'Arrival' };
      case 'page_viewed':
        return { color: 'cyan', label: 'Page View' };
      case 'exercise_started':
        return { color: 'emerald', label: 'Exercise' };
      case 'plan_viewed':
        return { color: 'amber', label: 'Pricing' };
      case 'signup_completed':
        return { color: 'emerald', label: 'Signup' };
      case 'payment_completed':
        return { color: 'rose', label: 'Payment' };
      default:
        return { color: 'slate', label: type };
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            Chronological Journey Stream
          </h3>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
            {journeyEvents.length} events
          </span>
        </div>
        <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
          occurredAt ASC &rarr; eventId ASC
        </span>
      </div>

      {journeyEvents.length > 0 ? (
        <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
          {journeyEvents.map((ev, index) => {
            const badge = getEventBadge(ev.type);
            return (
              <div
                key={ev.id || ev.eventId || index}
                className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 transition"
              >
                <div className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 flex items-center justify-center text-[10px] font-mono font-bold">
                    {index + 1}
                  </span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white text-xs">{ev.type}</span>
                      {ev.canonicalLabel && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-950/80 text-cyan-300 border border-cyan-800/60">
                          {ev.canonicalLabel}
                        </span>
                      )}
                      {ev.source && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase bg-indigo-950 text-indigo-300 border border-indigo-800/50">
                          {ev.source}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono mt-1">
                      {ev.canonicalRoute} {ev.exerciseName ? `• ${ev.exerciseName}` : ''}
                    </p>
                  </div>
                </div>

                <div className="text-right font-mono text-[10px] text-slate-400">
                  <div className="font-semibold text-slate-300">
                    {ev.occurredAt ? new Date(ev.occurredAt).toLocaleTimeString() : 'N/A'}
                  </div>
                  <div className="text-slate-500 truncate max-w-[130px]">{ev.eventId}</div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="w-10 h-10 mx-auto rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 mb-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-xs text-slate-300 font-medium">No visitor events recorded yet</p>
          <p className="text-[11px] text-slate-500 mt-0.5 max-w-xs mx-auto">
            Click any action button in the simulator to record an interaction and build your timeline.
          </p>
        </div>
      )}
    </div>
  );
}
