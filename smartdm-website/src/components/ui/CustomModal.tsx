import React from 'react';
import { CheckCircle, AlertTriangle, Info, X, Trash2 } from 'lucide-react';

interface CustomModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  type?: 'success' | 'error' | 'info' | 'danger';
  confirmText?: string;
  cancelText?: string;
  showCancel?: boolean;
  onConfirm: () => void;
  onClose?: () => void;
}

export const CustomModal: React.FC<CustomModalProps> = ({
  isOpen,
  title,
  message,
  type = 'info',
  confirmText = 'OK',
  cancelText = 'Cancel',
  showCancel = false,
  onConfirm,
  onClose
}) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle size={32} color="var(--green)" />;
      case 'error':
      case 'danger':
        return <AlertTriangle size={32} color="var(--danger)" />;
      default:
        return <Info size={32} color="var(--cyan)" />;
    }
  };

  const isDanger = type === 'danger' || type === 'error';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(4, 8, 20, 0.8)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        padding: '1rem',
        animation: 'modalFadeIn 0.2s ease-out'
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '460px',
          padding: '2rem',
          position: 'relative',
          background: 'linear-gradient(145deg, rgba(17, 24, 48, 0.96), rgba(9, 13, 28, 0.98))',
          border: `1px solid ${isDanger ? 'rgba(255, 107, 138, 0.45)' : 'rgba(46, 231, 255, 0.3)'}`,
          boxShadow: isDanger
            ? '0 20px 60px rgba(0, 0, 0, 0.85), 0 0 35px rgba(255, 107, 138, 0.2)'
            : '0 20px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(46, 231, 255, 0.15)',
          borderRadius: '18px',
          textAlign: 'center'
        }}
      >
        {onClose && (
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '0.25rem',
              borderRadius: '50%'
            }}
          >
            <X size={18} />
          </button>
        )}

        <div
          style={{
            display: 'inline-flex',
            padding: '0.75rem',
            borderRadius: '50%',
            background: isDanger ? 'rgba(255, 107, 138, 0.12)' : 'rgba(255, 255, 255, 0.03)',
            marginBottom: '1rem'
          }}
        >
          {getIcon()}
        </div>

        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.3rem', color: isDanger ? 'var(--danger)' : 'var(--text)' }}>
          {title}
        </h3>

        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.5, margin: '0 0 1.5rem 0' }}>
          {message}
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
          {showCancel && (
            <button
              onClick={onClose}
              className="button button-ghost"
              style={{ minWidth: '100px', padding: '0.6rem 1.25rem', fontWeight: 600 }}
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`button ${isDanger ? 'button-danger' : 'button-primary'}`}
            style={{
              minWidth: '120px',
              padding: '0.6rem 1.5rem',
              fontWeight: 700,
              background: isDanger ? 'linear-gradient(135deg, #ff416c, #ff4b2b)' : undefined,
              borderColor: isDanger ? '#ff416c' : undefined,
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem'
            }}
          >
            {isDanger && <Trash2 size={16} />} {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
