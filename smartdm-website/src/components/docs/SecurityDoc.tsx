import React from 'react';
import { Copy, Terminal } from 'lucide-react';
import { smartdmConfig } from '../../config/smartdmConfig';

interface SecurityDocProps {
  triggerToast?: (msg: string) => void;
}

export const SecurityDoc: React.FC<SecurityDocProps> = ({ triggerToast }) => {
  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    if (triggerToast) triggerToast('Copied verification command to clipboard!');
  };

  const winVerifyCmd = `Get-FileHash -Algorithm SHA256 .\\${smartdmConfig.releaseAssets.windows.filename}`;
  const linuxVerifyCmd = `sha256sum ./${smartdmConfig.releaseAssets.appImage.filename}`;

  return (
    <div className="doc-panel active">
      <span className="doc-kicker">DOCS / SECURITY & VERIFICATION</span>
      <h3>Cryptographic Integrity Verification</h3>
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
            <p style={{ marginTop: '8px' }}>Compare output against official checksum: <code>{smartdmConfig.checksums.windows}</code></p>
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
            <b>Local-First Privacy Guarantee</b>
            <p>SmartDM never transmits downloaded URLs, file contents, or device identifiers to external servers. All AI classification models execute locally via ONNX runtimes.</p>
          </div>
        </li>
      </ul>
    </div>
  );
};
