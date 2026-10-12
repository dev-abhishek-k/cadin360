import { ToastProvider } from './context/ToastContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import ToastContainer from './components/common/ToastContainer.jsx';
import AppRoutes from './routes/AppRoutes.jsx';

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppRoutes />
        <ToastContainer />
      </AuthProvider>
    </ToastProvider>
  );
}
