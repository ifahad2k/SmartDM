import React, { useState } from 'react';
import { Download, ArrowRight, Zap, Brain, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { GithubIcon as Github } from '../GithubIcon';
import { smartdmConfig, getDownloadUrl } from '../../config/smartdmConfig';

export const Hero: React.FC = () => {
  const [tiltStyle, setTiltStyle] = useState<{ transform: string }>({ transform: '' });

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setTiltStyle({
      transform: `rotateY(${x * 7}deg) rotateX(${y * -6}deg)`
    });
  };

  const handlePointerLeave = () => {
    setTiltStyle({ transform: '' });
  };

  return (
    <section className="hero section-shell">
      <div className="hero-grid-bg" aria-hidden="true" />
      <div className="aurora aurora-a" aria-hidden="true" />
      <div className="aurora aurora-b" aria-hidden="true" />

      <div className="container hero-content">
        <div className="hero-copy">
          <a
            className="release-pill"
            href={`${smartdmConfig.githubRepo}/releases`}
            target="_blank"
            rel="noreferrer"
          >
            <span className="pulse-dot" />
            SmartDM <span className="version-text">v{smartdmConfig.version}</span> is available
            <ArrowRight size={14} />
          </a>

          <h1>
            Downloads, accelerated.
            <br />
            <span>Organized by intelligence.</span>
          </h1>

          <p className="hero-lead">
            An open-source download and media manager for Windows and Linux—built with multi-segment acceleration, browser interception, AI cataloging, and local security verification.
          </p>

          <div className="hero-actions">
            <a
              className="button button-primary button-large"
              href={getDownloadUrl('windows')}
            >
              <Download size={22} />
              <span>Download SmartDM</span>
              <small>Free & open source (GPL-3.0)</small>
            </a>

            <a
              className="button button-secondary button-large"
              href={smartdmConfig.githubRepo}
              target="_blank"
              rel="noreferrer"
            >
              <Github size={20} />
              <span>Star on GitHub</span>
            </a>
          </div>

          <div className="hero-trust">
            <span>
              <CheckCircle2 size={16} /> 100% Local-First
            </span>
            <span>
              <CheckCircle2 size={16} /> Zero Telemetry
            </span>
            <span>
              <CheckCircle2 size={16} /> Cross Platform
            </span>
          </div>
        </div>

        {/* Hero Visual Mockup Stage */}
        <div className="hero-visual">
          <div
            className="app-stage"
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
            style={tiltStyle}
          >
            <div className="app-glow" aria-hidden="true" />

            {/* Floating Info Cards */}
            <div className="floating-card card-speed">
              <div className="card-icon">
                <Zap size={18} />
              </div>
              <div>
                <b>16x Parallel Streams</b>
                <small>Dynamic Segmenting</small>
              </div>
            </div>

            <div className="floating-card card-ai">
              <div className="card-icon" style={{ color: 'var(--violet)', background: 'rgba(159,102,255,0.12)' }}>
                <Brain size={18} />
              </div>
              <div>
                <b>AI Cataloging</b>
                <small>Auto-tagging files</small>
              </div>
            </div>

            <div className="floating-card card-safe">
              <div className="card-icon" style={{ color: 'var(--green)', background: 'rgba(84,242,181,0.1)' }}>
                <ShieldCheck size={18} />
              </div>
              <div>
                <b>Local Inspection</b>
                <small>Checksum verification</small>
              </div>
            </div>

            <div className="window-frame">
              <img
                src="/assets/smartdm-app.png"
                alt="SmartDM Application Interface Mockup"
                loading="eager"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="scroll-cue" aria-hidden="true">
        <span />
        SCROLL TO EXPLORE
      </div>
    </section>
  );
};
