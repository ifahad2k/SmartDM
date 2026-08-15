import React from 'react';

export const FAQSection: React.FC = () => {
  const faqs = [
    {
      q: 'Do I need to install Java 21 manually to run SmartDM?',
      a: 'No! SmartDM is built with Java 21 LTS & JavaFX 21, but the standalone Windows installer (.exe) automatically detects and installs an isolated Adoptium OpenJDK 21 JRE runtime if Java is missing on your system. You do not need to install Java manually.'
    },
    {
      q: 'How does SmartDM extract 4K YouTube and TikTok videos?',
      a: 'SmartDM includes integrated yt-dlp and FFmpeg processing engines. When you paste or capture a video URL, SmartDM analyzes available video/audio streams and lets you select 4K, 1080p, 720p, or high-bitrate MP3 audio formats.'
    },
    {
      q: 'What makes SmartDM different from traditional download managers?',
      a: 'SmartDM runs download dialogs ("Download File Info", "Media Extractor", "Enter URL") in independent top-level native OS windows with their own taskbar controls. It also uses SQLCipher to encrypt your local database with zero telemetry tracking.'
    },
    {
      q: 'How does SmartDM achieve 16x multi-segment download acceleration?',
      a: 'SmartDM issues parallel range requests to the server, splitting a single file into up to 16 dynamic byte streams. It constantly rebalances active chunk boundaries so slow connections do not bottleneck your overall download rate.'
    },
    {
      q: 'Is SmartDM completely free and open source?',
      a: 'Yes! SmartDM is licensed under GPL-3.0. There are no subscriptions, no ads, no telemetry tracking, and zero premium paywalls.'
    },
    {
      q: 'Does SmartDM work with Chrome and Firefox browsers?',
      a: 'Yes. SmartDM includes companion extensions for Chrome and Firefox. It uses Native Messaging IPC to seamlessly capture file downloads and video streams directly into the desktop manager.'
    },
    {
      q: 'Which operating systems are supported?',
      a: 'SmartDM natively supports Windows 10 & 11 (64-bit) and Linux distros via AppImage and .deb packages (Ubuntu, Debian, Fedora, Arch, etc.).'
    }
  ];

  return (
    <section className="section">
      <div className="container faq-layout">
        <div className="faq-heading">
          <span className="eyebrow">FREQUENTLY ASKED</span>
          <h2>Got questions? We have answers.</h2>
          <p>
            Learn more about SmartDM architecture, Java 21 LTS runtime requirements, and security verification.
          </p>
        </div>

        <div className="faq-list">
          {faqs.map((faq, idx) => (
            <details key={idx}>
              <summary>{faq.q}</summary>
              <p>{faq.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
};
