import { useCallback, useEffect, useState } from 'react';
import { fetchHealth } from '../services/api.js';

export default function Home() {
  const [state, setState] = useState({ loading: true, backend: 'Checking', database: 'Checking', error: '' });
  const check = useCallback(async () => {
    setState({ loading: true, backend: 'Checking', database: 'Checking', error: '' });
    try {
      const { data } = await fetchHealth();
      setState({ loading: false, backend: 'Connected', database: data.database === 'connected' ? 'Connected' : 'Unavailable', error: '' });
    } catch (error) {
      const unavailable = error.response?.status === 503;
      setState({ loading: false, backend: unavailable ? 'Connected' : 'Unavailable', database: 'Unavailable', error: unavailable ? 'Database is temporarily unavailable.' : 'Could not reach the API. Check that the server is running.' });
    }
  }, []);
  useEffect(() => { check(); }, [check]);
  return <main className="min-h-screen px-5 py-16 sm:px-10 lg:px-16 flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
    <section className="w-full max-w-3xl rounded-3xl border border-slate-700/70 bg-slate-900/80 p-8 shadow-2xl sm:p-12">
      <div className="mb-10 text-sm font-semibold uppercase tracking-[0.3em] text-cyan-400">System foundation</div>
      <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl">CADIN360</h1>
      <p className="mt-4 text-lg text-slate-300 sm:text-xl">Visitor Journey Tracking System</p>
      <p className="mt-4 max-w-xl text-slate-400">The application foundation is ready. Check the live connection status below.</p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {[['Backend connection', state.backend], ['MongoDB connection', state.database]].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-700 bg-slate-800/60 p-6"><p className="text-sm text-slate-400">{label}</p><p className="mt-2 text-xl font-semibold text-white">{value}</p></div>)}
      </div>
      {state.loading && <p role="status" className="mt-6 text-cyan-300">Checking service health…</p>}
      {state.error && <div role="alert" className="mt-6 rounded-xl border border-rose-500/40 bg-rose-950/40 p-4 text-rose-200">{state.error}</div>}
      <button onClick={check} disabled={state.loading} className="mt-6 rounded-xl bg-cyan-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-50">Retry connection</button>
    </section>
  </main>;
}
