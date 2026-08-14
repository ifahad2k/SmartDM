import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/layout/Layout';
import { HomePage } from './pages/HomePage';
import { AuthPage } from './pages/AuthPage';
import { DocsLayout } from './components/docs/DocsLayout';
import { InstallDoc } from './components/docs/InstallDoc';
import { BrowserExtensionDoc } from './components/docs/BrowserExtensionDoc';
import { SecurityDoc } from './components/docs/SecurityDoc';
import { TroubleshootingDoc } from './components/docs/TroubleshootingDoc';
import { ProtectedRoute, AdminRoute } from './components/auth/RouteGuards';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { NewBugReportPage } from './pages/NewBugReportPage';
import { NewFeaturePage } from './pages/NewFeaturePage';
import { MySubmissionsPage } from './pages/MySubmissionsPage';
import { UserProfilePage } from './pages/UserProfilePage';
import { CommunityIdeasPage } from './pages/CommunityIdeasPage';

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/account/sign-in" element={<Navigate to="/login" replace />} />
          <Route path="/account/sign-up" element={<Navigate to="/login" replace />} />
          <Route path="/account/submissions" element={<ProtectedRoute><MySubmissionsPage /></ProtectedRoute>} />
          <Route path="/account/profile" element={<ProtectedRoute><UserProfilePage /></ProtectedRoute>} />
          <Route path="/community/ideas" element={<CommunityIdeasPage />} />

          <Route path="/feedback/bug" element={<ProtectedRoute><NewBugReportPage /></ProtectedRoute>} />
          <Route path="/feedback/feature" element={<ProtectedRoute><NewFeaturePage /></ProtectedRoute>} />
          
          <Route path="/admin" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />

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
