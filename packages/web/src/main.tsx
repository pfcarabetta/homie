import React from 'react';
import ReactDOM from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import App from './App';
import './index.css';

// Note: Google Analytics is initialized inline in index.html so the first
// page_view fires before React boots. See services/analytics.ts for the
// no-op `initAnalytics` helper kept for backward compatibility.

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </React.StrictMode>,
);
