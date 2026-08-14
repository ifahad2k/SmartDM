import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc, arrayUnion, arrayRemove, increment } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { IconThumbsUp as ThumbsUp, IconMessageCircle as MessageCircle, IconSend as Send, IconEye as Eye, IconEyeOff as EyeOff } from '../ui/Icons';
import { Sparkles, Trash2 } from 'lucide-react';
import { CustomSelect } from '../ui/CustomSelect';
import { CustomModal } from '../ui/CustomModal';
import { UserFeedbackItem } from '../../types';
import { checkRateLimit, recordRateLimitAction } from '../../utils/rateLimiter';
import { moderateSubmission } from '../../services/geminiModerationService';

interface CommentItem {
  id: string;
  userId: string;
  userName: string;
  userEmail?: string;
  text: string;
  createdAt: string;
}

export const FeatureUpvoteList: React.FC = () => {
  const { user } = useAuth();
  const [features, setFeatures] = useState<UserFeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [activeCommentBox, setActiveCommentBox] = useState<{ [id: string]: boolean }>({});
  const [commentInput, setCommentInput] = useState<{ [id: string]: string }>({});
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const loadFeatures = async () => {
    let combined: UserFeedbackItem[] = [];

    // Fetch exclusively from Firestore
    try {
      if (db) {
        const q = query(
          collection(db, 'feedback'),
          where('type', '==', 'feature')
        );
        const snapshot = await getDocs(q);
        const firestoreData = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as UserFeedbackItem[];
        combined = [...firestoreData];
      }
    } catch (err) {
      console.warn('Firestore query fallback note:', err);
      try {
        const localItems: UserFeedbackItem[] = JSON.parse(localStorage.getItem('smartdm_local_features') || '[]');
        combined = [...localItems];
      } catch (e) {}
    }

    // Clean up local storage cache so deleted items don't leak
    try {
      localStorage.removeItem('smartdm_local_features');
    } catch (e) {}

    // Sort by upvotes descending
    combined.sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0));
    setFeatures(combined);
    setLoading(false);
  };

  useEffect(() => {
    loadFeatures();
  }, []);

  const handleToggleUpvote = async (featureId: string, currentUpvotedBy: string[] = []) => {
    if (!user) {
      alert('Please sign in to upvote feature requests.');
      return;
    }

    const hasUpvoted = currentUpvotedBy.includes(user.uid);

    // Optimistic UI update
    setFeatures(prev =>
      prev.map(f => {
        if (f.id === featureId) {
          const newUpvotedBy = hasUpvoted
            ? (f.upvotedBy || []).filter(id => id !== user.uid)
            : [...(f.upvotedBy || []), user.uid];
          const newCount = (f.upvotes || 0) + (hasUpvoted ? -1 : 1);
          return { ...f, upvotedBy: newUpvotedBy, upvotes: Math.max(0, newCount) };
        }
        return f;
      })
    );

    // Sync to Firestore
    try {
      if (db && !featureId.startsWith('local_')) {
        const featureRef = doc(db, 'feedback', featureId);
        await updateDoc(featureRef, {
          upvotedBy: hasUpvoted ? arrayRemove(user.uid) : arrayUnion(user.uid),
          upvotes: increment(hasUpvoted ? -1 : 1)
        });
      }
    } catch (err) {
      console.warn('Firestore upvote note:', err);
    }
  };

  const handleAdminToggleHide = async (featureId: string, currentHidden: boolean) => {
    const newHiddenState = !currentHidden;
    setFeatures(prev => prev.map(f => f.id === featureId ? { ...f, hidden: newHiddenState } : f));

    try {
      if (db && !featureId.startsWith('local_')) {
        await updateDoc(doc(db, 'feedback', featureId), { hidden: newHiddenState });
      }
    } catch (err) {
      console.warn('Admin hide sync error:', err);
    }
  };

  const executeAdminDelete = async () => {
    if (!deleteTargetId) return;
    const featureId = deleteTargetId;
    setDeleteTargetId(null);

    setFeatures(prev => prev.filter(f => f.id !== featureId));

    try {
      if (db && !featureId.startsWith('local_')) {
        await deleteDoc(doc(db, 'feedback', featureId));
      }
    } catch (err) {
      console.warn('Admin delete error:', err);
    }
  };

  const handleAddComment = async (featureId: string) => {
    const text = commentInput[featureId]?.trim();
    if (!user) {
      alert('Please sign in to post comments on feature requests.');
      return;
    }
    if (!text) return;

    // 1. Anti-Spam Rate Limit Verification (1 comment per 2 minutes)
    const rateCheck = checkRateLimit(user.uid, 'comment');
    if (!rateCheck.allowed) {
      alert(rateCheck.message);
      return;
    }

    // 2. Gemini AI & Vulgarity Safety Verification
    const moderation = await moderateSubmission('User Comment', text);
    if (!moderation.safe) {
      alert(`Comment rejected: ${moderation.reason || 'Content contains inappropriate language.'}`);
      return;
    }

    const newComment: CommentItem = {
      id: `comment_${Date.now()}`,
      userId: user.uid,
      userName: user.displayName || user.email?.split('@')[0] || 'Community Member',
      userEmail: user.email || '',
      text,
      createdAt: new Date().toISOString()
    };

    // Optimistic UI update
    setFeatures(prev =>
      prev.map(f => {
        if (f.id === featureId) {
          const existingComments = (f as any).comments || [];
          return { ...f, comments: [...existingComments, newComment] };
        }
        return f;
      })
    );

    setCommentInput(prev => ({ ...prev, [featureId]: '' }));

    // Sync to Firestore
    try {
      if (db && !featureId.startsWith('local_')) {
        const featureRef = doc(db, 'feedback', featureId);
        await updateDoc(featureRef, {
          comments: arrayUnion(newComment)
        });
      }
    } catch (err) {
      console.warn('Firestore comment sync note:', err);
    }

    // Record rate limit timestamp
    recordRateLimitAction(user.uid, 'comment');
  };

  const filteredFeatures = features.filter(item => {
    // Hide items marked as hidden unless logged in as Admin
    if ((item as any).hidden === true && !user?.isAdmin) {
      return false;
    }
    if (filterPlatform === 'all') return true;
    return (item as any).platform === filterPlatform;
  });

  return (
    <div className="card" style={{ padding: '2rem' }}>
      <CustomModal
        isOpen={!!deleteTargetId}
        title="Delete Feature Proposal"
        message="Are you sure you want to permanently delete this community feature proposal? This action cannot be undone."
        type="danger"
        showCancel={true}
        confirmText="Permanently Delete"
        cancelText="Cancel"
        onConfirm={executeAdminDelete}
        onClose={() => setDeleteTargetId(null)}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles color="var(--violet)" size={20} /> Community Feature Requests
          </h2>
          <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>
            Vote and comment on features you want to see built into future SmartDM updates.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '200px' }}>
          <CustomSelect
            value={filterPlatform}
            onChange={(val) => setFilterPlatform(val)}
            options={[
              { value: 'all', label: 'All Platforms' },
              { value: 'windows', label: 'Windows' },
              { value: 'linux', label: 'Linux' },
              { value: 'browser_extension', label: 'Browser Extension' },
              { value: 'website', label: 'Website' },
              { value: 'other', label: 'Other / All' }
            ]}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
          Loading community ideas...
        </div>
      ) : filteredFeatures.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
          No feature suggestions match this filter. Be the first to suggest one!
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1.25rem' }}>
          {filteredFeatures.map(item => {
            const upvotedByList = item.upvotedBy || [];
            const isUpvoted = user ? upvotedByList.includes(user.uid) : false;
            const count = item.upvotes || upvotedByList.length || 0;
            const commentsList: CommentItem[] = (item as any).comments || [];
            const showComments = activeCommentBox[item.id] || false;
            const isHidden = (item as any).hidden === true;

            return (
              <div
                key={item.id}
                style={{
                  padding: '1.25rem',
                  borderRadius: '12px',
                  background: 'var(--surface)',
                  border: `1px solid ${isHidden ? 'rgba(255,107,138,0.4)' : 'var(--border)'}`,
                  transition: 'border-color 0.2s'
                }}
              >
                <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start' }}>
                  {/* Upvote Button */}
                  <button
                    onClick={() => handleToggleUpvote(item.id, upvotedByList)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0.6rem 0.8rem',
                      borderRadius: '8px',
                      border: `1px solid ${isUpvoted ? 'var(--primary)' : 'var(--border)'}`,
                      background: isUpvoted ? 'rgba(46,231,255,0.14)' : 'var(--surface-light)',
                      color: isUpvoted ? 'var(--primary)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      minWidth: '54px',
                      transition: 'all 0.2s'
                    }}
                  >
                    <ThumbsUp size={16} style={{ marginBottom: '0.25rem' }} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{count}</span>
                  </button>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{item.title}</h3>
                      {(item as any).platform && (
                        <span className="badge" style={{ background: 'var(--surface-light)', fontSize: '0.75rem' }}>
                          {(item as any).platform}
                        </span>
                      )}
                      {isHidden && (
                        <span className="badge" style={{ background: 'rgba(255,107,138,0.2)', color: 'var(--danger)', fontSize: '0.75rem' }}>
                          HIDDEN FROM PUBLIC
                        </span>
                      )}
                      {(item as any).createdByName && (
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                          By {(item as any).createdByName}
                        </span>
                      )}
                    </div>

                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', margin: '0 0 0.75rem 0', lineHeight: 1.5 }}>
                      {item.description || (item as any).summary || (item as any).proposedSolution || 'No description available.'}
                    </p>

                    {((item as any).imageUrls?.length > 0 || (item as any).imageUrl) && (
                      <div style={{ margin: '0.5rem 0 0.75rem 0', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {((item as any).imageUrls && (item as any).imageUrls.length > 0 ? (item as any).imageUrls : [(item as any).imageUrl]).map((imgSrc: string, i: number) => (
                          <a key={i} href={imgSrc} target="_blank" rel="noreferrer">
                            <img
                              src={imgSrc}
                              alt={`Attached mockup ${i + 1}`}
                              style={{ width: '160px', height: '110px', borderRadius: '10px', border: '1px solid var(--border)', objectFit: 'cover' }}
                            />
                          </a>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => setActiveCommentBox(prev => ({ ...prev, [item.id]: !showComments }))}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-secondary)',
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          padding: '0.2rem 0'
                        }}
                      >
                        <MessageCircle size={15} color="var(--primary)" />
                        <span>{commentsList.length} {commentsList.length === 1 ? 'Comment' : 'Comments'}</span>
                      </button>

                      {/* Admin Moderation Controls */}
                      {user?.isAdmin && (
                        <div style={{ display: 'inline-flex', gap: '0.5rem', marginLeft: 'auto' }}>
                          <button
                            onClick={() => handleAdminToggleHide(item.id, isHidden)}
                            className="button button-ghost button-small"
                            style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', gap: '0.25rem' }}
                          >
                            {isHidden ? <><Eye size={12} /> Unhide</> : <><EyeOff size={12} /> Hide</>}
                          </button>
                          <button
                            onClick={() => setDeleteTargetId(item.id)}
                            className="button button-ghost button-small"
                            style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', gap: '0.25rem', color: 'var(--danger)' }}
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Comments Section */}
                {showComments && (
                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', paddingLeft: '4rem' }}>
                    {commentsList.length > 0 ? (
                      <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}>
                        {commentsList.map(c => (
                          <div key={c.id} style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                              <strong style={{ fontSize: '0.85rem', color: 'var(--primary)' }}>{c.userName}</strong>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                                {c.createdAt ? c.createdAt.split('T')[0] : 'Recently'}
                              </span>
                            </div>
                            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text)', lineHeight: 1.4 }}>{c.text}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginBottom: '1rem' }}>No comments yet. Start the conversation!</p>
                    )}

                    {/* Add Comment Input */}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        type="text"
                        className="input"
                        placeholder={user ? "Write a comment..." : "Sign in to write a comment..."}
                        disabled={!user}
                        value={commentInput[item.id] || ''}
                        onChange={(e) => setCommentInput({ ...commentInput, [item.id]: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddComment(item.id); }}
                        style={{ fontSize: '0.85rem', padding: '0.4rem 0.75rem' }}
                      />
                      <button
                        onClick={() => handleAddComment(item.id)}
                        disabled={!user || !commentInput[item.id]?.trim()}
                        className="button button-primary"
                        style={{ padding: '0.4rem 0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                      >
                        <Send size={14} /> Comment
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
