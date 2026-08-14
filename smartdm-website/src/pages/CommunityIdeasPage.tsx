import React from 'react';
import { FeatureUpvoteList } from '../components/feedback/FeatureUpvoteList';
import { Link } from 'react-router-dom';
import { Lightbulb } from 'lucide-react';
import { IconArrowLeft as ArrowLeft } from '../components/ui/Icons';

export const CommunityIdeasPage: React.FC = () => {
  return (
    <div className="container" style={{ padding: '6rem 0 4rem 0', minHeight: '80vh' }}>
      <div style={{ marginBottom: '2rem' }}>
        <Link to="/" className="button button-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', padding: '0.5rem 1rem' }}>
          <ArrowLeft size={16} /> Back to Home
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '2rem', background: 'var(--brand-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              SmartDM Community Roadmap & Ideas
            </h1>
            <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0 0 0' }}>
              Vote for community feature proposals and help shape the next release of SmartDM.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link to="/feedback/bug" className="button button-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', borderColor: 'rgba(255,107,138,0.4)', color: 'var(--danger)' }}>
              Report a Bug
            </Link>
            <Link to="/feedback/feature" className="button button-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              <Lightbulb size={18} /> Propose New Feature
            </Link>
          </div>
        </div>
      </div>

      <FeatureUpvoteList />
    </div>
  );
};
