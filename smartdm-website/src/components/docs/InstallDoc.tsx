import React from 'react';
import { Copy, Terminal, Download, Cpu } from 'lucide-react';
import { usePublicConfig } from '../../hooks/usePublicConfig';

interface InstallDocProps {
  triggerToast?: (msg: string) => void;
}

export const InstallDoc: React.FC<InstallDocProps> = ({ triggerToast }) => {
  const publicConfig = usePublicConfig();

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    if (triggerToast) triggerToast('Copied terminal command to clipboard!');
  };

  const appImageCmd = `chmod +x ${publicConfig.appImageFilename}\n./${publicConfig.appImageFilename}`;
  const debCmd = `sudo dpkg -i ${publicConfig.debFilename}\nsudo apt-get install -f`;

  return (
    <div className="doc-panel active">
      <span className="doc-kicker">DOCS / INSTALLATION</span>
      <h3>Installing SmartDM Desktop v{publicConfig.version}</h3>
      <p>Follow the platform instructions below to install SmartDM on Windows or Linux environments.</p>

      {/* Java 21 LTS Runtime Box */}
      <div style={{ margin: '1.5rem 0', padding: '1.25rem', borderRadius: '12px', background: 'rgba(255, 140, 0, 0.08)', border: '1px solid rgba(255, 140, 0, 0.25)', display: 'flex', gap: '0.85rem' }}>
        <Cpu size={22} color="#ff9800" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <strong style={{ color: '#ff9800', display: 'block', fontSize: '0.92rem', marginBottom: '0.2rem' }}>
            Java 21 LTS & JavaFX 21 Runtime Requirement
          </strong>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            SmartDM requires <strong>Java 21 LTS</strong>. The standalone Windows installer automatically downloads and isolates an official Adoptium OpenJDK 21 JRE runtime if Java is not installed on your PC—no manual configuration required.
          </span>
        </div>
      </div>

      <ul className="step-list">
        <li>
          <span>01</span>
          <div>
            <b>Standalone Windows Installer (.exe) - Recommended</b>
            <p>
              Download <code>{publicConfig.windowsFilename}</code> and run the setup wizard. The installer automatically downloads Java 21 runtime if missing and opens the <strong>Guided First-Run Integration Window</strong> on launch.
            </p>
            <div style={{ marginTop: '0.75rem' }}>
              <a href={publicConfig.windowsDownloadUrl} className="button button-small button-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <Download size={14} /> Download {publicConfig.windowsFilename}
              </a>
            </div>
          </div>
        </li>

        <li>
          <span>02</span>
          <div>
            <b>Portable Zip Distribution</b>
            <p>
              Download <code>desktop-1.0.6.zip</code>, extract to your preferred directory (e.g. <code>C:\Program Files\SmartDM</code> or <code>~/SmartDM</code>), and launch <code>SmartDM.exe</code> (Windows) or <code>./bin/desktop</code> (Linux).
            </p>
          </div>
        </li>

        <li>
          <span>03</span>
          <div>
            <b>Linux AppImage (Universal)</b>
            <p>Make the AppImage binary executable and launch it directly from terminal or application launcher:</p>
            <div className="terminal-box">
              <div className="terminal-title">
                <Terminal size={14} />
                <span>Bash / Terminal</span>
              </div>
              <code>{appImageCmd}</code>
              <button
                className="copy-button"
                onClick={() => copyText(appImageCmd)}
                title="Copy Command"
              >
                <Copy size={16} />
              </button>
            </div>
            <div style={{ marginTop: '0.75rem' }}>
              <a href={publicConfig.appImageDownloadUrl} className="button button-small button-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <Download size={14} /> Download {publicConfig.appImageFilename}
              </a>
            </div>
          </div>
        </li>

        <li>
          <span>04</span>
          <div>
            <b>Debian / Ubuntu Package (.deb)</b>
            <p>Install via dpkg package manager to integrate with system menu shortcuts:</p>
            <div className="terminal-box">
              <div className="terminal-title">
                <Terminal size={14} />
                <span>Bash / Terminal</span>
              </div>
              <code>{debCmd}</code>
              <button
                className="copy-button"
                onClick={() => copyText(debCmd)}
                title="Copy Command"
              >
                <Copy size={16} />
              </button>
            </div>
            <div style={{ marginTop: '0.75rem' }}>
              <a href={publicConfig.debDownloadUrl} className="button button-small button-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <Download size={14} /> Download {publicConfig.debFilename}
              </a>
            </div>
          </div>
        </li>
      </ul>
    </div>
  );
};
