import React from 'react';
import { Link } from 'react-router-dom';
import { smartdmConfig } from '../../config/smartdmConfig';

export const Footer: React.FC = () => {
  return (
    <footer>
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <Link to="/">
              <img src="/assets/logo-full.png" alt="SmartDM" className="footer-logo-img" />
            </Link>
            <p>
              SmartDM is a high-speed, local-first open-source download manager designed for maximum bandwidth efficiency, media extraction, AI cataloging, and security integrity.
            </p>
          </div>

          <div>
            <h4>Product</h4>
            <a href="/#features">Features</a>
            <a href="/#download">Download for Windows</a>
            <a href="/#download">Download for Linux</a>
            <a href={smartdmConfig.githubRepo} target="_blank" rel="noreferrer">GitHub Repository</a>
          </div>

          <div>
            <h4>Documentation</h4>
            <Link to="/docs/install">Installation Guide</Link>
            <Link to="/docs/browser-extension">Browser Extension</Link>
            <Link to="/docs/security">Security & Verification</Link>
            <Link to="/docs/troubleshooting">Troubleshooting</Link>
          </div>

          <div>
            <h4>Community & Open Source</h4>
            <a href={smartdmConfig.links.discussions} target="_blank" rel="noreferrer">Discussions</a>
            <a href={smartdmConfig.links.issuesBug} target="_blank" rel="noreferrer">Report a Bug</a>
            <a href={smartdmConfig.links.issuesFeature} target="_blank" rel="noreferrer">Feature Request</a>
            <a href={smartdmConfig.links.contributing} target="_blank" rel="noreferrer">Contributing</a>
            <a href={smartdmConfig.links.license} target="_blank" rel="noreferrer">GPL-3.0 License</a>
          </div>
        </div>

        <div className="footer-bottom">
          <span>&copy; {new Date().getFullYear()} SmartDM Contributors. Released under GPL-3.0 License.</span>
          <span>Designed & Built for Open Source</span>
        </div>
      </div>
    </footer>
  );
};
