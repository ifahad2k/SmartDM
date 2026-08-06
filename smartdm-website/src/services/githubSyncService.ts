export interface GitHubSyncData {
  version: string;
  stargazersCount: number;
  starText: string;
  releaseUrl: string;
  windowsDownloadUrl: string;
  appImageDownloadUrl: string;
  debDownloadUrl: string;
  publishedAt?: string;
}

const DEFAULT_SYNC_DATA: GitHubSyncData = {
  version: '1.0.2',
  stargazersCount: 0,
  starText: 'Star',
  releaseUrl: 'https://github.com/ifahad2k/SmartDM/releases/latest',
  windowsDownloadUrl: 'https://github.com/ifahad2k/SmartDM/releases/download/v1.0.2/SmartDM-Setup-v1.0.2.exe',
  appImageDownloadUrl: 'https://github.com/ifahad2k/SmartDM/releases/download/v1.0.2/SmartDM-1.0.2-x86_64.AppImage',
  debDownloadUrl: 'https://github.com/ifahad2k/SmartDM/releases/download/v1.0.2/smartdm_1.0.2_amd64.deb',
};

const CACHE_KEY = 'smartdm_github_sync_cache';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

export const fetchGitHubRepositoryData = async (): Promise<GitHubSyncData> => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { timestamp, data } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_TTL_MS) {
        return data;
      }
    }
  } catch (e) {}

  let version = DEFAULT_SYNC_DATA.version;
  let stargazersCount = DEFAULT_SYNC_DATA.stargazersCount;
  let starText = DEFAULT_SYNC_DATA.starText;

  // 1. Resolve Latest Version via GitHub HTML Redirect (Zero Rate Limit)
  try {
    const redirectRes = await fetch('https://github.com/ifahad2k/SmartDM/releases/latest', { method: 'HEAD', redirect: 'follow' });
    const finalUrl = redirectRes.url || '';
    const match = finalUrl.match(/\/tag\/v?([0-9]+\.[0-9]+\.[0-9]+)/i);
    if (match && match[1]) {
      version = match[1];
    }
  } catch (err) {
    console.warn('GitHub HTML redirect check note:', err);
  }

  // 2. Try GitHub REST API for detailed star count & release assets
  try {
    const repoRes = await fetch('https://api.github.com/repos/ifahad2k/SmartDM');
    if (repoRes.ok) {
      const repoData = await repoRes.json();
      if (typeof repoData.stargazers_count === 'number') {
        stargazersCount = repoData.stargazers_count;
        starText = stargazersCount >= 1000 ? `${(stargazersCount / 1000).toFixed(1)}k` : `${stargazersCount}`;
      }
    }
  } catch (err) {
    console.warn('GitHub REST API star check note:', err);
  }

  const result: GitHubSyncData = {
    version,
    stargazersCount,
    starText: starText === '0' ? 'Star' : starText,
    releaseUrl: `https://github.com/ifahad2k/SmartDM/releases/tag/v${version}`,
    windowsDownloadUrl: `https://github.com/ifahad2k/SmartDM/releases/download/v${version}/SmartDM-Setup-v${version}.exe`,
    appImageDownloadUrl: `https://github.com/ifahad2k/SmartDM/releases/download/v${version}/SmartDM-${version}-x86_64.AppImage`,
    debDownloadUrl: `https://github.com/ifahad2k/SmartDM/releases/download/v${version}/smartdm_${version}_amd64.deb`,
  };

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: result }));
  } catch (e) {}

  return result;
};
