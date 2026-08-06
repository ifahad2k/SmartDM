import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { Lightbulb } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CustomSelect } from '../components/ui/CustomSelect';

export const NewFeaturePage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    summary: '',
    platform: 'windows',
    problem: '',
    proposedSolution: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setLoading(true);
    setError(null);

    try {
      await addDoc(collection(db, 'feedback'), {
        type: 'feature',
        status: 'new',
        priority: 'unassigned',
        createdBy: user.uid,
        createdByEmail: user.email,
        createdByName: user.displayName || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...formData
      });
      alert('Feature request submitted successfully! Thank you.');
      navigate('/');
    } catch (err: any) {
      console.error(err);
      setError('Failed to submit feature request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ padding: '8rem 1rem 6rem', maxWidth: '800px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ background: 'var(--primary-glow)', padding: '0.75rem', borderRadius: '12px' }}>
          <Lightbulb size={32} color="var(--primary)" />
        </div>
        <h1 style={{ margin: 0 }}>Propose an Idea</h1>
      </div>

      <div className="card" style={{ padding: '2rem' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {error && <div className="alert" style={{ background: 'var(--danger-glow)', color: 'var(--danger)', padding: '1rem', borderRadius: '8px' }}>{error}</div>}

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Feature Title</label>
            <input 
              type="text" 
              required
              maxLength={120}
              className="input" 
              placeholder="E.g., Dark mode support for Linux"
              value={formData.title}
              onChange={e => setFormData({...formData, title: e.target.value})}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Summary</label>
            <textarea 
              required
              maxLength={5000}
              rows={2}
              className="input" 
              placeholder="A brief overview of the idea..."
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
                  { value: 'website', label: 'Website' },
                  { value: 'other', label: 'Other / All' }
                ]}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Priority Level</label>
              <CustomSelect 
                value={formData.priority}
                onChange={val => setFormData({...formData, priority: val})}
                options={[
                  { value: 'nice_to_have', label: 'Nice to have' },
                  { value: 'important', label: 'Important' },
                  { value: 'must_have', label: 'Must have (Critical)' }
                ]}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>What problem does this solve?</label>
            <textarea 
              required
              rows={3}
              className="input" 
              placeholder="Describe the issue you're facing..."
              value={formData.problem}
              onChange={e => setFormData({...formData, problem: e.target.value})}
            ></textarea>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Proposed Solution</label>
            <textarea 
              required
              rows={3}
              className="input" 
              placeholder="How would you like to see this fixed/added?"
              value={formData.proposedSolution}
              onChange={e => setFormData({...formData, proposedSolution: e.target.value})}
            ></textarea>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="submit" className="button button-primary" disabled={loading}>
              {loading ? 'Submitting...' : <>Submit Idea</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
