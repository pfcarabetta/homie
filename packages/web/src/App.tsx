import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { ProviderAuthProvider } from '@/contexts/ProviderAuthContext';
import { InspectorAuthProvider } from '@/contexts/InspectorAuthContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import HomePage from '@/pages/HomePage';
import DiagnosticChat from '@/pages/DiagnosticChat';
import GetQuotes from '@/pages/GetQuotes';
import ProviderResults from '@/pages/ProviderResults';
import ProviderPortal from '@/pages/ProviderPortal';
import ProviderLogin from '@/pages/ProviderLogin';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ResetPassword from '@/pages/ResetPassword';
import ResetPasswordConfirm from '@/pages/ResetPasswordConfirm';
import Account from '@/pages/Account';
import BusinessPortal from '@/pages/business';
import BusinessChat from '@/pages/BusinessChat';
import BusinessLanding from '@/pages/BusinessLanding';
import ProSignup from '@/pages/ProSignup';
import InspectionLanding from '@/pages/InspectionLanding';
import InspectionInspectorsLanding from '@/pages/InspectionInspectorsLanding';
import PaymentSuccess from '@/pages/PaymentSuccess';
import VerifyEmail from '@/pages/VerifyEmail';
import Terms from '@/pages/Terms';
import Privacy from '@/pages/Privacy';
import Security from '@/pages/Security';
import AdminLogin from '@/pages/admin/AdminLogin';
import AdminLayout from '@/pages/admin/AdminLayout';
import AdminDashboard from '@/pages/admin/AdminDashboard';
import AdminHomeowners from '@/pages/admin/AdminHomeowners';
import AdminJobs from '@/pages/admin/AdminJobs';
import AdminProviders from '@/pages/admin/AdminProviders';
import AdminBookings from '@/pages/admin/AdminBookings';
import AdminBusiness from '@/pages/admin/AdminBusiness';
import AdminPricing from '@/pages/admin/AdminPricing';
import InspectorLayout from '@/pages/inspector/InspectorLayout';
import InspectorLogin from '@/pages/inspector/InspectorLogin';
import InspectorSignup from '@/pages/inspector/InspectorSignup';
import InspectorDashboard from '@/pages/inspector/InspectorDashboard';
import InspectorReports from '@/pages/inspector/InspectorReports';
import InspectorReportDetail from '@/pages/inspector/InspectorReportDetail';
import InspectorUpload from '@/pages/inspector/InspectorUpload';
import InspectorEarnings from '@/pages/inspector/InspectorEarnings';
import InspectorLeads from '@/pages/inspector/InspectorLeads';
import InspectorMarketing from '@/pages/inspector/InspectorMarketing';
import InspectorSettings from '@/pages/inspector/InspectorSettings';
import InspectReport from '@/pages/InspectReport';
import InspectProviderView from '@/pages/InspectProviderView';
import InspectPortal from '@/pages/homeowner-inspect';
import TrackingStatus from '@/pages/TrackingStatus';
import GuestReporterPage from '@/pages/GuestReporter';
import LoadingDemo from '@/pages/LoadingDemo';
import OutreachDemo from '@/pages/OutreachDemo';
import QuoteCardDemo from '@/pages/QuoteCardDemo';

export default function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <ProviderAuthProvider>
      <InspectorAuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/chat" element={<DiagnosticChat />} />
          <Route path="/quote" element={<GetQuotes />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/reset-password/confirm" element={<ResetPasswordConfirm />} />
          <Route path="/account" element={<Account />} />
          <Route path="/business" element={<BusinessPortal />} />
          <Route path="/business/landing" element={<BusinessLanding />} />
          <Route path="/inspect-portal" element={<InspectPortal />} />
          <Route path="/inspect" element={<InspectionLanding />} />
          <Route path="/inspect/inspectors" element={<InspectionInspectorsLanding />} />
          <Route path="/business/chat" element={<BusinessChat />} />
          <Route path="/payment/success" element={<PaymentSuccess />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/security" element={<Security />} />
          <Route path="/demo/loading" element={<LoadingDemo />} />
          <Route path="/demo/outreach" element={<OutreachDemo />} />
          <Route path="/demo/quote-card" element={<QuoteCardDemo />} />
          <Route path="/guest/:workspaceId/:propertyId" element={<GuestReporterPage />} />
          <Route path="/t/:token" element={<TrackingStatus />} />
          <Route path="/results/:jobId" element={<ProviderResults />} />
          <Route path="/portal/login" element={<ProviderLogin />} />
          <Route path="/portal/signup" element={<ProSignup />} />
          <Route path="/portal" element={<ProviderPortal />} />
          <Route path="/admin" element={<AdminLogin />} />
          <Route element={<AdminLayout />}>
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/homeowners" element={<AdminHomeowners />} />
            <Route path="/admin/jobs" element={<AdminJobs />} />
            <Route path="/admin/providers" element={<AdminProviders />} />
            <Route path="/admin/bookings" element={<AdminBookings />} />
            <Route path="/admin/business" element={<AdminBusiness />} />
            <Route path="/admin/pricing" element={<AdminPricing />} />
          </Route>
          <Route path="/inspector/login" element={<InspectorLogin />} />
          <Route path="/inspector/signup" element={<InspectorSignup />} />
          <Route element={<InspectorLayout />}>
            <Route path="/inspector" element={<InspectorDashboard />} />
            <Route path="/inspector/reports" element={<InspectorReports />} />
            <Route path="/inspector/reports/upload" element={<InspectorUpload />} />
            <Route path="/inspector/reports/:id" element={<InspectorReportDetail />} />
            <Route path="/inspector/earnings" element={<InspectorEarnings />} />
            <Route path="/inspector/leads" element={<InspectorLeads />} />
            <Route path="/inspector/marketing" element={<InspectorMarketing />} />
            <Route path="/inspector/settings" element={<InspectorSettings />} />
          </Route>
          <Route path="/inspect/provider/:providerToken" element={<InspectProviderView />} />
          <Route path="/inspect/:token" element={<InspectReport />} />
        </Routes>
      </BrowserRouter>
      </InspectorAuthProvider>
      </ProviderAuthProvider>
    </AuthProvider>
    </ErrorBoundary>
  );
}
