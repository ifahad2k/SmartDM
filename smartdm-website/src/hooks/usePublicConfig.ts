import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { smartdmConfig } from '../config/smartdmConfig';

export interface PublicReleaseConfig {
  version: string;
  releaseName: string;
  windowsDownloadUrl: string;
  windowsChecksum: string;
  windowsFilename: string;
  appImageDownloadUrl: string;
  appImageChecksum: string;
  appImageFilename: string;
  debDownloadUrl: string;
  debChecksum: string;
  debFilename: string;
  releaseNotes?: string;
  updatedAt?: string;
}

const DEFAULT_CONFIG: PublicReleaseConfig = {
  version: smartdmConfig.version,
  releaseName: `SmartDM v${smartdmConfig.version}`,
  windowsDownloadUrl: `https://github.com/SmartDM-org/smartdm-desktop/releases/download/v${smartdmConfig.version}/${smartdmConfig.releaseAssets.windows.filename}`,
  windowsChecksum: smartdmConfig.checksums.windows,
  windowsFilename: smartdmConfig.releaseAssets.windows.filename,
  appImageDownloadUrl: `https://github.com/SmartDM-org/smartdm-desktop/releases/download/v${smartdmConfig.version}/${smartdmConfig.releaseAssets.appImage.filename}`,
  appImageChecksum: smartdmConfig.checksums.appImage,
  appImageFilename: smartdmConfig.releaseAssets.appImage.filename,
  debDownloadUrl: `https://github.com/SmartDM-org/smartdm-desktop/releases/download/v${smartdmConfig.version}/${smartdmConfig.releaseAssets.deb.filename}`,
  debChecksum: smartdmConfig.checksums.deb,
  debFilename: smartdmConfig.releaseAssets.deb.filename,
  releaseNotes: 'Official high-speed release with AI media cataloging, multi-connection acceleration, and zero telemetry.'
};

export const usePublicConfig = (): PublicReleaseConfig => {
  const [config, setConfig] = useState<PublicReleaseConfig>(() => {
    try {
      const cached = localStorage.getItem('smartdm_public_config');
      if (cached) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(cached) };
      }
    } catch (e) {}
    return DEFAULT_CONFIG;
  });

  useEffect(() => {
    if (!db) return;

    // Real-time listener for publicConfig/main
    const docRef = doc(db, 'publicConfig', 'main');
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const updated: PublicReleaseConfig = {
          version: data.version || DEFAULT_CONFIG.version,
          releaseName: data.releaseName || `SmartDM v${data.version || DEFAULT_CONFIG.version}`,
          windowsDownloadUrl: data.windowsDownloadUrl || data.downloadUrl || DEFAULT_CONFIG.windowsDownloadUrl,
          windowsChecksum: data.windowsChecksum || data.checksums?.windows || DEFAULT_CONFIG.windowsChecksum,
          windowsFilename: data.windowsFilename || data.releaseAssets?.windows?.filename || DEFAULT_CONFIG.windowsFilename,
          appImageDownloadUrl: data.appImageDownloadUrl || DEFAULT_CONFIG.appImageDownloadUrl,
          appImageChecksum: data.appImageChecksum || data.checksums?.appImage || DEFAULT_CONFIG.appImageChecksum,
          appImageFilename: data.appImageFilename || DEFAULT_CONFIG.appImageFilename,
          debDownloadUrl: data.debDownloadUrl || DEFAULT_CONFIG.debDownloadUrl,
          debChecksum: data.debChecksum || data.checksums?.deb || DEFAULT_CONFIG.debChecksum,
          debFilename: data.debFilename || DEFAULT_CONFIG.debFilename,
          releaseNotes: data.releaseNotes || DEFAULT_CONFIG.releaseNotes,
          updatedAt: data.updatedAt
        };

        setConfig(updated);
        try {
          localStorage.setItem('smartdm_public_config', JSON.stringify(updated));
        } catch (e) {}
      }
    }, (err) => {
      console.warn('Real-time config listener note:', err);
    });

    return () => unsubscribe();
  }, []);

  return config;
};
