import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Download, Globe, Shield, HelpCircle } from 'lucide-react';

export const DocsLayout: React.FC = () => {
  const sidebarItems = [
    { label: 'Installation', path: '/docs/install', tag: '01', icon: <Download size={16} /> },
    { label: 'Browser Extension', path: '/docs/browser-extension', tag: '02', icon: <Globe size={16} /> },
    { label: 'Security & Verifications', path: '/docs/security', tag: '03', icon: <Shield size={16} /> },
    { label: 'Troubleshooting', path: '/docs/troubleshooting', tag: '04', icon: <HelpCircle size={16} /> },
  ];

  return (
    <section className="section docs-section">
      <div className="container">
        <div className="section-heading">
          <span className="eyebrow">DOCUMENTATION</span>
          <h2>Guides & System Manual</h2>
          <p>Everything you need to set up, configure, and optimize SmartDM on your desktop environment.</p>
        </div>

        <div className="docs-shell">
          <aside className="docs-sidebar">
            {sidebarItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                <span>{item.tag}</span>
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          </aside>

          <main className="docs-content">
            <Outlet />
          </main>
        </div>
      </div>
    </section>
  );
};
