import React from 'react';
import { Copy, Terminal, Download } from 'lucide-react';
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

      <ul className="step-list">
        <li>
          <span>01</span>
          <div>
            <b>Windows Installation (.exe)</b>
            <p>
              Download <code>{publicConfig.windowsFilename}</code> and run the installer executable. It will guide you through directory selection and auto-register system tray integration.
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
          <span>03</span>
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
