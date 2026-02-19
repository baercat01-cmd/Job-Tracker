import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import { Toaster } from 'sonner';
import { LoginPage } from '@/pages/LoginPage';
import { UserSelectPage } from '@/pages/UserSelectPage';
import { AdminSetup } from '@/pages/AdminSetup';
import { PinSetupPage } from '@/pages/PinSetupPage';
import { ForemanDashboard } from '@/pages/foreman/ForemanDashboard';
import { OfficeDashboard } from '@/pages/office/OfficeDashboard';
import { ShopDashboard } from '@/pages/shop/ShopDashboard';
import { PayrollDashboard } from '@/pages/payroll/PayrollDashboard';
import { FleetDashboard } from '@/pages/fleet/FleetDashboard';
import { QuoteIntakePage } from '@/pages/office/QuoteIntakePage';
import { BuildingEstimatorPage } from '@/pages/office/BuildingEstimatorPage';
import { ZohoSettingsPage } from '@/pages/office/ZohoSettingsPage';
import { CustomerPortal } from '@/pages/customer/CustomerPortal';
import { SubcontractorPortal } from '@/pages/SubcontractorPortal';
import { VendorPricingForm } from '@/pages/VendorPricingForm';
import { WorkbookDetailPage } from '@/pages/office/WorkbookDetailPage';
import { PWAInstallPrompt } from '@/components/ui/pwa-install-prompt';
import { OfflineIndicator } from '@/components/ui/offline-indicator';
import { ConnectionStatus } from '@/components/ui/connection-status';
import { SyncStatus } from '@/components/ui/sync-status';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/user-select" element={<UserSelectPage />} />
            <Route path="/admin-setup" element={<AdminSetup />} />
            <Route path="/setup-pin" element={<PinSetupPage />} />
            <Route path="/foreman" element={<ForemanDashboard />} />
            <Route path="/office" element={<OfficeDashboard />} />
            <Route path="/office/workbooks/:workbookId" element={<WorkbookDetailPage />} />
            <Route path="/shop" element={<ShopDashboard />} />
            <Route path="/payroll" element={<PayrollDashboard />} />
            <Route path="/fleet" element={<FleetDashboard />} />
            <Route path="/office/quote-intake" element={<QuoteIntakePage />} />
            <Route path="/office/building-estimator" element={<BuildingEstimatorPage />} />
            <Route path="/office/zoho-settings" element={<ZohoSettingsPage />} />
            <Route path="/customer-portal/:token" element={<CustomerPortal />} />
            <Route path="/subcontractor-portal" element={<SubcontractorPortal />} />
            <Route path="/vendor-pricing/:token" element={<VendorPricingForm />} />
          </Routes>
        </Router>
        
        {/* Global UI Components */}
        <PWAInstallPrompt />
        <OfflineIndicator />
        <ConnectionStatus />
        <SyncStatus />
        <Toaster position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
