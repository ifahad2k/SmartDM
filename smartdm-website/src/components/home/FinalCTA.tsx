import React from 'react';
import { Download } from 'lucide-react';
import { GithubIcon as Github } from '../GithubIcon';
import { smartdmConfig, getDownloadUrl } from '../../config/smartdmConfig';

export const FinalCTA: React.FC = () => {
  return (
    <section className="final-cta">
      <div className="cta-aurora" aria-hidden="true" />
      <div className="container">
        <div className="final-cta-inner">
          <img src="/assets/logo-square.svg" alt="SmartDM Logo" className="cta-logo-img" />

          <div>
            <h2>Ready for high-speed intelligent downloads?</h2>
            <p>Download SmartDM v{smartdmConfig.version} for Windows and Linux. 100% free, local-first, and open source.</p>
          </div>

          <div className="cta-actions">
            <a
              className="button button-primary button-large"
              href={getDownloadUrl('windows')}
            >
              <Download size={20} />
              <span>Download SmartDM</span>
            </a>

            <a
              className="button button-secondary button-large"
              href={smartdmConfig.githubRepo}
              target="_blank"
              rel="noreferrer"
            >
              <Github size={20} />
              <span>GitHub Repo</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};
