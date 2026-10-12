import { useToast } from '../../context/ToastContext.jsx';

export default function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (!toasts || toasts.length === 0) return null;

  return (
    <aside
      aria-label="Notifications"
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none px-4 sm:px-0"
    >
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isError = toast.type === 'error';
        const isWarning = toast.type === 'warning';

        const borderColor = isSuccess
          ? 'border-emerald-500/50 shadow-emerald-500/10'
          : isError
          ? 'border-rose-500/50 shadow-rose-500/10'
          : isWarning
          ? 'border-amber-500/50 shadow-amber-500/10'
          : 'border-cyan-500/50 shadow-cyan-500/10';

        const iconBg = isSuccess
          ? 'bg-emerald-500/20 text-emerald-400'
          : isError
          ? 'bg-rose-500/20 text-rose-400'
          : isWarning
          ? 'bg-amber-500/20 text-amber-400'
          : 'bg-cyan-500/20 text-cyan-400';

        return (
          <div
            key={toast.id}
            role="alert"
            className={`pointer-events-auto flex items-start gap-3 rounded-2xl border ${borderColor} bg-slate-900/95 p-4 shadow-xl backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-3`}
          >
            {/* Status Icon */}
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
              {isSuccess && (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {isError && (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              {isWarning && (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )}
              {!isSuccess && !isError && !isWarning && (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>

            {/* Message Body */}
            <div className="flex-1 min-w-0 pt-0.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                {isSuccess ? 'Success' : isError ? 'Backend Notice' : isWarning ? 'Warning' : 'System Notice'}
              </p>
              <p className="mt-0.5 text-sm font-medium text-slate-200 break-words">
                {toast.message}
              </p>
            </div>

            {/* Dismiss Button */}
            <button
              onClick={() => removeToast(toast.id)}
              aria-label="Dismiss notification"
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </aside>
  );
}
