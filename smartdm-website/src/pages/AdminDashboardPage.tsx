import React, { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, updateDoc, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ShieldCheck } from 'lucide-react';

export const AdminDashboardPage: React.FC = () => {
  const [feedback, setFeedback] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFeedback = async () => {
      try {
        const q = query(collection(db, 'feedback'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setFeedback(data);
      } catch (err) {
        console.error('Failed to fetch feedback', err);
      } finally {
        setLoading(false);
      }
    };
    fetchFeedback();
  }, []);

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'feedback', id), { status: newStatus });
      setFeedback(prev => prev.map(f => f.id === id ? { ...f, status: newStatus } : f));
    } catch (err) {
      console.error('Failed to update status', err);
      alert('Failed to update status. Check permissions.');
    }
  };

  return (
    <div className="container" style={{ padding: '6rem 0', minHeight: '80vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <ShieldCheck size={32} color="var(--primary)" />
        <h1 style={{ margin: 0 }}>Admin Dashboard</h1>
      </div>

      <div className="card" style={{ padding: '2rem' }}>
        <h2 style={{ marginTop: 0, marginBottom: '1.5rem', fontSize: '1.25rem' }}>User Feedback & Ideas</h2>
        
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
            Loading feedback...
          </div>
        ) : feedback.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No feedback submitted yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '1rem 0.5rem', color: 'var(--text-secondary)' }}>Type</th>
                  <th style={{ padding: '1rem 0.5rem', color: 'var(--text-secondary)' }}>Title</th>
                  <th style={{ padding: '1rem 0.5rem', color: 'var(--text-secondary)' }}>Status</th>
                  <th style={{ padding: '1rem 0.5rem', color: 'var(--text-secondary)' }}>User Email</th>
                  <th style={{ padding: '1rem 0.5rem', color: 'var(--text-secondary)' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {feedback.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '1rem 0.5rem', textTransform: 'capitalize' }}>
                      <span className={`badge ${item.type === 'bug' ? 'badge-danger' : 'badge-primary'}`}>
                        {item.type}
                      </span>
                    </td>
                    <td style={{ padding: '1rem 0.5rem', maxWidth: '300px' }}>
                      <strong>{item.title}</strong>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.summary}
                      </div>
                    </td>
                    <td style={{ padding: '1rem 0.5rem' }}>
                      <span className="badge" style={{ background: 'var(--surface-light)' }}>{item.status}</span>
                    </td>
                    <td style={{ padding: '1rem 0.5rem', fontSize: '0.9rem' }}>{item.createdByEmail}</td>
                    <td style={{ padding: '1rem 0.5rem' }}>
                      <select 
                        value={item.status} 
                        onChange={(e) => updateStatus(item.id, e.target.value)}
                        style={{ padding: '0.25rem', borderRadius: '4px', background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
                      >
                        <option value="new">New</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
