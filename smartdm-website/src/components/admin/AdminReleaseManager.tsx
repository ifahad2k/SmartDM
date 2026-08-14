import React, { useEffect, useState } from 'react';
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { IconSettings as Settings, IconSave as Save } from '../ui/Icons';
import { RefreshCw, ExternalLink } from 'lucide-react';
import { CustomModal } from '../ui/CustomModal';

export const AdminReleaseManager: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const [formData, setFormData] = useState({
    version: '1.0.8',
    releaseName: 'SmartDM v1.0.8 Official Release',
    windowsDownloadUrl: 'https://github.com/SmartDM-org/smartdm-desktop/releases/download/v1.0.8/SmartDM-Setup-v1.0.8.exe',
    windowsChecksum: '160C44F470ED73BA90222E0705AAAA67394ED037C66925D741C6FFF1A1A4DA72',
    appImageDownloadUrl: 'https://github.com/SmartDM-org/smartdm-desktop/releases/download/v1.0.8/SmartDM-1.0.8-x86_64.AppImage',
    appImageChecksum: '160C44F470ED73BA90222E0705AAAA67394ED037C66925D741C6FFF1A1A4DA72',
    debDownloadUrl: 'https://github.com/SmartDM-org/smartdm-desktop/releases/download/v1.0.8/smartdm_1.0.8_amd64.deb',
    debChecksum: '160C44F470ED73BA90222E0705AAAA67394ED037C66925D741C6FFF1A1A4DA72',
    releaseNotes: 'Performance optimization, multi-thread download speed improvement, and enhanced UI dark mode aesthetics.'
  });

  useEffect(() => {
    const fetchCurrentConfig = async () => {
      try {
        if (db) {
          const docRef = doc(db, 'publicConfig', 'main');
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const data = snap.data();
            setFormData(prev => ({
              ...prev,
              version: data.version || prev.version,
              releaseName: data.releaseName || prev.releaseName,
              windowsDownloadUrl: data.windowsDownloadUrl || prev.windowsDownloadUrl,
              windowsChecksum: data.windowsChecksum || data.checksums?.windows || prev.windowsChecksum,
              appImageDownloadUrl: data.appImageDownloadUrl || prev.appImageDownloadUrl,
              appImageChecksum: data.appImageChecksum || data.checksums?.appImage || prev.appImageChecksum,
              debDownloadUrl: data.debDownloadUrl || prev.debDownloadUrl,
              debChecksum: data.debChecksum || data.checksums?.deb || prev.debChecksum,
              releaseNotes: data.releaseNotes || prev.releaseNotes
            }));
          }
        }
      } catch (err) {
        console.warn('Firestore config read note:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCurrentConfig();
  }, []);

  const handlePublishRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const payload = {
      productName: 'SmartDM',
      version: formData.version,
      releaseName: formData.releaseName,
      windowsDownloadUrl: formData.windowsDownloadUrl,
      windowsChecksum: formData.windowsChecksum,
      windowsFilename: `SmartDM-Setup-v${formData.version}.exe`,
      appImageDownloadUrl: formData.appImageDownloadUrl,
      appImageChecksum: formData.appImageChecksum,
      appImageFilename: `SmartDM-${formData.version}-x86_64.AppImage`,
      debDownloadUrl: formData.debDownloadUrl,
      debChecksum: formData.debChecksum,
      debFilename: `smartdm_${formData.version}_amd64.deb`,
      releaseNotes: formData.releaseNotes,
      updatedAt: new Date().toISOString(),
      updatedBy: user?.email || 'admin'
    };

    try {
      // 1. Write to publicConfig/main in Firestore
      if (db) {
        await setDoc(doc(db, 'publicConfig', 'main'), payload, { merge: true });
        
        // 2. Add audit log
        try {
          await addDoc(collection(db, 'auditLogs'), {
            action: 'PUBLISH_NEW_RELEASE',
            version: formData.version,
            performedByUid: user?.uid || 'admin',
            performedByEmail: user?.email || 'admin',
            timestamp: serverTimestamp()
          });
        } catch (auditErr) {}
      }

      // 3. Save to local storage for instant sync across tabs
      try {
        localStorage.setItem('smartdm_public_config', JSON.stringify(payload));
      } catch (e) {}

      setShowSuccessModal(true);
    } catch (err: any) {
      console.error('Failed to publish release:', err);
      alert(`Failed to publish release: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginTop: '1rem' }}>
      <CustomModal
        isOpen={showSuccessModal}
        title="New Release Published Live!"
        message={`Version ${formData.version} has been published successfully! Download buttons and release badges across the entire website are now updated in real time.`}
        type="success"
        confirmText="Done"
        onConfirm={() => setShowSuccessModal(false)}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <Settings size={24} color="var(--primary)" />
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem' }}>Add & Publish New Release Version</h2>
          <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
            Enter the new version number and GitHub direct download links to update download buttons across the web app.
          </p>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          Loading active release configuration...
        </div>
      ) : (
        <form onSubmit={handlePublishRelease} style={{ display: 'grid', gap: '1.5rem' }}>
          {/* Release Version & Name */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>New Version Number *</label>
              <input
                type="text"
                required
                className="input"
                value={formData.version}
                onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                placeholder="e.g. 1.0.8"
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>Release Title / Name *</label>
              <input
                type="text"
                required
                className="input"
                value={formData.releaseName}
                onChange={(e) => setFormData({ ...formData, releaseName: e.target.value })}
                placeholder="e.g. SmartDM v1.0.8 Official Release"
              />
            </div>
          </div>

          {/* Windows Direct Download Link */}
          <div style={{ padding: '1.25rem', borderRadius: '12px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              Windows Installer (.exe) GitHub Download
            </h3>
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 600 }}>
                  Direct GitHub Download Link *
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="url"
                    required
                    className="input"
                    value={formData.windowsDownloadUrl}
                    onChange={(e) => setFormData({ ...formData, windowsDownloadUrl: e.target.value })}
                    placeholder="https://github.com/.../releases/download/v1.0.8/SmartDM-Setup-v1.0.8.exe"
                  />
                  {formData.windowsDownloadUrl && (
                    <a
                      href={formData.windowsDownloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="button button-ghost"
                      style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}
                      title="Test direct link"
                    >
                      <ExternalLink size={16} />
                    </a>
                  )}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                  Windows SHA-256 Checksum <span style={{ color: 'var(--text-tertiary)' }}>(Optional)</span>
                </label>
                <input
                  type="text"
                  className="input"
                  style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                  value={formData.windowsChecksum}
                  onChange={(e) => setFormData({ ...formData, windowsChecksum: e.target.value })}
                  placeholder="SHA-256 hash string..."
                />
              </div>
            </div>
          </div>

          {/* Linux AppImage Direct Download Link */}
          <div style={{ padding: '1.25rem', borderRadius: '12px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: 'var(--violet)' }}>
              Linux AppImage (.AppImage) GitHub Download
            </h3>
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 600 }}>
                  Direct GitHub Download Link <span style={{ color: 'var(--text-tertiary)' }}>(Optional)</span>
                </label>
                <input
                  type="url"
                  className="input"
                  value={formData.appImageDownloadUrl}
                  onChange={(e) => setFormData({ ...formData, appImageDownloadUrl: e.target.value })}
                  placeholder="https://github.com/.../releases/download/v1.0.8/SmartDM-1.0.8-x86_64.AppImage"
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                  Linux AppImage SHA-256 Checksum <span style={{ color: 'var(--text-tertiary)' }}>(Optional)</span>
                </label>
                <input
                  type="text"
                  className="input"
                  style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                  value={formData.appImageChecksum}
                  onChange={(e) => setFormData({ ...formData, appImageChecksum: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Linux Debian (.deb) Direct Download Link */}
          <div style={{ padding: '1.25rem', borderRadius: '12px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: 'var(--cyan)' }}>
              Debian / Ubuntu (.deb) GitHub Download
            </h3>
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 600 }}>
                  Direct GitHub Download Link <span style={{ color: 'var(--text-tertiary)' }}>(Optional)</span>
                </label>
                <input
                  type="url"
                  className="input"
                  value={formData.debDownloadUrl}
                  onChange={(e) => setFormData({ ...formData, debDownloadUrl: e.target.value })}
                  placeholder="https://github.com/.../releases/download/v1.0.8/smartdm_1.0.8_amd64.deb"
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                  Debian Package SHA-256 Checksum <span style={{ color: 'var(--text-tertiary)' }}>(Optional)</span>
                </label>
                <input
                  type="text"
                  className="input"
                  style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                  value={formData.debChecksum}
                  onChange={(e) => setFormData({ ...formData, debChecksum: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Release Notes */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>Release Notes & Changelog</label>
            <textarea
              rows={3}
              className="input"
              value={formData.releaseNotes}
              onChange={(e) => setFormData({ ...formData, releaseNotes: e.target.value })}
              placeholder="Describe key improvements, security updates, and bug fixes..."
            ></textarea>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button
              type="submit"
              disabled={saving}
              className="button button-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.75rem', fontWeight: 700 }}
            >
              {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
              <span>{saving ? 'Publishing New Release...' : 'Publish New Version & Download Links'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
