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
