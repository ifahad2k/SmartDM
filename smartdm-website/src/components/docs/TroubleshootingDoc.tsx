import React from 'react';

export const TroubleshootingDoc: React.FC = () => {
  const issues = [
    {
      q: 'Downloads stall at 99% or fail to complete',
      a: 'This typically happens when a server throttles parallel connections or invalidates temporary session tokens. Try reducing active thread segments from 16 to 4 in SmartDM Settings -> Acceleration.'
    },
    {
      q: 'Browser extension shows "Native Messaging Host Disconnected"',
      a: 'Ensure the desktop application has been opened at least once to write the native messaging registry keys on Windows or manifest files under ~/.config/google-chrome/NativeMessagingHosts/ on Linux.'
    },
    {
      q: 'Windows Defender SmartScreen warning on setup',
      a: 'As an open source project without expensive EV certificate authorities, Windows Defender may display a unknown publisher warning. Click "More Info" -> "Run Anyway" after verifying the SHA-256 hash match.'
    },
    {
      q: 'Media extractor fails on protected streaming URLs',
      a: 'SmartDM strictly obeys digital rights management (DRM). Protected streams (DRM AES-128/Widevine) cannot be extracted by design.'
    }
  ];

  return (
    <div className="doc-panel active">
      <span className="doc-kicker">DOCS / TROUBLESHOOTING</span>
      <h3>Troubleshooting & FAQs</h3>
      <p>Quick solutions for common setup issues, network configurations, and extension integration.</p>

      <div className="troubleshoot-list">
        {issues.map((item, idx) => (
          <details key={idx} open={idx === 0}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
};
