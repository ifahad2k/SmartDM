import React, { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, updateDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ShieldCheck, MessageSquare, Trash2 } from 'lucide-react';
import { IconSettings as Settings, IconSend as Send, IconEye as Eye, IconEyeOff as EyeOff } from '../components/ui/Icons';
import { AdminReleaseManager } from '../components/admin/AdminReleaseManager';
import { CustomModal } from '../components/ui/CustomModal';

export const AdminDashboardPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'feedback' | 'release'>('feedback');
  const [feedback, setFeedback] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyInput, setReplyInput] = useState<{ [id: string]: string }>({});
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchFeedback = async () => {
    let combined: any[] = [];
    try {
      if (db) {
        const q = query(collection(db, 'feedback'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        combined = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      }
    } catch (err) {
      console.warn('Query fallback without ordering:', err);
      try {
        if (db) {
          const snapshotSimple = await getDocs(collection(db, 'feedback'));
          combined = snapshotSimple.docs.map(d => ({ id: d.id, ...d.data() }));
        }
      } catch (err2) {
        console.error('Failed to fetch feedback from Firestore', err2);
      }
    }

    // Clean up any stale local storage cache
    try {
      localStorage.removeItem('smartdm_local_features');
    } catch (e) {}

    setFeedback(combined);
    setLoading(false);
  };

  useEffect(() => {
    fetchFeedback();
  }, []);

  const updateStatus = async (id: string, newStatus: string) => {
    setFeedback(prev => prev.map(f => f.id === id ? { ...f, status: newStatus } : f));
    try {
      if (db && !id.startsWith('local_')) {
        await updateDoc(doc(db, 'feedback', id), { status: newStatus });
      }
    } catch (err) {
      console.error('Failed to update status', err);
    }
  };

  const handleToggleHide = async (id: string, currentHidden: boolean) => {
    const newHiddenState = !currentHidden;
    setFeedback(prev => prev.map(f => f.id === id ? { ...f, hidden: newHiddenState } : f));

    try {
      if (db && !id.startsWith('local_')) {
        await updateDoc(doc(db, 'feedback', id), { hidden: newHiddenState });
      }
    } catch (err) {
      console.error('Failed to toggle hide status', err);
    }
  };

  const executeDelete = async () => {
    if (!deleteTargetId) return;
    const id = deleteTargetId;
    setDeleteTargetId(null);

    // Optimistically remove from state
    setFeedback(prev => prev.filter(f => f.id !== id));

    try {
      if (db && !id.startsWith('local_')) {
        await deleteDoc(doc(db, 'feedback', id));
      }

      setToastMessage({ text: 'Item permanently deleted from database.', type: 'success' });
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err: any) {
      console.error('Failed to delete item from Firestore:', err);
      setToastMessage({ text: 'Item removed from view.', type: 'success' });
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  const handleSaveResponse = async (id: string) => {
    const responseText = replyInput[id];
    if (!responseText) return;

    setFeedback(prev => prev.map(f => f.id === id ? { ...f, adminResponse: responseText } : f));

    try {
      if (db && !id.startsWith('local_')) {
        await updateDoc(doc(db, 'feedback', id), { adminResponse: responseText });
      }

      setToastMessage({ text: 'Official response saved and published!', type: 'success' });
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err) {
      console.error('Failed to publish response', err);
    }
  };

  return (
    <div className="container" style={{ padding: '6rem 0', minHeight: '80vh' }}>
      {/* Custom Glassmorphic Confirmation Modal */}
      <CustomModal
        isOpen={!!deleteTargetId}
        title="Delete Submission"
        message="Are you sure you want to permanently delete this report/suggestion? This action cannot be undone."
        type="danger"
        showCancel={true}
        confirmText="Permanently Delete"
        cancelText="Cancel"
        onConfirm={executeDelete}
        onClose={() => setDeleteTargetId(null)}
      />

      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            background: toastMessage.type === 'error' ? 'rgba(255, 107, 138, 0.95)' : 'rgba(84, 242, 181, 0.95)',
            color: '#041018',
            padding: '1rem 1.5rem',
            borderRadius: '12px',
            fontWeight: 700,
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
          }}
        >
          {toastMessage.text}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <ShieldCheck size={32} color="var(--primary)" />
          <h1 style={{ margin: 0 }}>Admin Dashboard</h1>
        </div>

        <div style={{ display: 'flex', background: 'var(--surface)', padding: '0.25rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <button
            onClick={() => setActiveTab('feedback')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: 'none',
              background: activeTab === 'feedback' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'feedback' ? '#041018' : 'var(--text-secondary)',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <MessageSquare size={16} /> User Submissions ({feedback.length})
          </button>
          <button
            onClick={() => setActiveTab('release')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: 'none',
              background: activeTab === 'release' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'release' ? '#041018' : 'var(--text-secondary)',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <Settings size={16} /> Release Config Manager
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: '2rem' }}>
        {activeTab === 'release' ? (
          <AdminReleaseManager />
        ) : (
          <>
            <h2 style={{ marginTop: 0, marginBottom: '1.5rem', fontSize: '1.25rem' }}>User Submissions & Moderation Triage</h2>

            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                Loading feedback items...
              </div>
            ) : feedback.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No user reports or feedback submitted yet.</p>
            ) : (
              <div style={{ display: 'grid', gap: '1.5rem' }}>
                {feedback.map(item => {
                  const isHidden = item.hidden === true;

                  return (
                    <div key={item.id} style={{ padding: '1.25rem', borderRadius: '12px', background: 'var(--surface)', border: `1px solid ${isHidden ? 'rgba(255,107,138,0.4)' : 'var(--border)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.75rem' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                            <span className={`badge ${item.type === 'bug' ? 'badge-danger' : 'badge-primary'}`}>
                              {item.type}
                            </span>
                            <span className="badge" style={{ background: 'var(--surface-light)' }}>{item.status || 'new'}</span>
                            {item.platform && <span className="badge" style={{ background: 'rgba(255,255,255,0.04)' }}>{item.platform}</span>}
                            {isHidden && <span className="badge" style={{ background: 'rgba(255,107,138,0.2)', color: 'var(--danger)' }}>HIDDEN FROM PUBLIC</span>}
                          </div>
                          <h3 style={{ margin: 0, fontSize: '1.15rem' }}>{item.title}</h3>
                          <small style={{ color: 'var(--text-tertiary)' }}>
                            Submitted by {item.createdByName || item.createdByEmail || 'Anonymous User'}
                          </small>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          {/* Admin Hide/Unhide Action */}
                          <button
                            onClick={() => handleToggleHide(item.id, isHidden)}
                            className="button button-secondary button-small"
                            style={{ fontSize: '0.78rem', gap: '0.3rem', color: isHidden ? 'var(--green)' : 'var(--text-secondary)' }}
                            title={isHidden ? "Unhide from community roadmap" : "Hide from public roadmap"}
                          >
                            {isHidden ? <><Eye size={14} /> Unhide</> : <><EyeOff size={14} /> Hide</>}
                          </button>

                          {/* Admin Custom Delete Action */}
                          <button
                            onClick={() => setDeleteTargetId(item.id)}
                            className="button button-secondary button-small"
                            style={{ fontSize: '0.78rem', gap: '0.3rem', borderColor: 'rgba(255,107,138,0.3)', color: 'var(--danger)' }}
                            title="Permanently delete this item"
                          >
                            <Trash2 size={14} /> Delete
                          </button>

                          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginLeft: '0.25rem' }}>Status:</span>
                          <select
                            value={item.status || 'new'}
                            onChange={(e) => updateStatus(item.id, e.target.value)}
                            style={{ padding: '0.3rem 0.6rem', borderRadius: '6px', background: 'var(--surface-light)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: '0.85rem' }}
                          >
                            <option value="new">New</option>
                            <option value="in_progress">In Progress</option>
                            <option value="resolved">Resolved</option>
                            <option value="rejected">Rejected</option>
                          </select>
                        </div>
                      </div>

                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', margin: '0 0 0.75rem 0', lineHeight: 1.5 }}>
                        {item.summary || item.description || item.proposedSolution || item.stepsToReproduce || 'No text summary available.'}
                      </p>

                      {item.problem && (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginBottom: '0.5rem' }}>
                          <strong>Problem Statement:</strong> {item.problem}
                        </div>
                      )}

                      {item.stepsToReproduce && (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginBottom: '0.5rem' }}>
                          <strong>Steps to Reproduce:</strong> {item.stepsToReproduce}
                        </div>
                      )}

                      {/* Attached Images Render */}
                      {(item.imageUrls?.length > 0 || item.imageUrl) && (
                        <div style={{ marginTop: '0.75rem', marginBottom: '0.75rem', padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <strong style={{ fontSize: '0.85rem', color: 'var(--primary)' }}>Attached Screenshots:</strong>
                          </div>
                          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                            {(item.imageUrls && item.imageUrls.length > 0 ? item.imageUrls : [item.imageUrl]).map((imgSrc: string, i: number) => (
                              <a key={i} href={imgSrc} target="_blank" rel="noreferrer">
                                <img
                                  src={imgSrc}
                                  alt={`Attachment ${i + 1}`}
                                  style={{ maxWidth: '240px', maxHeight: '180px', borderRadius: '8px', border: '1px solid var(--border)', objectFit: 'cover', background: '#000' }}
                                />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                          {item.adminResponse ? 'Update Official Response:' : 'Add Official Response:'}
                        </label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <input
                            type="text"
                            className="input"
                            placeholder="Type reply to user..."
                            value={replyInput[item.id] ?? (item.adminResponse || '')}
                            onChange={(e) => setReplyInput({ ...replyInput, [item.id]: e.target.value })}
                            style={{ fontSize: '0.85rem', padding: '0.4rem 0.75rem' }}
                          />
                          <button
                            onClick={() => handleSaveResponse(item.id)}
                            className="button button-primary"
                            style={{ padding: '0.4rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                          >
                            <Send size={14} /> Send Reply
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
