import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/layout/Layout';
import { HomePage } from './pages/HomePage';
import { DocsLayout } from './components/docs/DocsLayout';
import { InstallDoc } from './components/docs/InstallDoc';
import { BrowserExtensionDoc } from './components/docs/BrowserExtensionDoc';
import { SecurityDoc } from './components/docs/SecurityDoc';
import { TroubleshootingDoc } from './components/docs/TroubleshootingDoc';

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <Layout>
        <div style={{ padding: '100px 20px', textAlign: 'center', color: '#2ee7ff', zIndex: 9999, position: 'relative' }}>
          <h1 style={{ fontSize: '3rem' }}>SmartDM AI Download Manager</h1>
          <p style={{ color: '#fff', fontSize: '1.2rem' }}>Next Generation Open Source Speed & Media Intelligence</p>
        </div>
        <Routes>
          <Route path="/" element={<HomePage />} />

          <Route path="/docs" element={<DocsLayout />}>
            <Route index element={<Navigate to="/docs/install" replace />} />
            <Route path="install" element={<InstallDoc />} />
            <Route path="browser-extension" element={<BrowserExtensionDoc />} />
            <Route path="security" element={<SecurityDoc />} />
            <Route path="troubleshooting" element={<TroubleshootingDoc />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </AuthProvider>
  );
};
