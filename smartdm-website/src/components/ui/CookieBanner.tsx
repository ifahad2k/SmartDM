import React, { useState, useEffect } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { IconCookie as Cookie } from './Icons';

export const CookieBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('smartdm_cookie_consent');
    if (!consent) {
      // Show banner after 1.5 seconds if consent not set
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    // Set secure cookie consent in localStorage & Cookie header
    localStorage.setItem('smartdm_cookie_consent', 'accepted');
    document.cookie = "smartdm_session_secure=true; max-age=31536000; path=/; SameSite=Strict; Secure";
    setVisible(false);
  };

  const handleDecline = () => {
    localStorage.setItem('smartdm_cookie_consent', 'essential_only');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        right: '20px',
        maxWidth: '540px',
        zIndex: 9990,
        padding: '1.25rem',
        borderRadius: '16px',
        background: 'linear-gradient(135deg, rgba(14, 20, 42, 0.96), rgba(9, 13, 28, 0.98))',
        border: '1px solid rgba(46, 231, 255, 0.3)',
        boxShadow: '0 16px 50px rgba(0,0,0,0.8), 0 0 25px rgba(46, 231, 255, 0.15)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        animation: 'slideUp 0.3s ease-out'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        <div style={{ padding: '0.5rem', background: 'rgba(46, 231, 255, 0.1)', borderRadius: '10px', color: 'var(--cyan)' }}>
          <Cookie size={20} />
        </div>

        <div style={{ flex: 1 }}>
          <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '0.95rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            Privacy & Session Security <ShieldCheck size={14} color="var(--green)" />
          </h4>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
            SmartDM uses essential local session caching and secure SSL tokens to save your settings and deliver high-speed, local-first performance.
          </p>

          <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.85rem' }}>
            <button
              onClick={handleAccept}
              className="button button-primary"
              style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem', fontWeight: 700 }}
            >
              Accept All
            </button>
            <button
              onClick={handleDecline}
              className="button button-secondary"
              style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem' }}
            >
              Essential Only
            </button>
          </div>
        </div>

        <button
          onClick={handleDecline}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '0.2rem' }}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};
