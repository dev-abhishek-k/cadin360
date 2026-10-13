import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { fetchAdminJourneys } from '../services/api.js';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  // Filter states
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [source, setSource] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  // Data states
  const [journeys, setJourneys] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [summaryMetrics, setSummaryMetrics] = useState({
    totalJourneys: 0,
    arrived: 0,
    explored: 0,
    signedUp: 0,
    paid: 0,
  });

  // UI status states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dateError, setDateError] = useState(null);

  // Validate dates on change
  useEffect(() => {
    if (startDate && endDate) {
      if (new Date(startDate) > new Date(endDate)) {
        setDateError('Start date cannot be after end date.');
      } else {
        setDateError(null);
      }
    } else {
      setDateError(null);
    }
  }, [startDate, endDate]);

  const loadJourneys = useCallback(async () => {
    if (dateError) return;
    setLoading(true);
    setError(null);

    try {
      const params = {
        page,
        limit,
      };
      if (search.trim()) params.search = search.trim();
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (source && source !== 'all') params.source = source;

      const response = await fetchAdminJourneys(params);
      const data = response.data?.data;

      if (data) {
        setJourneys(data.journeys || []);
        setPagination(data.pagination || {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        });
        setSummaryMetrics(data.summaryMetrics || {
          totalJourneys: 0,
          arrived: 0,
          explored: 0,
          signedUp: 0,
          paid: 0,
        });
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to fetch admin journeys';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, startDate, endDate, source, dateError]);

  useEffect(() => {
    if (user?.role === 'admin' && !dateError) {
      loadJourneys();
    }
  }, [user, loadJourneys, dateError]);

  const handleFilterChange = (setter) => (e) => {
    setter(e.target.value);
    setPage(1); // Reset to page 1 whenever filters change
  };

  const handleClearFilters = () => {
    setSearch('');
    setStartDate('');
    setEndDate('');
    setSource('');
    setDateError(null);
    setPage(1);
  };

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

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="p-8 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl">
          <div className="w-12 h-12 mx-auto rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center mb-4">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Authentication Required</h2>
          <p className="text-sm text-slate-400 mb-6">
            You must be logged in as an administrator to access the Visitor Journey Dashboard.
          </p>
          <a
            href="/login"
            className="inline-flex items-center px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm transition"
          >
            Log In as Administrator
          </a>
        </div>
      </div>
    );
  }

  if (user.role !== 'admin') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="p-8 rounded-2xl bg-slate-900/80 border border-rose-900/40 shadow-xl">
          <div className="w-12 h-12 mx-auto rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center mb-4">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-sm text-slate-400 mb-2">
            Your current account (<span className="text-slate-200 font-medium">{user.email}</span>) does not have administrative privileges.
          </p>
          <p className="text-xs text-rose-400 font-mono">Role: {user.role} (Required: admin)</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Admin Journey Dashboard
            </h1>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Monitor, attribute, and explore visitor journey progression across guest and authenticated sessions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadJourneys}
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
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Total Journeys */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-lg backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Journeys</span>
            <span className="w-2 h-2 rounded-full bg-indigo-400" />
          </div>
          <div className="text-3xl font-extrabold text-white mt-2">
            {summaryMetrics.totalJourneys.toLocaleString()}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Matching current filters</span>
        </div>

        {/* Arrived Stage */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-cyan-900/30 shadow-lg backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">Arrived</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/50">
              Link Open
            </span>
          </div>
          <div className="text-3xl font-extrabold text-cyan-300 mt-2">
            {summaryMetrics.arrived.toLocaleString()}
          </div>
          <span className="text-[11px] text-cyan-500/80 mt-1 block">
            {summaryMetrics.totalJourneys > 0
              ? `${Math.round((summaryMetrics.arrived / summaryMetrics.totalJourneys) * 100)}% conversion`
              : '0% conversion'}
          </span>
        </div>

        {/* Explored Stage */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-indigo-900/30 shadow-lg backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Explored</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/50">
              Page View
            </span>
          </div>
          <div className="text-3xl font-extrabold text-indigo-300 mt-2">
            {summaryMetrics.explored.toLocaleString()}
          </div>
          <span className="text-[11px] text-indigo-500/80 mt-1 block">
            {summaryMetrics.totalJourneys > 0
              ? `${Math.round((summaryMetrics.explored / summaryMetrics.totalJourneys) * 100)}% conversion`
              : '0% conversion'}
          </span>
        </div>

        {/* Signed Up Stage */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-emerald-900/30 shadow-lg backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Signed Up</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/50">
              Registered
            </span>
          </div>
          <div className="text-3xl font-extrabold text-emerald-300 mt-2">
            {summaryMetrics.signedUp.toLocaleString()}
          </div>
          <span className="text-[11px] text-emerald-500/80 mt-1 block">
            {summaryMetrics.totalJourneys > 0
              ? `${Math.round((summaryMetrics.signedUp / summaryMetrics.totalJourneys) * 100)}% conversion`
              : '0% conversion'}
          </span>
        </div>

        {/* Paid Stage */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-amber-900/30 shadow-lg backdrop-blur-sm relative overflow-hidden col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Paid</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800/50">
              Verified
            </span>
          </div>
          <div className="text-3xl font-extrabold text-amber-300 mt-2">
            {summaryMetrics.paid.toLocaleString()}
          </div>
          <span className="text-[11px] text-amber-500/80 mt-1 block">
            {summaryMetrics.totalJourneys > 0
              ? `${Math.round((summaryMetrics.paid / summaryMetrics.totalJourneys) * 100)}% conversion`
              : '0% conversion'}
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-md space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search Input */}
          <div>
            <label htmlFor="admin-search" className="block text-xs font-medium text-slate-400 mb-1">
              Search Visitor
            </label>
            <div className="relative">
              <input
                id="admin-search"
                type="text"
                placeholder="User name, guest ID..."
                value={search}
                onChange={handleFilterChange(setSearch)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              />
              {search && (
                <button
                  onClick={() => { setSearch(''); setPage(1); }}
                  className="absolute right-2.5 top-2 text-slate-500 hover:text-slate-300 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Start Date */}
          <div>
            <label htmlFor="admin-start-date" className="block text-xs font-medium text-slate-400 mb-1">
              Start Date (UTC)
            </label>
            <input
              id="admin-start-date"
              type="date"
              value={startDate}
              onChange={handleFilterChange(setStartDate)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
            />
          </div>

          {/* End Date */}
          <div>
            <label htmlFor="admin-end-date" className="block text-xs font-medium text-slate-400 mb-1">
              End Date (UTC)
            </label>
            <input
              id="admin-end-date"
              type="date"
              value={endDate}
              onChange={handleFilterChange(setEndDate)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
            />
          </div>

          {/* Source Filter */}
          <div>
            <label htmlFor="admin-source-select" className="block text-xs font-medium text-slate-400 mb-1">
              First Source Attribution
            </label>
            <select
              id="admin-source-select"
              value={source}
              onChange={handleFilterChange(setSource)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
            >
              <option value="">All Sources</option>
              <option value="youtube">YouTube</option>
              <option value="google">Google</option>
              <option value="facebook">Facebook</option>
              <option value="linkedin">LinkedIn</option>
              <option value="twitter">Twitter</option>
              <option value="reddit">Reddit</option>
              <option value="none">Direct / Unattributed</option>
            </select>
          </div>
        </div>

        {/* Date Validation Alert */}
        {dateError && (
          <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 flex items-center gap-2">
            <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{dateError}</span>
          </div>
        )}

        {/* Active Filters and Reset */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/60">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span>Showing results for:</span>
            {search && (
              <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-200 border border-slate-700">
                Search: &ldquo;{search}&rdquo;
              </span>
            )}
            {startDate && (
              <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-200 border border-slate-700">
                From: {startDate}
              </span>
            )}
            {endDate && (
              <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-200 border border-slate-700">
                To: {endDate}
              </span>
            )}
            {source && (
              <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-200 border border-slate-700">
                Source: {source}
              </span>
            )}
            {!search && !startDate && !endDate && !source && (
              <span className="text-slate-500 italic">All visitor journeys</span>
            )}
          </div>

          {(search || startDate || endDate || source) && (
            <button
              onClick={handleClearFilters}
              id="clear-filters-btn"
              className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 hover:underline transition"
            >
              Clear All Filters
            </button>
          )}
        </div>
      </div>

      {/* Main Table Container */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden shadow-xl">
        {/* Error message */}
        {error && (
          <div className="p-6 text-center border-b border-rose-900/40 bg-rose-950/20">
            <p className="text-sm text-rose-300 font-medium mb-3">{error}</p>
            <button
              onClick={loadJourneys}
              className="px-4 py-1.5 rounded-xl bg-rose-900/40 hover:bg-rose-900/70 border border-rose-700/50 text-xs font-semibold text-rose-200 transition"
            >
              Retry Loading
            </button>
          </div>
        )}

        {/* Loading state */}
        {loading ? (
          <div className="p-16 text-center">
            <div className="w-8 h-8 mx-auto border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-xs text-slate-400 font-medium">Loading visitor journey data...</p>
          </div>
        ) : journeys.length === 0 ? (
          /* Empty state */
          <div className="p-16 text-center">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400 mb-3">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-sm font-bold text-white mb-1">No Matching Visitor Journeys</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
              We couldn&apos;t find any journeys matching your active filters. Try adjusting your search query, date boundaries, or attribution channel.
            </p>
            {(search || startDate || endDate || source) && (
              <button
                onClick={handleClearFilters}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          /* Table */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 border-b border-slate-800 uppercase tracking-wider text-[11px] text-slate-400">
                <tr>
                  <th scope="col" className="px-5 py-3.5 font-semibold">Visitor</th>
                  <th scope="col" className="px-4 py-3.5 font-semibold">Identity Type</th>
                  <th scope="col" className="px-4 py-3.5 font-semibold">First Activity (Local)</th>
                  <th scope="col" className="px-4 py-3.5 font-semibold">Last Activity (Local)</th>
                  <th scope="col" className="px-4 py-3.5 font-semibold">First Source</th>
                  <th scope="col" className="px-4 py-3.5 font-semibold text-center">Unique Events</th>
                  <th scope="col" className="px-5 py-3.5 font-semibold">Milestone Stages</th>
                  <th scope="col" className="px-4 py-3.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {journeys.map((j) => (
                  <tr key={j.journeyId} className="hover:bg-slate-800/30 transition-colors">
                    {/* Visitor */}
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-100">{j.displayIdentity}</div>
                      <div className="text-[10px] text-slate-500 font-mono tracking-tight">{j.journeyId}</div>
                    </td>

                    {/* Identity Type */}
                    <td className="px-4 py-4">
                      {j.identityType === 'user' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                          Registered User
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                          Guest Session
                        </span>
                      )}
                    </td>

                    {/* First Activity */}
                    <td className="px-4 py-4 text-slate-400 font-mono text-[11px]">
                      {formatDate(j.firstActivityAt)}
                    </td>

                    {/* Last Activity */}
                    <td className="px-4 py-4 text-slate-400 font-mono text-[11px]">
                      {formatDate(j.lastActivityAt)}
                    </td>

                    {/* First Source */}
                    <td className="px-4 py-4">
                      {j.firstSource ? (
                        <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wider bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                          {j.firstSource}
                        </span>
                      ) : (
                        <span className="text-slate-500 italic text-[11px]">Direct / None</span>
                      )}
                    </td>

                    {/* Unique Events */}
                    <td className="px-4 py-4 text-center">
                      <span className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-lg bg-slate-800 font-bold text-slate-200 text-xs">
                        {j.uniqueEventCount}
                      </span>
                    </td>

                    {/* Stages */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Arrived */}
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition ${
                            j.stages.arrived
                              ? 'bg-cyan-950/80 text-cyan-300 border-cyan-800/80'
                              : 'bg-slate-900/60 text-slate-600 border-slate-800'
                          }`}
                          title={j.stages.arrived ? 'Arrived via short link' : 'Not arrived via link'}
                        >
                          Arrived
                        </span>

                        {/* Explored */}
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition ${
                            j.stages.explored
                              ? 'bg-indigo-950/80 text-indigo-300 border-indigo-800/80'
                              : 'bg-slate-900/60 text-slate-600 border-slate-800'
                          }`}
                          title={j.stages.explored ? 'Explored pages' : 'Not explored pages'}
                        >
                          Explored
                        </span>

                        {/* Signed Up */}
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition ${
                            j.stages.signedUp
                              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80'
                              : 'bg-slate-900/60 text-slate-600 border-slate-800'
                          }`}
                          title={j.stages.signedUp ? 'Signup completed' : 'No account created'}
                        >
                          Signed Up
                        </span>

                        {/* Paid */}
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition ${
                            j.stages.paid
                              ? 'bg-amber-950/80 text-amber-300 border-amber-800/80'
                              : 'bg-slate-900/60 text-slate-600 border-slate-800'
                          }`}
                          title={j.stages.paid ? 'Payment verified' : 'No verified payment'}
                        >
                          Paid
                        </span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-4 text-right">
                      <button
                        onClick={() => navigate(`/admin/journeys/${encodeURIComponent(j.journeyId)}`)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold border border-slate-700 transition"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Server-Side Pagination Bar */}
        {!loading && journeys.length > 0 && (
          <div className="px-5 py-4 border-t border-slate-800/80 bg-slate-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-slate-400">
            <div className="flex items-center gap-3">
              <span>
                Showing <strong className="text-slate-200 font-semibold">{((pagination.page - 1) * pagination.limit) + 1}</strong> to{' '}
                <strong className="text-slate-200 font-semibold">{Math.min(pagination.page * pagination.limit, pagination.total)}</strong> of{' '}
                <strong className="text-slate-200 font-semibold">{pagination.total.toLocaleString()}</strong> journeys
              </span>

              <div className="flex items-center gap-1.5 pl-3 border-l border-slate-800">
                <span>Per page:</span>
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!pagination.hasPrevPage || loading}
                id="pagination-prev-btn"
                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 transition"
              >
                Previous
              </button>

              <span className="px-2 text-slate-400 font-medium">
                Page <strong className="text-slate-200">{pagination.page}</strong> of{' '}
                <strong className="text-slate-200">{pagination.totalPages}</strong>
              </span>

              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={!pagination.hasNextPage || loading}
                id="pagination-next-btn"
                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 transition"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
