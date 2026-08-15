import React from 'react';
import { Copy, Terminal } from 'lucide-react';
import { usePublicConfig } from '../../hooks/usePublicConfig';

interface SecurityDocProps {
  triggerToast?: (msg: string) => void;
}

export const SecurityDoc: React.FC<SecurityDocProps> = ({ triggerToast }) => {
  const publicConfig = usePublicConfig();

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    if (triggerToast) triggerToast('Copied verification command to clipboard!');
  };

  const winVerifyCmd = `Get-FileHash -Algorithm SHA256 .\\${publicConfig.windowsFilename}`;
  const linuxVerifyCmd = `sha256sum ./${publicConfig.appImageFilename}`;

  return (
    <div className="doc-panel active">
      <span className="doc-kicker">DOCS / SECURITY & PRIVACY</span>
      <h3>Cryptographic Integrity & Local Security</h3>
      <p>Verify that your SmartDM download matches official source builds before running installer binaries.</p>

      <ul className="step-list">
        <li>
          <span>01</span>
          <div>
            <b>Windows PowerShell SHA-256 Verification</b>
            <div className="terminal-box">
              <div className="terminal-title">
                <Terminal size={14} />
                <span>PowerShell</span>
              </div>
              <code>{winVerifyCmd}</code>
              <button
                className="copy-button"
                onClick={() => copyText(winVerifyCmd)}
                title="Copy Command"
              >
                <Copy size={16} />
              </button>
            </div>
            {publicConfig.windowsChecksum && (
              <p style={{ marginTop: '8px' }}>Compare output against official checksum: <code>{publicConfig.windowsChecksum}</code></p>
            )}
          </div>
        </li>

        <li>
          <span>02</span>
          <div>
            <b>Linux Terminal sha256sum</b>
            <div className="terminal-box">
              <div className="terminal-title">
                <Terminal size={14} />
                <span>Linux Terminal</span>
              </div>
              <code>{linuxVerifyCmd}</code>
              <button
                className="copy-button"
                onClick={() => copyText(linuxVerifyCmd)}
                title="Copy Command"
              >
                <Copy size={16} />
              </button>
            </div>
          </div>
        </li>

        <li>
          <span>03</span>
          <div>
            <b>SQLCipher Encrypted Local Database</b>
            <p>
              SmartDM stores your download history and settings inside an SQLite database encrypted with <strong>SQLCipher</strong>. Your local data remains completely private on your storage drive.
            </p>
          </div>
        </li>

        <li>
          <span>04</span>
          <div>
            <b>Local-First Privacy & Settings Uninstaller</b>
            <p>
              SmartDM never transmits downloaded URLs, file contents, or telemetry tracking. Includes a built-in <strong>Settings Uninstaller</strong> with a data wipe checkbox to clear all app data cleanly when needed.
            </p>
          </div>
        </li>
      </ul>
    </div>
  );
};
