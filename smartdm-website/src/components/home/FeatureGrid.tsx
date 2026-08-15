import React, { useState, useEffect } from 'react';
import { Zap, Globe, Shield, Bell, Cpu, ArrowRight, Sparkles, Lock, Layers } from 'lucide-react';
import { Link } from 'react-router-dom';

export const FeatureGrid: React.FC = () => {
  const [speed, setSpeed] = useState('88.4');
  const speedHeights = [35, 47, 56, 42, 69, 77, 62, 84, 78, 93, 72, 89, 96, 74, 85, 67, 91, 79, 97, 83, 88, 74, 95, 81, 92, 86, 98, 90];

  useEffect(() => {
    const interval = setInterval(() => {
      setSpeed((84 + Math.random() * 14).toFixed(1));
    }, 1250);
    return () => clearInterval(interval);
  }, []);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - rect.top}px`);
  };

  return (
    <section className="section" id="features">
      <div className="container">
        <div className="section-heading">
          <span className="eyebrow">Architecture & Power</span>
          <h2>Engineered for speed, control, and local intelligence</h2>
          <p>
            SmartDM combines multi-threaded downloading with browser interception, native media extraction, and local AI rules—built on Java 21 LTS with zero telemetry.
          </p>
        </div>

        <div className="feature-grid">
          {/* Multi-segment Acceleration Wide Card */}
          <div className="feature-card feature-wide" onPointerMove={handlePointerMove}>
            <div>
              <div className="feature-icon">
                <Zap size={24} />
              </div>
              <h3>Multi-Segment Dynamic Acceleration</h3>
              <p>
                Splits files into up to 16 parallel threads with active chunk balance. Maximizes available bandwidth while avoiding connection bottlenecks.
              </p>
              <div className="mini-tags">
                <span>16 Dynamic Threads</span>
                <span>Java 21 LTS Engine</span>
                <span>Bandwidth Limiter</span>
              </div>
            </div>

            <div className="speed-viz">
              <div className="speed-head">
                <span>ACTIVE TRANSFER ACCELERATOR</span>
                <strong>
                  <span>{speed}</span> MB/s
                </strong>
              </div>

              <div className="speed-bars">
                {speedHeights.map((h, i) => (
                  <i
                    key={i}
                    style={{
                      height: `${h}%`,
                      animationDelay: `${-(i % 8) * 0.13}s`
                    }}
                  />
                ))}
              </div>

              <div className="segments-row">
                <span /><span /><span /><span /><span /><span /><span /><span />
              </div>

              <div className="speed-foot">
                <span>16 / 16 Segments Synchronized</span>
                <b>100% Efficiency</b>
              </div>
            </div>
          </div>

          {/* Native Media Extractor Card */}
          <div className="feature-card" onPointerMove={handlePointerMove}>
            <div className="feature-icon" style={{ color: 'var(--pink)' }}>
              <Sparkles size={24} />
            </div>
            <h3>4K Media Extractor (yt-dlp & FFmpeg)</h3>
            <p>
              Extract 4K/HD videos and high-bitrate MP3 audio directly from YouTube, TikTok, and media sites with integrated yt-dlp & FFmpeg processing.
            </p>
            <div className="mini-tags">
              <span>4K / 1080p Video</span>
              <span>MP3 Audio Conversion</span>
              <span>yt-dlp + FFmpeg</span>
            </div>
          </div>

          {/* Independent Top-Level Windows Card */}
          <div className="feature-card" onPointerMove={handlePointerMove}>
            <div className="feature-icon" style={{ color: 'var(--cyan)' }}>
              <Layers size={24} />
            </div>
            <h3>Independent Top-Level Windows</h3>
            <p>
              Download dialogs ("Download File Info", "Enter URL", "Media Extractor") run in independent native OS windows with their own taskbar controls for friction-free multitasking.
            </p>
            <div className="mini-tags">
              <span>Native OS Windows</span>
              <span>Taskbar Integrations</span>
              <span>Friction-Free UI</span>
            </div>
          </div>

          {/* Browser Integration Card */}
          <div className="feature-card" onPointerMove={handlePointerMove}>
            <div className="feature-icon">
              <Globe size={24} />
            </div>
            <h3>Native Browser Integration</h3>
            <p>
              Intercepts download links automatically from Google Chrome and Mozilla Firefox via Native Messaging IPC and lightweight extensions.
            </p>
            <div className="browser-row">
              <span>Chrome Store</span>
              <span>Firefox Add-ons</span>
              <span>Native Host IPC</span>
            </div>
          </div>

          {/* Local Security & Checksum Card */}
          <div className="feature-card" onPointerMove={handlePointerMove}>
            <div className="feature-icon">
              <Shield size={24} />
            </div>
            <h3>Encrypted SQLCipher & Checksum Scan</h3>
            <p>
              Local SQLite database encrypted with SQLCipher. Validates downloaded files against SHA-256 and MD5 hashes automatically before execution.
            </p>
            <div className="security-meter">
              <span>
                <i />
              </span>
              <b>SQLCipher Encrypted</b>
            </div>
          </div>

          {/* AI Cataloging Card */}
          <div className="feature-card feature-ai" onPointerMove={handlePointerMove}>
            <div>
              <div className="feature-icon" style={{ color: 'var(--violet)' }}>
                <Cpu size={24} />
              </div>
              <h3>AI Cataloging & Local Rules</h3>
              <p>
                SmartDM intelligently sorts downloads into clean target folders based on file structure, metadata, source domain, and user preferences—completely offline.
              </p>
              <Link to="/docs/browser-extension" className="text-link">
                <span>Explore Extension & Rules</span>
                <ArrowRight size={16} />
              </Link>
            </div>

            <div className="ai-console">
              <div className="console-top">
                <span /><span /><span />
                <b>smartdm-ai-engine.log</b>
              </div>
              <div className="console-line">
                <i>[01]</i>
                <span>GET: https://releases.ubuntu.com/24.04/ubuntu-iso</span>
              </div>
              <div className="console-line">
                <i>[02]</i>
                <span>CLASSIFIER: Recognized ISO Image -&gt; /Downloads/OS/</span>
              </div>
              <div className="console-line">
                <i>[03]</i>
                <span>
                  INTEGRITY: <em className="safe">SHA-256 OK (Matched Official Mirror)</em>
                </span>
              </div>
              <div className="console-cursor" />
            </div>
          </div>

          {/* System Tray Card */}
          <div className="feature-card" onPointerMove={handlePointerMove}>
            <div className="feature-icon">
              <Bell size={24} />
            </div>
            <h3>Silent Background & System Tray</h3>
            <p>
              Minimizes quietly to the system tray on Windows and Linux. Runs scheduled batch downloads overnight without interfering with system tasks.
            </p>
            <div className="tray-demo">
              <span />
              <span className="active">
                <Zap size={14} />
              </span>
              <span />
            </div>
          </div>

          {/* Auto-Bundled Java 21 Installer Card */}
          <div className="feature-card" onPointerMove={handlePointerMove}>
            <div className="feature-icon" style={{ color: 'var(--green)' }}>
              <Lock size={24} />
            </div>
            <h3>Zero-Config Java 21 Installer</h3>
            <p>
              Requires Java 21 LTS. The self-contained setup installer automatically detects, downloads, and isolates the Adoptium OpenJDK 21 JRE runtime—no manual Java setup needed.
            </p>
            <div className="mini-tags">
              <span>Java 21 LTS Included</span>
              <span>Isolated Runtime</span>
              <span>Zero-Config Setup</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
