import { SmartDMConfig } from '../types';

const GITHUB_REPO = 'https://github.com/ifahad2k/SmartDM';
const VERSION = '1.0.4';
const RELEASE_BASE = `${GITHUB_REPO}/releases/download/v${VERSION}`;

export const smartdmConfig: SmartDMConfig = {
  productName: 'SmartDM',
  version: VERSION,
  githubOwner: 'ifahad2k',
  githubRepo: GITHUB_REPO,
  defaultBranch: 'main',
  license: 'GPL-3.0-or-later',
  releaseAssets: {
    windows: {
      filename: `SmartDM-Setup-v${VERSION}.exe`,
      architecture: 'x64',
      minimumOs: 'Windows 10 / 11',
      size: '64.2 MB'
    },
    appImage: {
      filename: `SmartDM-${VERSION}-x86_64.AppImage`,
      architecture: 'x86_64',
      minimumOs: 'Linux GLIBC 2.29+',
      size: '71.8 MB'
    },
    deb: {
      filename: `smartdm_${VERSION}_amd64.deb`,
      architecture: 'amd64',
      minimumOs: 'Debian / Ubuntu 20.04+',
      size: '58.4 MB'
    }
  },
  checksums: {
    windows: '160C44F470ED73BA90222E0705AAAA67394ED037C66925D741C6FFF1A1A4DA72',
    appImage: '160C44F470ED73BA90222E0705AAAA67394ED037C66925D741C6FFF1A1A4DA72',
    deb: '160C44F470ED73BA90222E0705AAAA67394ED037C66925D741C6FFF1A1A4DA72'
  },
  links: {
    documentation: '/docs/install',
    discussions: `${GITHUB_REPO}/discussions`,
    issuesBug: `${GITHUB_REPO}/issues/new?template=bug_report.yml`,
    issuesFeature: `${GITHUB_REPO}/issues/new?template=feature_request.yml`,
    security: `${GITHUB_REPO}/blob/main/SECURITY.md`,
    license: `${GITHUB_REPO}/blob/main/LICENSE`,
    contributing: `${GITHUB_REPO}/blob/main/CONTRIBUTING.md`
  }
};

export const getDownloadUrl = (assetType: 'windows' | 'appImage' | 'deb') => {
  const filename = smartdmConfig.releaseAssets[assetType].filename;
  return `${RELEASE_BASE}/${filename}`;
};
