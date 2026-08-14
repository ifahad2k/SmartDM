import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { MessageSquare, CheckCircle2, Sparkles, Trash2, ArrowRight } from 'lucide-react';
import { IconClock as Clock, IconAlertCircle as AlertCircle, IconArrowLeft as ArrowLeft, IconBookmark as Bookmark } from '../components/ui/Icons';
import { Link, useNavigate } from 'react-router-dom';
import { UserFeedbackItem } from '../types';
import { getSavedDrafts, deleteDraft, SavedDraft } from '../utils/draftManager';

export const MySubmissionsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<UserFeedbackItem[]>([]);
  const [drafts, setDrafts] = useState<SavedDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'submissions' | 'drafts'>('submissions');

  useEffect(() => {
    setDrafts(getSavedDrafts());

    const fetchUserSubmissions = async () => {
      if (!user?.uid) {
        setLoading(false);
        return;
      }
      try {
        const q = query(
          collection(db, 'feedback'),
          where('createdBy', '==', user.uid),
          orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as UserFeedbackItem[];
        setSubmissions(data);
      } catch (err) {
        console.warn('Fallback query without index:', err);
        try {
          const qSimple = query(
            collection(db, 'feedback'),
            where('createdBy', '==', user.uid)
          );
          const snapshotSimple = await getDocs(qSimple);
          const dataSimple = snapshotSimple.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as UserFeedbackItem[];
          setSubmissions(dataSimple);
        } catch (fallbackErr) {
          console.error('Failed to load user submissions', fallbackErr);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchUserSubmissions();
  }, [user?.uid]);

  const handleDeleteDraft = (draftId: string) => {
    deleteDraft(draftId);
    setDrafts(prev => prev.filter(d => d.id !== draftId));
  };

  const handleResumeDraft = (draft: SavedDraft) => {
    const route = draft.type === 'feature' ? '/feedback/feature' : '/feedback/bug';
    navigate(`${route}?draft=${draft.id}`);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'resolved':
      case 'closed':
        return <span className="badge badge-primary" style={{ background: 'rgba(84,242,181,0.15)', color: 'var(--green)' }}><CheckCircle2 size={12} /> Resolved</span>;
      case 'in_progress':
      case 'under_review':
        return <span className="badge badge-secondary" style={{ background: 'rgba(159,102,255,0.15)', color: 'var(--violet)' }}><Sparkles size={12} /> In Progress</span>;
      case 'rejected':
        return <span className="badge badge-danger"><AlertCircle size={12} /> Declined</span>;
      default:
        return <span className="badge" style={{ background: 'var(--surface-light)', color: 'var(--text-secondary)' }}><Clock size={12} /> Under Review</span>;
    }
  };

  return (
    <div className="container" style={{ padding: '6rem 0 4rem 0', minHeight: '80vh' }}>
      <div style={{ marginBottom: '2rem' }}>
        <Link to="/" className="button button-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', padding: '0.5rem 1rem' }}>
          <ArrowLeft size={16} /> Back to Home
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '2rem', background: 'var(--brand-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              My Feedback Portal
            </h1>
            <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0 0 0' }}>
              Track status updates, resume saved drafts, and view admin replies.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Link to="/feedback/bug" className="button button-secondary">
              Report Bug
            </Link>
            <Link to="/feedback/feature" className="button button-primary">
              Suggest Feature
            </Link>
          </div>
        </div>
      </div>

      {/* Tabs: Published Submissions vs Saved Drafts */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', background: 'var(--surface)', padding: '0.3rem', borderRadius: '10px', width: 'fit-content', border: '1px solid var(--border)' }}>
        <button
          onClick={() => setActiveTab('submissions')}
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'submissions' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'submissions' ? '#041018' : 'var(--text-secondary)',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: '0.9rem'
          }}
        >
          Published Submissions ({submissions.length})
        </button>
        <button
          onClick={() => setActiveTab('drafts')}
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'drafts' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'drafts' ? '#041018' : 'var(--text-secondary)',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}
        >
          <Bookmark size={15} /> Saved Drafts ({drafts.length})
        </button>
      </div>

      <div className="card" style={{ padding: '2rem' }}>
        {activeTab === 'drafts' ? (
          <div>
            <h2 style={{ marginTop: 0, marginBottom: '1.5rem', fontSize: '1.3rem' }}>Your Saved Drafts</h2>
            {drafts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
                <Bookmark size={40} color="var(--text-tertiary)" />
                <p style={{ marginTop: '0.75rem' }}>No saved drafts found. You can save any draft directly from the proposal or bug report forms!</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '1.25rem' }}>
                {drafts.map(draft => (
                  <div
                    key={draft.id}
                    style={{
                      padding: '1.25rem',
                      borderRadius: '12px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '1rem'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                        <span className={`badge ${draft.type === 'bug' ? 'badge-danger' : 'badge-primary'}`}>
                          {draft.type} draft
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                          Saved {draft.savedAt ? draft.savedAt.split('T')[0] : 'Recently'}
                        </span>
                      </div>
                      <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem' }}>{draft.title}</h3>
                      <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                        {draft.summary || 'No summary text.'}
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleResumeDraft(draft)}
                        className="button button-primary button-small"
                        style={{ gap: '0.4rem', fontSize: '0.85rem' }}
                      >
                        Resume Draft <ArrowRight size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteDraft(draft.id)}
                        className="button button-ghost button-small"
                        style={{ color: 'var(--danger)', padding: '0.4rem' }}
                        title="Delete draft"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            Loading your submissions...
          </div>
        ) : submissions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <MessageSquare size={48} style={{ color: 'var(--text-tertiary)', marginBottom: '1rem' }} />
            <h3 style={{ margin: '0 0 0.5rem 0' }}>No submissions found</h3>
            <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto 1.5rem auto' }}>
              You haven't submitted any feedback yet. Help us improve SmartDM by sharing your thoughts or bug reports!
            </p>
            <Link to="/feedback/feature" className="button button-primary">
              Submit Your First Idea
            </Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '1.5rem' }}>
            {submissions.map((item) => (
              <div
                key={item.id}
                style={{
                  padding: '1.5rem',
                  borderRadius: '12px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  transition: 'border-color 0.2s'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.75rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                      <span className={`badge ${item.type === 'bug' ? 'badge-danger' : 'badge-primary'}`}>
                        {item.type}
                      </span>
                      {getStatusBadge(item.status)}
                    </div>
                    <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{item.title}</h3>
                  </div>
                  {item.createdAt && (
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                      {typeof item.createdAt === 'string' ? item.createdAt.split('T')[0] : 'Recently'}
                    </span>
                  )}
                </div>

                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', margin: '0 0 1rem 0', lineHeight: 1.5 }}>
                  {(item as any).summary || item.description || item.actualBehavior || item.problemStatement || 'No description provided.'}
                </p>

                {item.adminResponse && (
                  <div style={{ padding: '1rem', borderRadius: '8px', background: 'rgba(46,231,255,0.06)', borderLeft: '3px solid var(--primary)', marginTop: '1rem' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '0.25rem' }}>
                      SmartDM Team Response
                    </div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text)' }}>
                      {item.adminResponse}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
