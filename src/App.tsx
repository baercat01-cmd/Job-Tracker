import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { LoginPage } from './pages/LoginPage';
import { ForemanDashboard } from './pages/foreman/ForemanDashboard';
import { OfficeDashboard } from './pages/office/OfficeDashboard';
import { PayrollDashboard } from './pages/payroll/PayrollDashboard';
import { ShopDashboard } from './pages/shop/ShopDashboard';
import { AdminSetup } from './pages/AdminSetup';
import { PinSetupPage } from './pages/PinSetupPage';
import { UserSelectPage } from './pages/UserSelectPage';
import { QuoteIntakePage } from './pages/office/QuoteIntakePage';
import { BuildingEstimatorPage } from './pages/office/BuildingEstimatorPage';
import { ZohoSettingsPage } from './pages/office/ZohoSettingsPage';
import { ZohoBooksPage } from './pages/office/ZohoBooksPage';
import { ZohoWorkDrivePage } from './pages/office/ZohoWorkDrivePage';
import { VendorPricingForm } from './pages/VendorPricingForm';
import { CustomerPortal } from './pages/customer/CustomerPortal';
import { SubcontractorPortal } from './pages/SubcontractorPortal';
import { useEffect } from 'react';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-800 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { user, profile } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/" replace />} />
      <Route path="/pin-setup" element={<PinSetupPage />} />
      <Route path="/user-select" element={<UserSelectPage />} />
      <Route path="/admin-setup" element={<AdminSetup />} />
      <Route path="/quote-intake" element={<QuoteIntakePage />} />
      <Route path="/vendor-pricing/:token" element={<VendorPricingForm />} />
      <Route path="/customer-portal/:accessToken" element={<CustomerPortal />} />
      <Route path="/subcontractor-portal" element={<SubcontractorPortal />} />
      
      {/* Office Routes */}
      <Route
        path="/office/estimator"
        element={
          <ProtectedRoute allowedRoles={['office', 'admin']}>
            <BuildingEstimatorPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/office/zoho-settings"
        element={
          <ProtectedRoute allowedRoles={['office', 'admin']}>
            <ZohoSettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/office/zoho-books"
        element={
          <ProtectedRoute allowedRoles={['office', 'admin']}>
            <ZohoBooksPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/office/zoho-workdrive"
        element={
          <ProtectedRoute allowedRoles={['office', 'admin']}>
            <ZohoWorkDrivePage />
          </ProtectedRoute>
        }
      />
      
      {/* Role-based Dashboard Routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            {profile?.role === 'foreman' || profile?.role === 'crew' ? (
              <ForemanDashboard />
            ) : profile?.role === 'office' || profile?.role === 'admin' ? (
              <OfficeDashboard />
            ) : profile?.role === 'payroll' ? (
              <PayrollDashboard />
            ) : profile?.role === 'shop' ? (
              <ShopDashboard />
            ) : (
              <Navigate to="/login" replace />
            )}
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

function App() {
  useEffect(() => {
    // Register service worker for PWA
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {
          // Service worker registration failed, but app still works
        });
      });
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <AppRoutes />
          <Toaster 
            position="top-center" 
            richColors 
            expand={true}
            duration={4000}
          />
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
