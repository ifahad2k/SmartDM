import React from 'react';
import { Copy, Terminal } from 'lucide-react';

interface BrowserExtensionDocProps {
  triggerToast?: (msg: string) => void;
}

export const BrowserExtensionDoc: React.FC<BrowserExtensionDocProps> = ({ triggerToast }) => {
  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    if (triggerToast) triggerToast('Copied manifest configuration to clipboard!');
  };

  const manifestJson = `{
  "name": "com.smartdm.native_host",
  "description": "SmartDM Native Messaging Host Interceptor",
  "path": "smartdm-host.exe",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://abcdefghijklmnopqrstuvwxyz/"]
}`;

  return (
    <div className="doc-panel active">
      <span className="doc-kicker">DOCS / BROWSER INTERCEPTION</span>
      <h3>Browser Companion Setup</h3>
      <p>Connect Chrome, Firefox, or Edge to automatically intercept links and media streams.</p>

      <ul className="step-list">
        <li>
          <span>01</span>
          <div>
            <b>Install Companion Extension</b>
            <p>Get the SmartDM extension from the Chrome Web Store, Firefox Add-ons, or Edge Add-ons repository.</p>
          </div>
        </li>

        <li>
          <span>02</span>
          <div>
            <b>Register Native Messaging Host</b>
            <p>SmartDM auto-registers the native messaging manifest upon first launch. If running unpacked, verify your <code>com.smartdm.native_host.json</code> file:</p>
            <div className="terminal-box">
              <div className="terminal-title">
                <Terminal size={14} />
                <span>JSON Manifest Configuration</span>
              </div>
              <pre style={{ margin: 0 }}>
                <code>{manifestJson}</code>
              </pre>
              <button
                className="copy-button"
                onClick={() => copyText(manifestJson)}
                title="Copy Manifest JSON"
              >
                <Copy size={16} />
              </button>
            </div>
          </div>
        </li>

        <li>
          <span>03</span>
          <div>
            <b>Configure File Interception Rules</b>
            <p>In extension settings, choose minimum file size thresholds (e.g. intercept downloads over 10 MB) or custom extension filters (.zip, .iso, .mp4, .mkv).</p>
          </div>
        </li>
      </ul>
    </div>
  );
};
