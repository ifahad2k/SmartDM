import React from 'react';
import { Copy, Terminal } from 'lucide-react';
import { smartdmConfig } from '../../config/smartdmConfig';

interface InstallDocProps {
  triggerToast?: (msg: string) => void;
}

export const InstallDoc: React.FC<InstallDocProps> = ({ triggerToast }) => {
  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    if (triggerToast) triggerToast('Copied terminal command to clipboard!');
  };

  const appImageCmd = `chmod +x ${smartdmConfig.releaseAssets.appImage.filename}\n./${smartdmConfig.releaseAssets.appImage.filename}`;
  const debCmd = `sudo dpkg -i ${smartdmConfig.releaseAssets.deb.filename}\nsudo apt-get install -f`;

  return (
    <div className="doc-panel active">
      <span className="doc-kicker">DOCS / INSTALLATION</span>
      <h3>Installing SmartDM Desktop</h3>
      <p>Follow the platform instructions below to install SmartDM on Windows or Linux environments.</p>

      <ul className="step-list">
        <li>
          <span>01</span>
          <div>
            <b>Windows Installation (.exe)</b>
            <p>Download <code>{smartdmConfig.releaseAssets.windows.filename}</code> and run the installer executable. It will guide you through directory selection and auto-register system tray integration.</p>
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
          </div>
        </li>
      </ul>
    </div>
  );
};
