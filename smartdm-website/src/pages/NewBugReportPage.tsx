import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { Bug } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const NewBugReportPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    summary: '',
    platform: 'windows',
    stepsToReproduce: '',
    expectedBehavior: '',
    actualBehavior: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setLoading(true);
    setError(null);

    try {
      await addDoc(collection(db, 'feedback'), {
        type: 'bug',
        status: 'new',
        priority: 'unassigned',
        createdBy: user.uid,
        createdByEmail: user.email,
        createdByName: user.displayName || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...formData
      });
      alert('Bug report submitted successfully! Thank you.');
      navigate('/');
    } catch (err: any) {
      console.error(err);
      setError('Failed to submit bug report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ padding: '8rem 1rem 6rem', maxWidth: '800px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ background: 'var(--danger-glow)', padding: '0.75rem', borderRadius: '12px' }}>
          <Bug size={32} color="var(--danger)" />
        </div>
        <h1 style={{ margin: 0 }}>Report a Bug</h1>
      </div>

      <div className="card" style={{ padding: '2rem' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {error && <div className="alert" style={{ background: 'var(--danger-glow)', color: 'var(--danger)', padding: '1rem', borderRadius: '8px' }}>{error}</div>}

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Issue Title</label>
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
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Summary</label>
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
              <select 
                className="input" 
                value={formData.platform}
                onChange={e => setFormData({...formData, platform: e.target.value})}
              >
                <option value="windows">Windows</option>
                <option value="linux">Linux</option>
                <option value="browser_extension">Browser Extension</option>
                <option value="website">Website</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Steps to Reproduce</label>
            <textarea 
              required
              rows={4}
              className="input" 
              placeholder="1. Open app&#10;2. Click on..."
              value={formData.stepsToReproduce}
              onChange={e => setFormData({...formData, stepsToReproduce: e.target.value})}
            ></textarea>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="submit" className="button button-primary" disabled={loading}>
              {loading ? 'Submitting...' : <>Submit Report</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
