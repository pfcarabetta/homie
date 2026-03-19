import { BrowserRouter, Routes, Route } from 'react-router-dom';
import DiagnosticChat from '@/pages/DiagnosticChat';
import ProviderResults from '@/pages/ProviderResults';
import ProviderPortal from '@/pages/ProviderPortal';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DiagnosticChat />} />
        <Route path="/results/:jobId" element={<ProviderResults />} />
        <Route path="/portal" element={<ProviderPortal />} />
      </Routes>
    </BrowserRouter>
  );
}
