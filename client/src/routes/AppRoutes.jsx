import { Routes, Route } from 'react-router-dom';
import Navbar from '../components/common/Navbar.jsx';
import Home from '../pages/Home.jsx';
import Login from '../pages/Login.jsx';
import Register from '../pages/Register.jsx';
import AdminDashboard from '../pages/AdminDashboard.jsx';
import JourneyDetails from '../pages/JourneyDetails.jsx';
import Plans from '../pages/Plans.jsx';
import LandingAttribution from '../components/common/LandingAttribution.jsx';

export default function AppRoutes() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <LandingAttribution />
      <Navbar />
      <div className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/plans" element={<Plans />} />
          <Route path="/admin/journeys" element={<AdminDashboard />} />
          <Route path="/admin/journeys/:journeyId" element={<JourneyDetails />} />
          <Route path="/guest-dashboard/cad-practice/:dimension" element={<Home />} />
          <Route path="/user-dashboard/cad-practice/:dimension" element={<Home />} />
        </Routes>
      </div>
    </div>
  );
}
