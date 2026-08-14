import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface DangerToastProps {
  message: string | null;
  onClose: () => void;
}

export const DangerToast: React.FC<DangerToastProps> = ({ message, onClose }) => {
  if (!message) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999,
        maxWidth: '440px',
        padding: '1.25rem 1.5rem',
        borderRadius: '16px',
        background: 'linear-gradient(135deg, rgba(38, 10, 18, 0.96), rgba(20, 5, 10, 0.98))',
        border: '1px solid rgba(255, 107, 138, 0.45)',
        boxShadow: '0 16px 50px rgba(0, 0, 0, 0.85), 0 0 25px rgba(255, 107, 138, 0.25)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.85rem',
        animation: 'slideInRight 0.3s ease-out',
        color: '#fff'
      }}
    >
      <div style={{ padding: '0.4rem', background: 'rgba(255, 107, 138, 0.15)', borderRadius: '10px', color: 'var(--danger)', flexShrink: 0 }}>
        <AlertTriangle size={24} />
      </div>

      <div style={{ flex: 1 }}>
        <h4 style={{ margin: '0 0 0.3rem 0', fontSize: '0.95rem', color: 'var(--danger)', fontWeight: 700 }}>
          Submission Warning
        </h4>
        <p style={{ margin: 0, fontSize: '0.86rem', color: '#ffd6e0', lineHeight: 1.45 }}>
          {message}
        </p>
      </div>

      <button
        onClick={onClose}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'rgba(255, 255, 255, 0.6)',
          cursor: 'pointer',
          padding: '0.2rem',
          borderRadius: '50%',
          flexShrink: 0
        }}
      >
        <X size={18} />
      </button>
    </div>
  );
};
