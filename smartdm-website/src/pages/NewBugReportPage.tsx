import React, { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { Bug, X, Plus } from 'lucide-react';
import { IconLoader as Loader2, IconBookmarkCheck as BookmarkCheck } from '../components/ui/Icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CustomSelect } from '../components/ui/CustomSelect';
import { CustomModal } from '../components/ui/CustomModal';
import { DangerToast } from '../components/ui/DangerToast';
import { compressImage } from '../utils/imageCompressor';
import { moderateSubmission } from '../services/geminiModerationService';
import { checkRateLimit, recordRateLimitAction, getRemainingSeconds } from '../utils/rateLimiter';
import { saveDraft, getSavedDrafts, deleteDraft } from '../utils/draftManager';

export const NewBugReportPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [dangerMessage, setDangerMessage] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [cooldownSecs, setCooldownSecs] = useState<number>(0);
  const [draftSavedToast, setDraftSavedToast] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    summary: '',
    platform: 'windows',
    stepsToReproduce: '',
    expectedBehavior: '',
    actualBehavior: ''
  });

  // Run 1-second interval loop to tick live countdown timer on button
  useEffect(() => {
    const checkTimer = () => {
      const rem = getRemainingSeconds(user?.uid, 'bug');
      setCooldownSecs(rem);
    };

    checkTimer();
    const interval = setInterval(checkTimer, 1000);
    return () => clearInterval(interval);
  }, [user?.uid]);

  // Load draft if draft parameter provided
  useEffect(() => {
    const draftId = searchParams.get('draft');
    if (draftId) {
      const drafts = getSavedDrafts();
      const match = drafts.find(d => d.id === draftId);
      if (match) {
        setFormData({
          title: match.title || '',
          summary: match.summary || '',
          platform: match.platform || 'windows',
          stepsToReproduce: match.stepsToReproduce || '',
          expectedBehavior: '',
          actualBehavior: ''
        });
        if (match.imageUrls && match.imageUrls.length > 0) {
          setImages(match.imageUrls);
        } else if (match.imageUrl) {
          setImages([match.imageUrl]);
        }
      }
    }
  }, [searchParams]);

  const handleMultipleImagesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (images.length + files.length > 4) {
      setDangerMessage('You can attach a maximum of 4 screenshots.');
      return;
    }

    try {
      setCompressing(true);
      setDangerMessage(null);

      const compressedList: string[] = [];
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) {
          setDangerMessage('Each image file size must be under 10MB.');
          continue;
        }
        const compressedDataUrl = await compressImage(file);
        compressedList.push(compressedDataUrl);
      }

      setImages(prev => [...prev, ...compressedList].slice(0, 4));
    } catch (err) {
      console.error(err);
      setDangerMessage('Failed to process image files. Please try valid images.');
    } finally {
      setCompressing(false);
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveDraft = () => {
    if (!formData.title && !formData.summary) {
      setDangerMessage('Please enter an issue title or summary to save as draft.');
      return;
    }

    saveDraft({
      type: 'bug',
      title: formData.title || 'Untitled Bug Draft',
      summary: formData.summary,
      platform: formData.platform,
      stepsToReproduce: formData.stepsToReproduce,
      imageUrl: images[0] || undefined,
      imageUrls: images
    });

    setDraftSavedToast(true);
    setTimeout(() => setDraftSavedToast(false), 3500);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setDangerMessage('Please sign in to submit a bug report.');
      return;
    }

    // 1. Anti-Spam Rate Limit Verification (5 minutes = 300 seconds)
    const rateCheck = checkRateLimit(user.uid, 'bug');
    if (!rateCheck.allowed) {
      setDangerMessage(rateCheck.message || 'Anti-Spam Protection: Please wait 5 minutes before submitting another bug report.');
      return;
    }

    setLoading(true);
    setDangerMessage(null);

    try {
      // 2. Strict Vulgarity & Gemini AI Content Verification (Pass all images)
      const moderation = await moderateSubmission(
        formData.title,
        `${formData.summary} ${formData.stepsToReproduce}`,
        images
      );

      if (!moderation.safe) {
        setDangerMessage(moderation.reason || 'Content contains inappropriate language or imagery.');
        return;
      }

      // Immediately lock device for 5 minutes (300 seconds) upon submission
      recordRateLimitAction(user.uid, 'bug');
      setCooldownSecs(300);

      const newBugItem = {
        type: 'bug',
        status: 'new',
        priority: 'unassigned',
        hidden: false,
        createdBy: user.uid,
        createdByEmail: user.email,
        createdByName: user.displayName || user.email?.split('@')[0] || 'Community Member',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        imageUrl: images[0] || '',
        imageUrls: images,
        ...formData
      };

      // 3. Save to Firestore
      if (db) {
        await addDoc(collection(db, 'feedback'), {
          ...newBugItem,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      // Delete loaded draft if any
      const draftId = searchParams.get('draft');
      if (draftId) deleteDraft(draftId);

      setShowSuccessModal(true);
    } catch (err: any) {
      console.error('Submission error:', err);
      setDangerMessage(err.message || 'Failed to submit bug report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleModalConfirm = () => {
    setShowSuccessModal(false);
    navigate('/account/submissions');
  };

  const minutes = Math.floor(cooldownSecs / 60);
  const seconds = cooldownSecs % 60;
  const timerLabel = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  const isLocked = cooldownSecs > 0;

  return (
    <div className="container" style={{ padding: '8rem 1rem 6rem', maxWidth: '800px' }}>
      <CustomModal
        isOpen={showSuccessModal}
        title="Bug Report Submitted"
        message="Thank you! Your bug report has been AI-verified and logged in your submissions portal."
        type="success"
        confirmText="Track My Submissions"
        onConfirm={handleModalConfirm}
      />

      {/* Floating Bottom-Right Danger Toast */}
      <DangerToast
        message={dangerMessage}
        onClose={() => setDangerMessage(null)}
      />

      {draftSavedToast && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999, background: 'rgba(84, 242, 181, 0.95)', color: '#041018', padding: '1rem 1.5rem', borderRadius: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
          <BookmarkCheck size={20} /> Draft saved successfully! Access it anytime from your account dashboard.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ background: 'var(--danger-glow)', padding: '0.75rem', borderRadius: '12px' }}>
          <Bug size={32} color="var(--danger)" />
        </div>
        <h1 style={{ margin: 0 }}>Report a Bug</h1>
      </div>

      <div className="card" style={{ padding: '2rem' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Issue Title *</label>
            <input 
              type="text" 
              required
              maxLength={120}
              className="input" 
              placeholder="Briefly describe the issue..."
              value={formData.title}
              onChange={e => setFormData({...formData, title: e.target.value})}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Summary *</label>
            <textarea 
              required
              maxLength={5000}
              rows={3}
              className="input" 
              placeholder="More details about the issue..."
              value={formData.summary}
              onChange={e => setFormData({...formData, summary: e.target.value})}
            ></textarea>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Platform</label>
              <CustomSelect 
                value={formData.platform}
                onChange={val => setFormData({...formData, platform: val})}
                options={[
                  { value: 'windows', label: 'Windows' },
                  { value: 'linux', label: 'Linux' },
                  { value: 'browser_extension', label: 'Browser Extension' },
                  { value: 'website', label: 'Website' }
                ]}
              />
            </div>
          </div>

          {/* Optional Steps to Reproduce */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
              Steps to Reproduce <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(Optional)</span>
            </label>
            <textarea 
              rows={4}
              className="input" 
              placeholder="1. Open app&#10;2. Click on... (optional)"
              value={formData.stepsToReproduce}
              onChange={e => setFormData({...formData, stepsToReproduce: e.target.value})}
            ></textarea>
          </div>

          {/* Multiple Image Attachment Support */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
              Attach Screenshots or Error Logs <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(Optional - Max 4 images - Gemini AI Verified)</span>
            </label>

            {compressing ? (
              <div style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--danger)', background: 'rgba(255,107,138,0.05)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <Loader2 size={24} className="animate-spin" style={{ display: 'inline-block', marginBottom: '0.4rem' }} />
                <div>Optimizing image size...</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.5rem' }}>
                {images.map((imgSrc, idx) => (
                  <div key={idx} style={{ position: 'relative', display: 'inline-block' }}>
                    <img 
                      src={imgSrc} 
                      alt={`Bug Attachment ${idx + 1}`} 
                      style={{ width: '130px', height: '100px', borderRadius: '10px', objectFit: 'cover', border: '1px solid var(--border)' }} 
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        background: 'rgba(0,0,0,0.85)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '50%',
                        padding: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}

                {images.length < 4 && (
                  <label 
                    style={{ 
                      display: 'flex', 
                      flexDirection: 'column',
                      alignItems: 'center', 
                      justifyContent: 'center',
                      width: '130px',
                      height: '100px',
                      borderRadius: '10px', 
                      border: '1px dashed var(--border)', 
                      background: 'rgba(255,255,255,0.02)', 
                      cursor: 'pointer',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    <Plus size={20} color="var(--danger)" />
                    <span style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>Add Image</span>
                    <input 
                      type="file" 
                      multiple
                      accept="image/*" 
                      onChange={handleMultipleImagesChange} 
                      style={{ display: 'none' }} 
                    />
                  </label>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons: Save Draft + Strictly Locked Submit Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <button
              type="button"
              onClick={handleSaveDraft}
              className="button button-secondary"
              disabled={loading || compressing}
            >
              Save as Draft
            </button>

            <button
              type="submit"
              className="button button-primary"
              disabled={loading || compressing || isLocked}
              style={{
                cursor: isLocked ? 'not-allowed' : 'pointer',
                opacity: isLocked ? 0.6 : 1,
                pointerEvents: isLocked ? 'none' : 'auto',
                background: isLocked ? 'rgba(255, 255, 255, 0.08)' : undefined,
                borderColor: isLocked ? 'rgba(255, 255, 255, 0.15)' : undefined,
                color: isLocked ? 'var(--text-tertiary)' : undefined
              }}
            >
              {loading ? (
                'Verifying with Gemini AI...'
              ) : isLocked ? (
                `🔒 Locked (${timerLabel})`
              ) : (
                'Submit Report'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
