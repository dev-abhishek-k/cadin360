import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  fetchPlans,
  createMockPaymentAttempt,
  simulateMockPayment,
  fetchJourneySummary,
} from '../services/api.js';

export default function Plans() {
  const { user, guestCredential, initGuestSession } = useAuth();
  const toast = useToast();

  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState('pro');
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [creatingAttempt, setCreatingAttempt] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [activeAttempt, setActiveAttempt] = useState(null);
  const [lastSimulationResult, setLastSimulationResult] = useState(null);
  const [paidStageReached, setPaidStageReached] = useState(false);

  // Load plans from trusted server configuration
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoadingPlans(true);
        const { data } = await fetchPlans();
        if (mounted && data?.data) {
          const list = Array.isArray(data.data) ? data.data : data.plans || [];
          setPlans(list);
          if (list.length > 0 && !list.find((p) => p.id === selectedPlanId)) {
            setSelectedPlanId(list[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load plans:', err);
        // Fallback plans if offline
        if (mounted) {
          setPlans([
            { id: 'starter', name: 'Starter Modeler', amount: 29, currency: 'USD', billingInterval: 'month', features: ['2D & 3D CAD modeling', 'Unlimited projects'] },
            { id: 'pro', name: 'Professional Engineer', amount: 79, currency: 'USD', billingInterval: 'month', popular: true, features: ['Advanced 3D Assemblies', 'Priority rendering'] },
            { id: 'enterprise', name: 'Enterprise Industrial', amount: 199, currency: 'USD', billingInterval: 'month', features: ['Full CAD suite', 'Dedicated SLA'] },
          ]);
        }
      } finally {
        if (mounted) setLoadingPlans(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  // Check current journey Paid status
  const checkJourneyPaid = async () => {
    if (!user && !guestCredential) return;
    try {
      const { data } = await fetchJourneySummary();
      if (data?.data?.stages) {
        setPaidStageReached(Boolean(data.data.stages.paid));
      }
    } catch (_err) {
      // Ignore if journey empty
    }
  };

  useEffect(() => {
    checkJourneyPaid();
  }, [user, guestCredential]);

  const handleCreateAttempt = async () => {
    if (!user && !guestCredential) {
      toast.info('Initializing guest session for visitor journey tracking…');
      const initResult = await initGuestSession();
      if (!initResult.success) {
        toast.error('Could not initialize session. Please try again.');
        return;
      }
    }

    setCreatingAttempt(true);
    setLastSimulationResult(null);
    try {
      const { data } = await createMockPaymentAttempt({ planId: selectedPlanId });
      const attempt = data?.data || data?.paymentAttempt || data;
      setActiveAttempt(attempt);
      toast.success(`Payment attempt initialized for ${attempt.planName}`);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to create payment attempt';
      toast.error(msg);
    } finally {
      setCreatingAttempt(false);
    }
  };

  const handleSimulate = async (outcome) => {
    if (!activeAttempt?.paymentAttemptId) return;

    setSimulating(true);
    try {
      const payload = {
        outcome,
        ...(outcome === 'failure' ? { simulateFailureReason: 'Card declined by mock payment gateway' } : {}),
      };

      const { data } = await simulateMockPayment(activeAttempt.paymentAttemptId, payload);
      setLastSimulationResult(data);

      if (data?.data) {
        setActiveAttempt(data.data);
      }

      if (data?.verified) {
        toast.success(data.message || 'Payment successfully verified!');
        setPaidStageReached(true);
      } else if (data?.duplicate) {
        toast.info(data.message || 'Idempotent response: payment already finalized');
      } else {
        toast.warning(data.message || 'Payment simulation failed (as requested)');
      }

      await checkJourneyPaid();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Simulation error';
      toast.error(msg);
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="min-h-screen px-4 sm:px-6 lg:px-8 py-10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header Banner */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                  Mock Payment Verification
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                Subscription Plans & Mock Checkout
              </h1>
              <p className="mt-2 text-sm text-slate-400 max-w-2xl">
                Select a CADIN360 subscription plan and simulate verified server-side mock payment fulfillment.
                Demonstrates deterministic verification, race-condition safety, and Paid journey attribution.
              </p>
            </div>

            {/* Disclaimer Pill */}
            <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 text-xs text-amber-200 max-w-xs flex items-start gap-2.5">
              <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>
                <strong>Mock Environment:</strong> No real payment gateway is integrated. No financial credentials or card details are processed.
              </span>
            </div>
          </div>
        </div>

        {/* Current Journey Stage Bar */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Current Journey Stage:
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                paidStageReached
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/80 shadow-sm shadow-emerald-500/20'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${paidStageReached ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              {paidStageReached ? 'Paid Stage Achieved' : 'Not Yet Paid'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="text-xs text-cyan-400 hover:text-cyan-300 transition flex items-center gap-1"
            >
              ← Back to Journey Simulator
            </Link>
            {user?.role === 'admin' && (
              <Link
                to="/admin/journeys"
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-cyan-950 text-cyan-300 border border-cyan-800/60 hover:bg-cyan-900/40 transition"
              >
                View in Admin Dashboard →
              </Link>
            )}
          </div>
        </div>

        {/* Plans Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Choose a Plan</h2>
            <span className="text-xs text-slate-400">Server-Authoritative Pricing</span>
          </div>

          {loadingPlans ? (
            <div className="py-12 flex justify-center items-center">
              <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-3">
              {plans.map((p) => {
                const isSelected = selectedPlanId === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPlanId(p.id)}
                    className={`cursor-pointer rounded-3xl border p-6 transition-all duration-200 relative flex flex-col justify-between ${
                      isSelected
                        ? 'border-cyan-400 bg-slate-900 shadow-xl shadow-cyan-500/10 ring-2 ring-cyan-400/30'
                        : 'border-slate-800 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-900/80'
                    }`}
                  >
                    {p.popular && (
                      <span className="absolute -top-3 right-6 rounded-full bg-gradient-to-r from-cyan-500 to-indigo-600 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-md">
                        Most Popular
                      </span>
                    )}

                    <div>
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-white">{p.name}</h3>
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            isSelected ? 'border-cyan-400 bg-cyan-400/20' : 'border-slate-600'
                          }`}
                        >
                          {isSelected && <span className="w-2 h-2 rounded-full bg-cyan-400" />}
                        </div>
                      </div>

                      <div className="mt-4 flex items-baseline gap-1">
                        <span className="text-3xl font-black text-white">${p.amount}</span>
                        <span className="text-xs text-slate-400">
                          {p.currency} / {p.billingInterval || 'month'}
                        </span>
                      </div>

                      <ul className="mt-6 space-y-2.5 text-xs text-slate-300">
                        {(p.features || ['Parametric modeling', 'Full access']).map((feat, idx) => (
                          <li key={idx} className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-cyan-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPlanId(p.id);
                      }}
                      className={`w-full mt-6 py-2.5 px-4 rounded-xl text-xs font-bold transition ${
                        isSelected
                          ? 'bg-cyan-400 text-slate-950 shadow-md shadow-cyan-400/20'
                          : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      {isSelected ? 'Selected' : 'Select Plan'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Action to create payment attempt */}
          <div className="pt-2 flex justify-center">
            <button
              onClick={handleCreateAttempt}
              disabled={creatingAttempt || simulating}
              className="py-3.5 px-8 rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-sm shadow-xl shadow-cyan-500/20 hover:scale-[1.02] active:scale-[0.98] transition disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
            >
              {creatingAttempt ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating Payment Attempt…
                </>
              ) : (
                <>
                  <span>Create Mock Payment Attempt</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Active Mock Payment Attempt Simulator */}
        {activeAttempt && (
          <div className="rounded-3xl border border-cyan-500/30 bg-slate-900/90 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">
                  Active Payment Attempt
                </span>
                <h3 className="text-xl font-bold text-white mt-0.5">
                  Mock Gateway Simulator
                </h3>
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Status:</span>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                    activeAttempt.status === 'succeeded'
                      ? 'bg-emerald-950 text-emerald-400 border-emerald-800/80 shadow-sm shadow-emerald-500/20'
                      : activeAttempt.status === 'failed'
                      ? 'bg-rose-950 text-rose-400 border-rose-800/80'
                      : 'bg-amber-950 text-amber-400 border-amber-800/80 animate-pulse'
                  }`}
                >
                  {activeAttempt.status}
                </span>
              </div>
            </div>

            {/* Attempt Details Grid */}
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
              <div>
                <span className="text-[11px] text-slate-400 block">Attempt ID</span>
                <span className="text-xs font-mono text-cyan-300 font-semibold break-all">
                  {activeAttempt.paymentAttemptId}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block">Plan</span>
                <span className="text-xs font-semibold text-white">
                  {activeAttempt.planName}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block">Authoritative Amount</span>
                <span className="text-xs font-bold text-emerald-400">
                  ${activeAttempt.amount} {activeAttempt.currency}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block">Journey Identity</span>
                <span className="text-xs font-mono text-slate-300">
                  {activeAttempt.journeyIdentity}
                </span>
              </div>
            </div>

            {/* Simulator Actions */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Simulate Provider Outcome (Server Verification Flow):
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  id="simulate-success-btn"
                  onClick={() => handleSimulate('success')}
                  disabled={simulating}
                  className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {simulating ? 'Processing…' : '✓ Simulate Verified Success'}
                </button>

                <button
                  type="button"
                  id="simulate-failure-btn"
                  onClick={() => handleSimulate('failure')}
                  disabled={simulating}
                  className="px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs shadow-lg shadow-rose-500/20 transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {simulating ? 'Processing…' : '✕ Simulate Decline / Failure'}
                </button>

                <button
                  type="button"
                  id="simulate-retry-btn"
                  onClick={() => handleSimulate('success')}
                  disabled={simulating}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs transition disabled:opacity-50"
                >
                  Test Idempotent Repeat
                </button>
              </div>
            </div>

            {/* Simulation Result Message */}
            {lastSimulationResult && (
              <div
                className={`p-4 rounded-2xl border text-xs flex items-start gap-3 ${
                  lastSimulationResult.verified
                    ? 'border-emerald-900/60 bg-emerald-950/30 text-emerald-200'
                    : lastSimulationResult.duplicate
                    ? 'border-indigo-900/60 bg-indigo-950/30 text-indigo-200'
                    : 'border-rose-900/60 bg-rose-950/30 text-rose-200'
                }`}
              >
                <span className="text-base">
                  {lastSimulationResult.verified ? '🎉' : lastSimulationResult.duplicate ? 'ℹ️' : '⚠️'}
                </span>
                <div className="space-y-1">
                  <p className="font-bold">{lastSimulationResult.message}</p>
                  {lastSimulationResult.event && (
                    <p className="font-mono text-[11px] text-emerald-400">
                      Generated Event ID: {lastSimulationResult.event.eventId} (Route: /plans)
                    </p>
                  )}
                  {lastSimulationResult.data?.failureReason && (
                    <p className="text-[11px] text-rose-300">
                      Reason: {lastSimulationResult.data.failureReason}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
