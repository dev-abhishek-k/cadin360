import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchHealth,
  fetchCurrentUser,
  ingestEvent,
  fetchJourneyEvents,
  fetchJourneySummary,
  verifyMockPayment,
} from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

import ServiceDiagnostics from '../components/home/ServiceDiagnostics.jsx';
import GuestSessionCard from '../components/home/GuestSessionCard.jsx';
import JourneyOverviewCard from '../components/home/JourneyOverviewCard.jsx';
import EventTrackerActions from '../components/home/EventTrackerActions.jsx';
import JourneyStream from '../components/home/JourneyStream.jsx';
import AuthPanel from '../components/home/AuthPanel.jsx';

export default function Home() {
  const {
    user,
    logout,
    guestCredential,
    initGuestSession,
    clearGuestSession,
    associateActiveGuestSession,
  } = useAuth();
  const toast = useToast();

  const [state, setState] = useState({ loading: true, backend: 'Checking', database: 'Checking', error: '' });
  const [sessionTestResult, setSessionTestResult] = useState(null);
  const [testingSession, setTestingSession] = useState(false);
  const [generatingGuest, setGeneratingGuest] = useState(false);

  // Module 2 & 4 Event tracking & journey state
  const [journeyEvents, setJourneyEvents] = useState([]);
  const [journeySummary, setJourneySummary] = useState(null);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [lastIngestedEvent, setLastIngestedEvent] = useState(null);

  const check = useCallback(async () => {
    setState({ loading: true, backend: 'Checking', database: 'Checking', error: '' });
    try {
      const { data } = await fetchHealth();
      setState({
        loading: false,
        backend: 'Connected',
        database: data.database === 'connected' ? 'Connected' : 'Unavailable',
        error: '',
      });
    } catch (error) {
      const unavailable = error.response?.status === 503;
      setState({
        loading: false,
        backend: unavailable ? 'Connected' : 'Unavailable',
        database: 'Unavailable',
        error: unavailable
          ? 'Database is temporarily unavailable.'
          : 'Could not reach the API. Check that the server is running.',
      });
    }
  }, []);

  const loadEvents = useCallback(async () => {
    if (!user && !guestCredential) {
      setJourneyEvents([]);
      setJourneySummary(null);
      return;
    }
    setLoadingEvents(true);
    try {
      const [eventsRes, summaryRes] = await Promise.allSettled([
        fetchJourneyEvents(),
        fetchJourneySummary(),
      ]);
      if (eventsRes.status === 'fulfilled' && eventsRes.value?.data?.success) {
        setJourneyEvents(eventsRes.value.data.data || []);
      }
      if (summaryRes.status === 'fulfilled' && summaryRes.value?.data?.success) {
        setJourneySummary(summaryRes.value.data.data || null);
      }
    } catch (_err) {
      // 401 when neither session nor user exists
    } finally {
      setLoadingEvents(false);
    }
  }, [user, guestCredential]);

  const handleTestSession = async () => {
    setTestingSession(true);
    setSessionTestResult(null);
    try {
      const res = await fetchCurrentUser();
      setSessionTestResult({ ok: true, data: res.data });
      toast.success(res.data.message || 'User profile retrieved successfully');
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Session verification failed';
      setSessionTestResult({
        ok: false,
        status: err.response?.status || 500,
        data: err.response?.data || { message: errMsg },
      });
      toast.error(errMsg);
    } finally {
      setTestingSession(false);
    }
  };

  const handleCreateGuest = async () => {
    setGeneratingGuest(true);
    try {
      await initGuestSession();
    } finally {
      setGeneratingGuest(false);
    }
  };

  const handleCopyCredential = () => {
    if (guestCredential && navigator?.clipboard) {
      navigator.clipboard.writeText(guestCredential);
      toast.success('Guest credential copied to clipboard');
    }
  };

  const handleRecordEvent = async (type, canonicalRoute, extra = {}) => {
    if (!user && !guestCredential) {
      toast.warning('Please generate a guest session or log in first');
      return;
    }

    const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const eventPayload = {
      eventId,
      type,
      occurredAt: new Date().toISOString(),
      canonicalRoute,
      ...extra,
    };

    try {
      const { data } = await ingestEvent(eventPayload);
      setLastIngestedEvent(data);
      if (data.duplicate) {
        toast.info(`Duplicate event acknowledged (${eventId})`);
      } else {
        toast.success(`Event recorded: ${type}`);
      }
      loadEvents();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Event ingestion failed';
      toast.error(msg);
    }
  };

  const handleTestDuplicate = async () => {
    if (!user && !guestCredential) {
      toast.warning('Please initialize a guest session or log in first');
      return;
    }

    const fixedId = `test_dup_${Date.now()}`;
    const fixedTime = new Date().toISOString();
    const payload = {
      eventId: fixedId,
      type: 'page_viewed',
      occurredAt: fixedTime,
      canonicalRoute: '/pricing',
    };

    try {
      const res1 = await ingestEvent(payload);
      toast.success(`First submission: ${res1.data.duplicate ? 'Duplicate' : 'Saved (HTTP 201)'}`);

      const res2 = await ingestEvent(payload);
      toast.info(`Second submission: duplicate = ${res2.data.duplicate} (HTTP 200)`);
      setLastIngestedEvent(res2.data);
      loadEvents();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message);
    }
  };

  const handleTestMockPayment = async () => {
    if (!user && !guestCredential) {
      toast.warning('Please initialize a guest session or log in first');
      return;
    }

    const paymentId = `pay_demo_${Date.now()}`;
    try {
      const { data } = await verifyMockPayment({
        paymentId,
        amount: 49.99,
        plan: 'Annual Pro',
        currency: 'USD',
      });
      toast.success(data.message || 'Payment verified');
      setLastIngestedEvent(data);
      loadEvents();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message);
    }
  };

  useEffect(() => {
    check();
  }, [check]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  return (
    <main className="min-h-screen px-4 sm:px-6 lg:px-8 py-8 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Top Hero Banner */}
        <div className="rounded-3xl border border-slate-800/80 bg-slate-900/70 p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-400">
                  Visitor Journey Studio
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                  Modules 1–6 Integrated
                </span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
                CADIN360 Journey Platform
              </h1>
              <p className="mt-1.5 text-xs sm:text-sm text-slate-400 max-w-2xl">
                Simulate, track, and attribute multi-touch visitor journeys across unauthenticated guest sessions and registered accounts.
              </p>
            </div>

            {/* Quick Status Pill & Persona */}
            <div className="flex flex-wrap items-center gap-3">
              {user ? (
                <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-cyan-950/60 border border-cyan-800/60">
                  <span className="w-2 h-2 rounded-full bg-cyan-400" />
                  <div className="text-left">
                    <span className="text-xs font-bold text-white block">{user.name}</span>
                    <span className="text-[10px] font-mono text-cyan-300 block uppercase">{user.role} Identity</span>
                  </div>
                </div>
              ) : guestCredential ? (
                <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-indigo-950/60 border border-indigo-800/60">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                  <div className="text-left">
                    <span className="text-xs font-bold text-indigo-200 block">Active Guest Mode</span>
                    <span className="text-[10px] font-mono text-indigo-400 block truncate max-w-[140px]">
                      {guestCredential.slice(0, 12)}…
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-slate-950/60 border border-slate-800">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="text-xs text-slate-300 font-medium">Anonymous Visitor</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2-Column Responsive Studio Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Actions & Session Controls (Cols 1-6) */}
          <div className="lg:col-span-6 space-y-6">
            {/* 1. Guest Session Card (Module 1) */}
            <GuestSessionCard
              guestCredential={guestCredential}
              generatingGuest={generatingGuest}
              user={user}
              onCreateGuest={handleCreateGuest}
              onCopyCredential={handleCopyCredential}
              onClearGuest={clearGuestSession}
              onAssociate={async () => {
                await associateActiveGuestSession();
                loadEvents();
              }}
            />

            {/* 2. Interactive Event Simulator (Module 2) */}
            <EventTrackerActions
              loadingEvents={loadingEvents}
              onRefresh={loadEvents}
              onRecordEvent={handleRecordEvent}
              onTestDuplicate={handleTestDuplicate}
              onTestMockPayment={handleTestMockPayment}
              lastIngestedEvent={lastIngestedEvent}
            />

            {/* 3. Authentication Panel (Module 1 & 3) */}
            <AuthPanel
              user={user}
              testingSession={testingSession}
              sessionTestResult={sessionTestResult}
              onTestSession={handleTestSession}
              onLogout={logout}
            />
          </div>

          {/* Right Column: Live Journey Intelligence & Stream (Cols 7-12) */}
          <div className="lg:col-span-6 space-y-6">
            {/* 4. Journey Overview & Milestone Funnel (Module 4) */}
            <JourneyOverviewCard journeySummary={journeySummary} />

            {/* 5. Chronological Event Stream */}
            <JourneyStream journeyEvents={journeyEvents} />

            {/* 6. Service Diagnostics & Connectivity */}
            <ServiceDiagnostics state={state} onRetry={check} />
          </div>
        </div>
      </div>
    </main>
  );
}
