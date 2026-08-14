import React, { useState, useEffect } from 'react';
import { Download, Monitor, Copy, CheckCircle2, ShieldAlert } from 'lucide-react';
import { smartdmConfig, getDownloadUrl } from '../../config/smartdmConfig';

interface DownloadsSectionProps {
  triggerToast?: (msg: string) => void;
}

export const DownloadsSection: React.FC<DownloadsSectionProps> = ({ triggerToast }) => {
  const [detectedOs, setDetectedOs] = useState<'windows' | 'linux' | 'other'>('windows');

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('win')) {
      setDetectedOs('windows');
    } else if (ua.includes('linux')) {
      setDetectedOs('linux');
    } else {
      setDetectedOs('other');
    }
  }, []);

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    if (triggerToast) {
      triggerToast('SHA-256 Checksum copied to clipboard!');
    }
  };

  return (
    <section className="section download-section" id="download">
      <div className="container">
        <div className="section-heading">
          <span className="eyebrow">DOWNLOAD SMARTDM</span>
          <h2>Get SmartDM v{smartdmConfig.version} for your platform</h2>
          <p>
            Free, local-first, and open source under GPL-3.0. Download native installers or standalone packages below.
          </p>
        </div>

        <div className="download-grid">
          {/* Windows Download Card */}
          <div className={`download-card ${detectedOs === 'windows' ? 'recommended' : ''}`}>
            {detectedOs === 'windows' && <span className="recommend-badge">Your Platform</span>}
            <div className="os-icon">
              <Monitor size={28} />
            </div>
            <div>
              <small>Windows 10 / 11 (64-bit)</small>
              <h3>Windows Setup</h3>
              <p>Official installer with auto-updater, background service, and context menu integrations.</p>
            </div>
            <div className="download-meta">
              <span>v{smartdmConfig.version}</span>
              <span>{smartdmConfig.releaseAssets.windows.architecture}</span>
              <span>{smartdmConfig.releaseAssets.windows.size}</span>
            </div>
            <a
              className="button button-primary"
              href={getDownloadUrl('windows')}
            >
              <Download size={18} />
              <span>Download .EXE</span>
            </a>
            <div className="asset-name">{smartdmConfig.releaseAssets.windows.filename}</div>
          </div>

          {/* Linux AppImage Download Card */}
          <div className="download-card">
            <span className="coming-soon-badge">Coming Soon</span>
            <div className="os-icon">
              <Monitor size={28} />
            </div>
            <div>
              <small>Universal Linux Package</small>
              <h3>Linux AppImage</h3>
              <p>Standalone executable for Ubuntu, Fedora, Arch, Debian, and all glibc 2.29+ distros.</p>
            </div>
            <div className="download-meta">
              <span>In Development</span>
              <span>x86_64</span>
            </div>
            <button className="button button-disabled" disabled>
              <Download size={18} />
              <span>Coming Soon</span>
            </button>
            <div className="asset-name">Linux release in active development</div>
          </div>

          {/* Debian / Ubuntu .deb Download Card */}
          <div className="download-card">
            <span className="coming-soon-badge">Coming Soon</span>
            <div className="os-icon">
              <Monitor size={28} />
            </div>
            <div>
              <small>Debian & Ubuntu Distros</small>
              <h3>Debian Package</h3>
              <p>Native .deb package with apt desktop integration and systemd service scripts.</p>
            </div>
            <div className="download-meta">
              <span>In Development</span>
              <span>amd64</span>
            </div>
            <button className="button button-disabled" disabled>
              <Download size={18} />
              <span>Coming Soon</span>
            </button>
            <div className="asset-name">Debian/Ubuntu release in active development</div>
          </div>
        </div>

        {/* Checksum Verification Box */}
        <div className="path-box" style={{ marginTop: '36px' }}>
          <div className="terminal-title">
            <ShieldAlert size={14} style={{ color: 'var(--cyan)' }} />
            <span>Official Release SHA-256 Checksum</span>
          </div>
          <code>{smartdmConfig.checksums.windows}</code>
          <button
            className="copy-button"
            onClick={() => handleCopyHash(smartdmConfig.checksums.windows)}
            title="Copy SHA-256 Hash"
            aria-label="Copy SHA-256 Hash"
          >
            <Copy size={16} />
          </button>
        </div>

        <div className="download-footer">
          <p>
            <CheckCircle2 size={16} style={{ color: 'var(--green)' }} />
            <span>GPL-3.0 License</span>
          </p>
          <p>•</p>
          <p>
            <CheckCircle2 size={16} style={{ color: 'var(--green)' }} />
            <span>Code Signed Executable</span>
          </p>
          <p>•</p>
          <p>
            <CheckCircle2 size={16} style={{ color: 'var(--green)' }} />
            <span>100% VirusTotal Clean</span>
          </p>
        </div>
      </div>
    </section>
  );
};
