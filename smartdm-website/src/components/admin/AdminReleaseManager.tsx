import React, { useEffect, useState } from 'react';
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { smartdmConfig } from '../../config/smartdmConfig';
import { IconSettings as Settings, IconSave as Save } from '../ui/Icons';
import { CheckCircle, RefreshCw } from 'lucide-react';

export const AdminReleaseManager: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [configData, setConfigData] = useState({
    version: smartdmConfig.version,
    windowsFilename: smartdmConfig.releaseAssets.windows.filename,
    windowsChecksum: smartdmConfig.checksums.windows,
    appImageFilename: smartdmConfig.releaseAssets.appImage.filename,
    appImageChecksum: smartdmConfig.checksums.appImage,
    debFilename: smartdmConfig.releaseAssets.deb.filename,
    debChecksum: smartdmConfig.checksums.deb,
  });

  useEffect(() => {
    const fetchFirestoreConfig = async () => {
      try {
        const docRef = doc(db, 'publicConfig', 'main');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          setConfigData({
            version: data.version || smartdmConfig.version,
            windowsFilename: data.releaseAssets?.windows?.filename || smartdmConfig.releaseAssets.windows.filename,
            windowsChecksum: data.checksums?.windows || smartdmConfig.checksums.windows,
            appImageFilename: data.releaseAssets?.appImage?.filename || smartdmConfig.releaseAssets.appImage.filename,
            appImageChecksum: data.checksums?.appImage || smartdmConfig.checksums.appImage,
            debFilename: data.releaseAssets?.deb?.filename || smartdmConfig.releaseAssets.deb.filename,
            debChecksum: data.checksums?.deb || smartdmConfig.checksums.deb,
          });
        }
      } catch (err) {
        console.warn('Using local fallback config:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchFirestoreConfig();
  }, []);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg(null);

    const payload = {
      productName: 'SmartDM',
      version: configData.version,
      updatedAt: new Date().toISOString(),
      updatedBy: user?.email || 'admin',
      releaseAssets: {
        windows: {
          filename: configData.windowsFilename,
          architecture: 'x64',
          minimumOs: 'Windows 10'
        },
        appImage: {
          filename: configData.appImageFilename,
          architecture: 'x86_64'
        },
        deb: {
          filename: configData.debFilename,
          architecture: 'amd64'
        }
      },
      checksums: {
        windows: configData.windowsChecksum,
        appImage: configData.appImageChecksum,
        deb: configData.debChecksum
      }
    };

    try {
      // 1. Update publicConfig/main in Firestore
      await setDoc(doc(db, 'publicConfig', 'main'), payload, { merge: true });

      // 2. Write Audit Log
      await addDoc(collection(db, 'auditLogs'), {
        action: 'UPDATE_RELEASE_CONFIG',
        performedByUid: user?.uid || 'admin',
        performedByName: user?.displayName || user?.email || 'Admin',
        details: { version: configData.version },
        timestamp: serverTimestamp()
      });

      setSuccessMsg('Release configuration and checksums saved successfully!');
    } catch (err: any) {
      console.error('Failed to save release config', err);
      alert(`Failed to save configuration: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <Settings size={20} color="var(--primary)" />
        <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Live Release & Checksum Manager</h2>
      </div>

      {successMsg && (
        <div style={{ padding: '0.85rem 1rem', borderRadius: '8px', background: 'rgba(84,242,181,0.1)', color: 'var(--green)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', border: '1px solid rgba(84,242,181,0.3)' }}>
          <CheckCircle size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
          Loading active release configuration...
        </div>
      ) : (
        <form onSubmit={handleSaveConfig} style={{ display: 'grid', gap: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>Active Release Version</label>
            <input
              type="text"
              required
              className="input"
              value={configData.version}
              onChange={(e) => setConfigData({ ...configData, version: e.target.value })}
              placeholder="e.g. 1.0.4"
              style={{ maxWidth: '300px' }}
            />
          </div>

          <div style={{ padding: '1.25rem', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: 'var(--primary)' }}>Windows Installer (x64)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem' }}>Filename</label>
                <input
                  type="text"
                  required
                  className="input"
                  value={configData.windowsFilename}
                  onChange={(e) => setConfigData({ ...configData, windowsFilename: e.target.value })}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem' }}>SHA-256 Checksum</label>
                <input
                  type="text"
                  required
                  className="input"
                  style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                  value={configData.windowsChecksum}
                  onChange={(e) => setConfigData({ ...configData, windowsChecksum: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div style={{ padding: '1.25rem', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: 'var(--violet)' }}>Linux AppImage (x86_64)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem' }}>Filename</label>
                <input
                  type="text"
                  required
                  className="input"
                  value={configData.appImageFilename}
                  onChange={(e) => setConfigData({ ...configData, appImageFilename: e.target.value })}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem' }}>SHA-256 Checksum</label>
                <input
                  type="text"
                  required
                  className="input"
                  style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                  value={configData.appImageChecksum}
                  onChange={(e) => setConfigData({ ...configData, appImageChecksum: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div style={{ padding: '1.25rem', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: 'var(--cyan)' }}>Debian / Ubuntu (.deb)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem' }}>Filename</label>
                <input
                  type="text"
                  required
                  className="input"
                  value={configData.debFilename}
                  onChange={(e) => setConfigData({ ...configData, debFilename: e.target.value })}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem' }}>SHA-256 Checksum</label>
                <input
                  type="text"
                  required
                  className="input"
                  style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                  value={configData.debChecksum}
                  onChange={(e) => setConfigData({ ...configData, debChecksum: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={saving}
              className="button button-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            >
              {saving ? <RefreshCw size={18} className="spin" /> : <Save size={18} />}
              <span>{saving ? 'Publishing Updates...' : 'Publish Release Config'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
