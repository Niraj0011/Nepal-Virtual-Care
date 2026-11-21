
import React from 'react';
import { Routes, Route, Navigate, Link } from 'react-router-dom';

import { AppProvider, useApp } from './context/AppContext';
import Layout from './components/Layout';

import Home from './pages/Home';
import VirtualCare from './pages/VirtualCare';
import Community from './pages/Community';
import Auth from './pages/Auth';
import Records from './pages/Records';
import HealthInformation from './pages/HealthInformation';
import Consent from './pages/consent';
import Dashboard from './pages/Dashboard';
import DoctorDashboard from './pages/DoctorDashboard';
import AdminDashboard from './pages/AdminDashboard';
import AdminAnalytics from './pages/AdminAnalytics';
import Profile from './pages/Profile';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import TrustedDevices from './pages/TrustedDevices';
import VideoConsultation from './pages/VideoConsultation';

function getDashboardPath(role) {
  if (role === 'doctor') return '/doctor-dashboard';
  if (role === 'admin') return '/admin-dashboard';
  if (role === 'patient') return '/dashboard';

  return '/account-unavailable';
}

function AccountUnavailable() {
  return (
    <section className="page-hero">
      <div className="page-hero-content">
        <h1>Account access unavailable</h1>
        <p>
          Your account does not currently have permission to access
          this area. If you believe this is a mistake, please contact
          the administrator.
        </p>
        <Link to="/" className="btn-primary">
          Return to Home
        </Link>
      </div>
    </section>
  );
}

function ProtectedRoute({ allowedRoles, children }) {
  const { user, authLoading } = useApp();

  if (authLoading) {
    return (
      <section className="page-hero">
        <h2>Checking your account...</h2>
        <p>Please wait.</p>
      </section>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === 'inactive') {
    return <Navigate to="/account-unavailable" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return (
      <Navigate
        to={getDashboardPath(user.role)}
        replace
      />
    );
  }

  return children;
}

function NotFound() {
  return (
    <section className="page-hero">
      <h1>Page not found</h1>
      <p>The page you are looking for does not exist.</p>
    </section>
  );
}

function AppRoutes() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />

        <Route
          path="/virtual-care"
          element={<VirtualCare />}
        />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute allowedRoles={['patient']}>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/profile"
          element={
            <ProtectedRoute allowedRoles={['patient', 'doctor']}>
              <Profile />
            </ProtectedRoute>
          }
        />

        <Route
          path="/doctor-dashboard"
          element={
            <ProtectedRoute allowedRoles={['doctor']}>
              <DoctorDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin-dashboard"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin-analytics"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminAnalytics />
            </ProtectedRoute>
          }
        />

        <Route
          path="/trusted-devices"
          element={
            <ProtectedRoute allowedRoles={['doctor', 'admin']}>
              <TrustedDevices />
            </ProtectedRoute>
          }
        />

        <Route
          path="/records"
          element={
            <ProtectedRoute allowedRoles={['patient']}>
              <Records />
            </ProtectedRoute>
          }
        />

        <Route
          path="/video-consultation/:appointmentId"
          element={
            <ProtectedRoute allowedRoles={['patient', 'doctor']}>
              <VideoConsultation />
            </ProtectedRoute>
          }
        />

        <Route
          path="/community"
          element={<Community />}
        />

        <Route
          path="/register"
          element={<Auth mode="register" />}
        />

        <Route
          path="/login"
          element={<Auth mode="login" />}
        />

        <Route
          path="/forgot-password"
          element={<ForgotPassword />}
        />

        <Route
          path="/reset-password"
          element={<ResetPassword />}
        />

        <Route
          path="/verify-email"
          element={<VerifyEmail />}
        />

        <Route
          path="/health-information"
          element={<HealthInformation />}
        />

        <Route
          path="/consent"
          element={<Consent />}
        />

        <Route
          path="/account-unavailable"
          element={<AccountUnavailable />}
        />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppRoutes />
    </AppProvider>
  );
}
