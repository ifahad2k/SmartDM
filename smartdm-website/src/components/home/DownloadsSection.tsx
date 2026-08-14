import React, { useState, useEffect } from 'react';
import { Download, Monitor, Copy, CheckCircle2 } from 'lucide-react';
import { usePublicConfig } from '../../hooks/usePublicConfig';

interface DownloadsSectionProps {
  triggerToast?: (msg: string) => void;
}

export const DownloadsSection: React.FC<DownloadsSectionProps> = ({ triggerToast }) => {
  const publicConfig = usePublicConfig();
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
    if (!hash) return;
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
          <h2>Get SmartDM v{publicConfig.version} for your platform</h2>
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
              <span>v{publicConfig.version}</span>
              <span>x64</span>
              <span>Direct GitHub</span>
            </div>
            <a
              className="button button-primary"
              href={publicConfig.windowsDownloadUrl}
            >
              <Download size={18} />
              <span>Download .EXE</span>
            </a>
            <div className="asset-name">{publicConfig.windowsFilename}</div>
            {publicConfig.windowsChecksum && (
              <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                <code style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>
                  {publicConfig.windowsChecksum.substring(0, 16)}...
                </code>
                <button
                  type="button"
                  onClick={() => handleCopyHash(publicConfig.windowsChecksum)}
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0 }}
                  title="Copy SHA-256 Checksum"
                >
                  <Copy size={12} />
                </button>
              </div>
            )}
          </div>

          {/* Linux AppImage Download Card */}
          <div className={`download-card ${detectedOs === 'linux' ? 'recommended' : ''}`}>
            {detectedOs === 'linux' && <span className="recommend-badge">Your Platform</span>}
            <div className="os-icon">
              <Monitor size={28} />
            </div>
            <div>
              <small>Universal Linux Package</small>
              <h3>Linux AppImage</h3>
              <p>Standalone executable for Ubuntu, Fedora, Arch, Debian, and all glibc 2.29+ distros.</p>
            </div>
            <div className="download-meta">
              <span>v{publicConfig.version}</span>
              <span>x86_64</span>
              <span>Standalone</span>
            </div>
            <a
              className="button button-secondary"
              href={publicConfig.appImageDownloadUrl}
            >
              <Download size={18} />
              <span>Download .AppImage</span>
            </a>
            <div className="asset-name">{publicConfig.appImageFilename}</div>
          </div>

          {/* Debian / Ubuntu .deb Download Card */}
          <div className="download-card">
            <div className="os-icon">
              <Monitor size={28} />
            </div>
            <div>
              <small>Debian & Ubuntu Distros</small>
              <h3>Debian Package</h3>
              <p>Native .deb package with apt desktop integration and systemd service scripts.</p>
            </div>
            <div className="download-meta">
              <span>v{publicConfig.version}</span>
              <span>amd64</span>
              <span>Native DEB</span>
            </div>
            <a
              className="button button-secondary"
              href={publicConfig.debDownloadUrl}
            >
              <Download size={18} />
              <span>Download .DEB</span>
            </a>
            <div className="asset-name">{publicConfig.debFilename}</div>
          </div>
        </div>

        {/* Security Integrity Card */}
        <div className="security-card" style={{ marginTop: '2.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <CheckCircle2 size={24} color="var(--green)" />
            <div>
              <strong style={{ display: 'block', fontSize: '1.05rem' }}>SHA-256 Binary Integrity Verification</strong>
              <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                Every binary artifact built on GitHub Actions is signed and hashed before distribution.
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
