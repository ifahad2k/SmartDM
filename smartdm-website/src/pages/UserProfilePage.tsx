import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, CheckCircle, RefreshCw } from 'lucide-react';
import { IconMail as Mail, IconSave as Save, IconKey as Key, IconSend as Send } from '../components/ui/Icons';
import { Link } from 'react-router-dom';

export const UserProfilePage: React.FC = () => {
  const { user, updateUserProfileName, resetPassword, resendVerificationEmail } = useAuth();
  const [displayNameInput, setDisplayNameInput] = useState(user?.displayName || '');
  const [savingName, setSavingName] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [verifySent, setVerifySent] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayNameInput.trim()) return;
    setSavingName(true);
    setStatusMsg(null);
    try {
      await updateUserProfileName(displayNameInput);
      setStatusMsg('Display name updated successfully!');
    } catch (err: any) {
      alert(`Error updating profile name: ${err.message || err}`);
    } finally {
      setSavingName(false);
    }
  };

  const handleSendResetPassword = async () => {
    if (!user?.email) return;
    try {
      await resetPassword(user.email);
      setResetSent(true);
      setStatusMsg('Password reset email sent! Check your inbox.');
    } catch (err: any) {
      alert(`Failed to send password reset email: ${err.message || err}`);
    }
  };

  const handleResendVerification = async () => {
    try {
      await resendVerificationEmail();
      setVerifySent(true);
      setStatusMsg('Verification email re-sent! Check your inbox.');
    } catch (err: any) {
      alert(`Failed to re-send verification: ${err.message || err}`);
    }
  };

  return (
    <div className="container" style={{ padding: '6rem 0', minHeight: '80vh', maxWidth: '800px' }}>
      <h1 style={{ marginBottom: '0.5rem', background: 'var(--brand-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Account Settings & Profile
      </h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
        Manage your SmartDM community account profile, credentials, and verification status.
      </p>

      {statusMsg && (
        <div style={{ padding: '1rem', borderRadius: '8px', background: 'rgba(46,231,255,0.1)', color: 'var(--primary)', border: '1px solid var(--primary)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle size={18} />
          <span>{statusMsg}</span>
        </div>
      )}

      <div style={{ display: 'grid', gap: '1.5rem' }}>
        {/* Profile Details Card */}
        <div className="card" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary), var(--violet))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#041018', fontWeight: 'bold', fontSize: '1.5rem' }}>
              {user?.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{user?.displayName || 'SmartDM Member'}</h2>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.2rem' }}>
                <Mail size={14} /> {user?.email || 'No email attached'}
              </span>
            </div>
          </div>

          <form onSubmit={handleUpdateName} style={{ display: 'grid', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.9rem' }}>
                Display Name
              </label>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <input
                  type="text"
                  required
                  className="input"
                  value={displayNameInput}
                  onChange={(e) => setDisplayNameInput(e.target.value)}
                  placeholder="Enter your name"
                />
                <button
                  type="submit"
                  disabled={savingName}
                  className="button button-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap' }}
                >
                  {savingName ? <RefreshCw size={16} className="spin" /> : <Save size={16} />}
                  <span>Save Name</span>
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Security & Verification Card */}
        <div className="card" style={{ padding: '2rem' }}>
          <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Shield size={20} color="var(--violet)" /> Account Security & Verification
          </h2>

          <div style={{ display: 'grid', gap: '1.25rem' }}>
            <div style={{ padding: '1rem', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <strong style={{ display: 'block', fontSize: '0.95rem', marginBottom: '0.2rem' }}>Email Verification Status</strong>
                <span style={{ fontSize: '0.85rem', color: user?.emailVerified ? 'var(--green)' : 'var(--amber)' }}>
                  {user?.emailVerified ? 'Verified Account' : 'Unverified Email Address'}
                </span>
              </div>
              {!user?.emailVerified && (
                <button
                  onClick={handleResendVerification}
                  disabled={verifySent}
                  className="button button-secondary"
                  style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Send size={14} /> {verifySent ? 'Email Sent' : 'Re-send Verification'}
                </button>
              )}
            </div>

            <div style={{ padding: '1rem', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <strong style={{ display: 'block', fontSize: '0.95rem', marginBottom: '0.2rem' }}>Password Management</strong>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Request a secure password reset link sent to {user?.email}
                </span>
              </div>
              <button
                onClick={handleSendResetPassword}
                disabled={resetSent}
                className="button button-secondary"
                style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Key size={14} /> {resetSent ? 'Reset Email Sent' : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <Link to="/account/submissions" className="button button-ghost">
            View My Feedback Submissions & Status →
          </Link>
        </div>
      </div>
    </div>
  );
};
