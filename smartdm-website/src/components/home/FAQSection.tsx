import React from 'react';

export const FAQSection: React.FC = () => {
  const faqs = [
    {
      q: 'How does SmartDM achieve 16x multi-segment download acceleration?',
      a: 'SmartDM issues parallel range requests to the server, splitting a single file into up to 16 dynamic byte streams. It constantly rebalances active chunk boundaries so slow connections do not bottleneck your overall download rate.'
    },
    {
      q: 'Is SmartDM completely free and open source?',
      a: 'Yes! SmartDM is licensed under GPL-3.0. There are no subscriptions, no ads, no telemetry tracking, and zero premium paywalls.'
    },
    {
      q: 'Does SmartDM work with Chrome, Firefox, and Edge browsers?',
      a: 'Yes. SmartDM includes a companion browser extension for Chromium and Firefox based browsers. It uses native messaging to seamlessly capture file downloads and video streams directly into the desktop manager.'
    },
    {
      q: 'How does the local AI sorting engine work?',
      a: 'SmartDM uses an embedded lightweight classifier (ONNX runtime) that runs completely offline on your device. It analyzes file headers, extensions, and URL context to automatically place files into organized directories.'
    },
    {
      q: 'Which operating systems are supported?',
      a: 'SmartDM natively supports Windows 10 & 11 (x64) and Linux distros via AppImage and .deb packages (Ubuntu, Debian, Fedora, Arch, etc.).'
    }
  ];

  return (
    <section className="section">
      <div className="container faq-layout">
        <div className="faq-heading">
          <span className="eyebrow">FREQUENTLY ASKED</span>
          <h2>Got questions? We have answers.</h2>
          <p>
            Learn more about SmartDM architecture, security verification, and browser integration.
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
