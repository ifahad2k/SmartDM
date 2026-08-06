import React from 'react';
import { Shield, ShieldCheck, CheckCircle2, Lock, FileCode } from 'lucide-react';
import { Link } from 'react-router-dom';

export const SecuritySection: React.FC = () => {
  return (
    <section className="section security-section" id="security">
      <div className="container security-layout">
        <div className="security-visual">
          <div className="shield-core">
            <Shield size={74} />
            <span />
            <span />
            <span />
          </div>

          <div className="scan-card">
            <span>Automated Scan</span>
            <b>
              <ShieldCheck size={14} /> 0 Threats Detected (68/68 Vendors)
            </b>
          </div>

          <div className="scan-card checksum">
            <span>SHA-256 Hash</span>
            <b>160C44F470ED73BA... MATCHED</b>
          </div>

          <div className="scan-card spoof">
            <span>Anti-Spoofing</span>
            <b>Valid Code Signature</b>
          </div>
        </div>

        <div className="security-copy">
          <span className="eyebrow">Security & Integrity</span>
          <h2>Verify every byte with absolute confidence</h2>
          <p>
            SmartDM ensures complete security before file execution. Automated cryptographic verification prevents corrupted payloads or compromised mirrors.
          </p>

          <div className="security-points">
            <div>
              <span>
                <ShieldCheck size={20} />
              </span>
              <div>
                <b>Automated SHA-256 Checksum Validation</b>
                <p>Calculates file checksums instantly upon download completion and matches against publisher manifests.</p>
              </div>
            </div>

            <div>
              <span>
                <Lock size={20} />
              </span>
              <div>
                <b>Zero Telemetry & Local Execution</b>
                <p>No telemetry, no tracking servers, no remote code execution. Your download log never leaves your computer.</p>
              </div>
            </div>

            <div>
              <span>
                <FileCode size={20} />
              </span>
              <div>
                <b>100% Open Source Auditability</b>
                <p>Licensed under GPL-3.0. Build directly from source or inspect all networking routines on GitHub.</p>
              </div>
            </div>
          </div>

          <Link to="/docs/security" className="text-link">
            <span>Read full Security Architecture</span>
            <CheckCircle2 size={16} style={{ color: 'var(--cyan)' }} />
          </Link>
        </div>
      </div>
    </section>
  );
};
