import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import DiagnosticChat from '@/pages/DiagnosticChat';
import ProviderResults from '@/pages/ProviderResults';
import ProviderPortal from '@/pages/ProviderPortal';
import Login from '@/pages/Login';
import Register from '@/pages/Register';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<DiagnosticChat />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/results/:jobId" element={<ProviderResults />} />
          <Route path="/portal" element={<ProviderPortal />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
