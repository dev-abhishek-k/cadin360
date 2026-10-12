import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { fetchAdminJourneyDetails } from '../services/api.js';

const STAGE_CONFIG = [
  {
    key: 'arrived',
    label: 'Arrived',
    description: 'Initial visit via short link opening',
    type: 'short_link_opened',
    color: 'cyan',
  },
  {
    key: 'explored',
    label: 'Explored',
    description: 'Browsed exercises or platform dashboard',
    type: 'page_viewed',
    color: 'indigo',
  },
  {
    key: 'signedUp',
    label: 'Signed Up',
    description: 'Registered user account created',
    type: 'signup_completed',
    color: 'emerald',
  },
  {
    key: 'paid',
    label: 'Paid',
    description: 'Server-verified subscription payment',
    type: 'payment_completed',
    color: 'amber',
  },
];

export default function JourneyDetails() {
  const { journeyId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);

  // Timeline pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  const loadDetails = useCallback(async () => {
    if (!journeyId) return;
    setLoading(true);
    setError(null);
    setNotFound(false);

    try {
      const res = await fetchAdminJourneyDetails(journeyId, { page, limit });
      if (res.data?.success && res.data?.data) {
        setData(res.data.data);
      } else {
        setError('Failed to parse journey details.');
      }
    } catch (err) {
      if (err.response?.status === 404) {
        setNotFound(true);
      } else {
        setError(err.response?.data?.message || err.message || 'Error loading journey details');
      }
    } finally {
      setLoading(false);
    }
  }, [journeyId, page, limit]);

  useEffect(() => {
    if (user?.role === 'admin') {
      loadDetails();
    }
  }, [user, loadDetails]);

  const formatDate = (isoString) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return isNaN(d.getTime())
        ? '—'
        : d.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone: 'UTC',
            timeZoneName: 'short',
          });
    } catch (_e) {
      return '—';
    }
  };

  if (authLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Verifying administrator authorization...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="p-8 rounded-2xl bg-slate-900/80 border border-rose-900/40 shadow-xl">
          <div className="w-12 h-12 mx-auto rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center mb-4">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-sm text-slate-400 mb-4">
            Administrator permissions are required to inspect visitor journey timelines.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition"
          >
            Log In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Navigation Breadcrumb & Back */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/journeys')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Journeys
          </button>
          <div className="text-xs text-slate-500 hidden sm:flex items-center gap-1.5">
            <Link to="/admin/journeys" className="hover:text-slate-300 transition">Admin Dashboard</Link>
            <span>/</span>
            <span className="text-slate-300 font-mono">{journeyId}</span>
          </div>
        </div>

        <button
          onClick={loadDetails}
          disabled={loading}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 transition"
        >
          <svg
            className={`w-4 h-4 text-slate-400 ${loading ? 'animate-spin' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh Timeline
        </button>
      </div>

      {/* Loading Skeleton */}
      {loading && !data && (
        <div className="p-16 text-center">
          <div className="w-8 h-8 mx-auto border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-xs text-slate-400 font-medium">Loading journey history and event timeline...</p>
        </div>
      )}

      {/* Not Found State */}
      {notFound && (
        <div className="max-w-2xl mx-auto p-12 text-center rounded-2xl bg-slate-900 border border-slate-800">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-white mb-1">Journey Not Found</h2>
          <p className="text-xs text-slate-400 mb-4">
            No visitor journey exists matching identifier <code className="font-mono text-cyan-400">{journeyId}</code>.
          </p>
          <button
            onClick={() => navigate('/admin/journeys')}
            className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition"
          >
            Return to Dashboard
          </button>
        </div>
      )}

      {/* Error State */}
      {error && !notFound && (
        <div className="p-6 rounded-2xl bg-rose-950/20 border border-rose-900/40 text-center">
          <p className="text-xs font-semibold text-rose-300 mb-3">{error}</p>
          <button
            onClick={loadDetails}
            className="px-4 py-1.5 rounded-xl bg-rose-900/40 hover:bg-rose-900/70 border border-rose-700/50 text-xs font-semibold text-rose-200 transition"
          >
            Retry Request
          </button>
        </div>
      )}

      {/* Data Loaded */}
      {data && (
        <>
          {/* Section 1: Journey Summary Card */}
          <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl backdrop-blur-xl space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                    {data.displayIdentity}
                  </h1>
                  {data.identityType === 'user' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-950 text-cyan-300 border border-cyan-800/80">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                      Registered User
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                      Guest Session
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-400 font-mono">
                  <span>ID: <strong className="text-slate-200">{data.journeyId}</strong></span>
                  {data.email && <span>• Email: <strong className="text-slate-200">{data.email}</strong></span>}
                </div>
              </div>

              {/* Attribution Source Badge */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">First Source:</span>
                {data.firstSource ? (
                  <span className="px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-indigo-950 text-indigo-300 border border-indigo-800/80">
                    {data.firstSource}
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-lg text-xs text-slate-500 italic bg-slate-800/60 border border-slate-800">
                    Direct / None
                  </span>
                )}
              </div>
            </div>

            {/* Quick Summary Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Unique Events
                </span>
                <span className="text-2xl font-extrabold text-white mt-1 block">
                  {data.uniqueEventCount}
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5 block">Stored unique records</span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Associated Guest Sessions
                </span>
                <span className="text-2xl font-extrabold text-indigo-300 mt-1 block">
                  {data.associatedGuestSessionCount}
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5 block">Linked historical sessions</span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  First Activity
                </span>
                <span className="text-xs font-mono text-slate-200 font-semibold mt-2 block break-all">
                  {formatDate(data.firstActivityAt)}
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5 block">Earliest interaction</span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Last Activity
                </span>
                <span className="text-xs font-mono text-slate-200 font-semibold mt-2 block break-all">
                  {formatDate(data.lastActivityAt)}
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5 block">Latest interaction</span>
              </div>
            </div>

            {/* Associated Guest Sessions Details */}
            {data.associatedGuestSessions?.length > 0 && (
              <div className="p-4 rounded-2xl bg-slate-950/40 border border-slate-800/60">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Linked Guest Session Identifiers
                </h4>
                <div className="flex flex-wrap gap-2">
                  {data.associatedGuestSessions.map((s) => (
                    <span
                      key={s.guestSessionId}
                      className="px-2.5 py-1 rounded-lg text-xs font-mono bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-2"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                      <span>guest_{s.guestSessionId}</span>
                      <span className="text-[10px] text-slate-500">({formatDate(s.createdAt)})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Journey Stage Progress */}
          <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Journey Stage Progression</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Calculated independently across the complete journey history. Stages do not require sequential progression.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {STAGE_CONFIG.map(({ key, label, description, type, color }) => {
                const stageInfo = data.stageDetails?.[key] || { reached: data.stages?.[key], reachedAt: null };
                const isReached = !!stageInfo.reached;

                return (
                  <div
                    key={key}
                    className={`p-4 rounded-2xl border transition-all ${
                      isReached
                        ? `bg-${color}-950/20 border-${color}-800/60 shadow-lg shadow-${color}-950/20`
                        : 'bg-slate-950/40 border-slate-800/80 opacity-70'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-bold uppercase tracking-wider ${isReached ? `text-${color}-400` : 'text-slate-400'}`}>
                        {label}
                      </span>
                      {isReached ? (
                        <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-[10px] font-bold">
                          ✓
                        </span>
                      ) : (
                        <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-500 flex items-center justify-center text-[10px]">
                          —
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-400 mb-3">{description}</p>

                    <div className="pt-2 border-t border-slate-800/60 text-[10px] font-mono">
                      <span className="text-slate-500 block">Trigger: {type}</span>
                      <span className={isReached ? 'text-slate-200 font-semibold' : 'text-slate-600 italic'}>
                        {isReached ? formatDate(stageInfo.reachedAt) : 'Not reached'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 3: Chronological Event Timeline */}
          <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight">Event Timeline</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Ordered strictly by <code className="font-mono text-cyan-400">occurredAt ASC</code> and <code className="font-mono text-cyan-400">eventId ASC</code>.
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>Per page:</span>
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none"
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            {/* Empty Timeline State */}
            {data.timeline?.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-xs text-slate-400">No events have been recorded for this journey yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {data.timeline?.map((ev, index) => (
                  <div
                    key={ev.eventId}
                    className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 transition space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/60 pb-2">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="w-6 h-6 rounded-lg bg-slate-800 text-slate-400 flex items-center justify-center text-[10px] font-bold">
                          {((page - 1) * limit) + index + 1}
                        </span>
                        <span className="text-xs font-bold text-white">{ev.type}</span>

                        {ev.canonicalLabel && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-950/80 text-cyan-300 border border-cyan-800/60">
                            {ev.canonicalLabel}
                          </span>
                        )}

                        {ev.source && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 uppercase">
                            Source: {ev.source}
                          </span>
                        )}

                        {ev.paymentVerification?.status === 'verified' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800/60">
                            Verified Payment
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] font-mono text-slate-400">
                        <span>Occurred: <strong className="text-slate-200">{formatDate(ev.occurredAt)}</strong></span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[10px] font-semibold text-slate-500 uppercase block">Route Info</span>
                        <span className="font-mono text-slate-300 text-[11px] block">{ev.canonicalRoute}</span>
                        {ev.originalRoute && ev.originalRoute !== ev.canonicalRoute && (
                          <span className="font-mono text-slate-500 text-[10px] block truncate">Original: {ev.originalRoute}</span>
                        )}
                      </div>

                      <div className="flex flex-col justify-end text-left md:text-right font-mono text-[10px] text-slate-500">
                        <span>Event ID: <strong className="text-slate-400">{ev.eventId}</strong></span>
                        {ev.receivedAt && (
                          <span>Received At: {formatDate(ev.receivedAt)}</span>
                        )}
                      </div>
                    </div>

                    {/* Metadata Details if any */}
                    {ev.exerciseName && (
                      <div className="pt-2 border-t border-slate-900 text-xs">
                        <span className="text-[10px] text-slate-500 font-semibold uppercase">Exercise: </span>
                        <span className="text-slate-300 font-medium">{ev.exerciseName}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Pagination Controls */}
            {data.pagination && data.pagination.totalPages > 1 && (
              <div className="pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-slate-400">
                <span>
                  Showing <strong className="text-slate-200">{((data.pagination.page - 1) * data.pagination.limit) + 1}</strong> to{' '}
                  <strong className="text-slate-200">{Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)}</strong> of{' '}
                  <strong className="text-slate-200">{data.pagination.total}</strong> events
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={!data.pagination.hasPrevPage || loading}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 border border-slate-800 text-xs font-semibold text-slate-300 transition"
                  >
                    Previous
                  </button>

                  <span className="px-2 text-slate-400 font-medium">
                    Page <strong className="text-slate-200">{data.pagination.page}</strong> of{' '}
                    <strong className="text-slate-200">{data.pagination.totalPages}</strong>
                  </span>

                  <button
                    onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                    disabled={!data.pagination.hasNextPage || loading}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 border border-slate-800 text-xs font-semibold text-slate-300 transition"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
