import React, { useState, useEffect } from 'react';
import { Download, Monitor, Copy, CheckCircle2, Cpu } from 'lucide-react';
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
            Free, local-first, and open source under GPL-3.0. Powered by <strong>Java 21 LTS & JavaFX 21</strong>.
          </p>
        </div>

        {/* Java 21 LTS Bundled Runtime Banner */}
        <div style={{ marginBottom: '2.5rem', padding: '1.25rem 1.5rem', borderRadius: '16px', background: 'rgba(255, 140, 0, 0.08)', border: '1px solid rgba(255, 140, 0, 0.3)', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ background: 'rgba(255, 140, 0, 0.15)', padding: '0.6rem', borderRadius: '12px', color: '#ff9800' }}>
            <Cpu size={24} />
          </div>
          <div style={{ flex: 1 }}>
            <h4 style={{ margin: '0 0 0.2rem 0', fontSize: '1rem', color: '#ff9800' }}>
              Java 21 LTS Runtime Requirement (Auto-Bundled with Installer)
            </h4>
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              SmartDM runs on <strong>Java 21 LTS & JavaFX 21</strong>. The standalone Windows installer (<code>.exe</code>) automatically downloads and isolates an official Adoptium OpenJDK 21 JRE runtime if Java is missing—<strong>no manual Java installation required!</strong>
            </p>
          </div>
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
              <h3>Single-EXE Setup</h3>
              <p>Official installer with auto Java 21 setup, system tray service, and browser integration.</p>
            </div>
            <div className="download-meta">
              <span>v{publicConfig.version}</span>
              <span>Java 21 Included</span>
              <span>Direct GitHub</span>
            </div>
            <a
              className="button button-primary"
              href={publicConfig.windowsDownloadUrl}
            >
              <Download size={18} />
              <span>Download Installer (.EXE)</span>
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

          {/* Portable Zip Distribution */}
          <div className="download-card">
            <div className="os-icon">
              <Monitor size={28} />
            </div>
            <div>
              <small>Portable Zip Distribution</small>
              <h3>Portable Archive</h3>
              <p>Extract and run SmartDM directly from any directory or USB drive without system installation.</p>
            </div>
            <div className="download-meta">
              <span>v{publicConfig.version}</span>
              <span>Portable</span>
              <span>Zip Package</span>
            </div>
            <a
              className="button button-secondary"
              href={`${publicConfig.windowsDownloadUrl.substring(0, publicConfig.windowsDownloadUrl.lastIndexOf('/'))}/desktop-1.0.6.zip`}
            >
              <Download size={18} />
              <span>Download Portable (.ZIP)</span>
            </a>
            <div className="asset-name">desktop-1.0.6.zip</div>
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
        </div>

        {/* Security Integrity Card */}
        <div className="security-card" style={{ marginTop: '2.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <CheckCircle2 size={24} color="var(--green)" />
            <div>
              <strong style={{ display: 'block', fontSize: '1.05rem' }}>SHA-256 Binary Integrity Verification & SQLCipher Security</strong>
              <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                Every binary artifact built on GitHub Actions is signed and hashed. Local database is encrypted with SQLCipher.
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
