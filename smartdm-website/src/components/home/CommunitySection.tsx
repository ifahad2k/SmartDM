import React from 'react';
import { Bug, Lightbulb, MessageSquare, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { smartdmConfig } from '../../config/smartdmConfig';

export const CommunitySection: React.FC = () => {
  return (
    <section className="section community-section" id="community">
      <div className="container">
        <div className="section-heading">
          <span className="eyebrow">OPEN COMMUNITY</span>
          <h2>Built together by developers and users</h2>
          <p>
            SmartDM is open source software. Report bugs, submit feature requests, or join architectural discussions on GitHub.
          </p>
        </div>

        <div className="community-grid">
          <Link
            className="community-card bug"
            to="/feedback/bug"
          >
            <div className="community-icon">
              <Bug size={24} />
            </div>
            <div>
              <small>SmartDM Feedback</small>
              <h3>Report a Bug</h3>
              <p>Found an issue with multi-segment downloads or browser interception? Submit a reproducible report.</p>
            </div>
            <div className="card-arrow">
              <ArrowRight size={20} />
            </div>
          </Link>

          <Link
            className="community-card idea"
            to="/feedback/feature"
          >
            <div className="community-icon">
              <Lightbulb size={24} />
            </div>
            <div>
              <small>Feature Requests</small>
              <h3>Propose an Idea</h3>
              <p>Have an idea for media extractors, queue schedulers, or UI themes? Shape the roadmap with us.</p>
            </div>
            <div className="card-arrow">
              <ArrowRight size={20} />
            </div>
          </Link>

          <a
            className="community-card"
            href={smartdmConfig.links.discussions}
            target="_blank"
            rel="noreferrer"
          >
            <div className="community-icon">
              <MessageSquare size={24} />
            </div>
            <div>
              <small>GitHub Discussions</small>
              <h3>Join Discussions</h3>
              <p>Ask questions, share custom classification rules, or discuss local AI integrations with the community.</p>
            </div>
            <div className="card-arrow">
              <ArrowRight size={20} />
            </div>
          </a>
        </div>
      </div>
    </section>
  );
};
