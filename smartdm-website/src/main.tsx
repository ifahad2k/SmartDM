import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { App } from './App';
import './styles/globals.css';

window.addEventListener('error', (event) => {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `<div style="padding: 40px; color: #ff6b8a; background: #070916; min-height: 100vh; font-family: monospace; z-index: 999999; position: relative;">
      <h2>Runtime JS Error:</h2>
      <pre style="white-space: pre-wrap; word-break: break-all;">${event.error?.stack || event.message}</pre>
    </div>`;
  }
});

window.addEventListener('unhandledrejection', (event) => {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `<div style="padding: 40px; color: #ff6b8a; background: #070916; min-height: 100vh; font-family: monospace; z-index: 999999; position: relative;">
      <h2>Unhandled Promise Rejection:</h2>
      <pre style="white-space: pre-wrap; word-break: break-all;">${event.reason?.stack || event.reason}</pre>
    </div>`;
  }
});

try {
  const rootEl = document.getElementById('root');
  if (rootEl) {
    ReactDOM.createRoot(rootEl).render(
      <React.StrictMode>
        <ErrorBoundary>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ErrorBoundary>
      </React.StrictMode>
    );
  }
} catch (err: any) {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `<div style="padding: 40px; color: #ff6b8a; background: #070916; min-height: 100vh; font-family: monospace; z-index: 999999; position: relative;">
      <h2>Startup Error:</h2>
      <pre style="white-space: pre-wrap; word-break: break-all;">${err?.stack || err}</pre>
    </div>`;
  }
}
