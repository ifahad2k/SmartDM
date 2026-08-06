import React from 'react';
import { Zap, Globe, Shield, Sparkles, Layers, Terminal } from 'lucide-react';

export const Ticker: React.FC = () => {
  const items = [
    { icon: <Zap size={14} />, text: 'Multi-Segment Dynamic Acceleration' },
    { icon: <Globe size={14} />, text: 'Chrome & Firefox Companion Extension' },
    { icon: <Sparkles size={14} />, text: 'Local-First AI File Categorization' },
    { icon: <Shield size={14} />, text: 'Automatic SHA-256 Checksum Validation' },
    { icon: <Layers size={14} />, text: 'System Tray & Silent Background Operations' },
    { icon: <Terminal size={14} />, text: 'Windows 11 & Linux AppImage Native' },
  ];

  return (
    <div className="ticker" aria-hidden="true">
      <div className="ticker-track">
        {[...items, ...items, ...items].map((item, idx) => (
          <span key={idx}>
            {item.icon}
            {item.text}
          </span>
        ))}
      </div>
    </div>
  );
};
