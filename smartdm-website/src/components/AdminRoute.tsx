import React from 'react';
import { useAuth } from '../context/AuthContext';

interface AdminRouteProps {
  children: React.ReactNode;
}

export const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const { user } = useAuth();
  const isAdmin = user?.isAdmin ?? false;

  if (!user || !isAdmin) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={accessDeniedBadge}>RESTRICTED ACCESS</div>
          <h2 style={{ fontSize: '1.8rem', margin: '12px 0', color: '#ff6b8a' }}>Administrator Required</h2>
          <p style={{ color: 'var(--muted, #9aa6c5)', fontSize: '0.92rem', marginBottom: '24px', lineHeight: 1.6 }}>
            You do not have permission to access the SmartDM Admin Portal. This area requires an admin user session context.
          </p>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <a href="/" style={buttonPrimaryStyle}>
              Return Home
            </a>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

const containerStyle: React.CSSProperties = {
  minHeight: '80vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '60px 20px',
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '520px',
  background: 'rgba(17, 22, 43, 0.85)',
  border: '1px solid rgba(255, 107, 138, 0.3)',
  borderRadius: '24px',
  padding: '36px',
  textAlign: 'center',
  backdropFilter: 'blur(20px)',
  boxShadow: '0 30px 90px rgba(0,0,0,0.6)',
};

const accessDeniedBadge: React.CSSProperties = {
  display: 'inline-block',
  padding: '4px 12px',
  borderRadius: '999px',
  background: 'rgba(255, 107, 138, 0.15)',
  color: '#ff6b8a',
  fontSize: '0.72rem',
  fontWeight: 800,
  letterSpacing: '0.12em',
};

const buttonPrimaryStyle: React.CSSProperties = {
  padding: '12px 20px',
  borderRadius: '12px',
  border: 'none',
  background: 'linear-gradient(135deg, #2ee7ff, #65caff)',
  color: '#041018',
  fontWeight: 800,
  fontSize: '0.88rem',
  cursor: 'pointer',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
};
