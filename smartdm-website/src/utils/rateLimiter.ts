/**
 * Device-Level Rate Limiter & Anti-Spam Cooldown Utility for SmartDM.
 * Enforces strict anti-spam rules per device/browser:
 * - Comments: 1 per 2 minutes (120s)
 * - Feature Proposals: 1 per 10 minutes (600s)
 * - Bug Reports: 1 per 5 minutes (300s)
 */

interface RateLimitConfig {
  comment: number;  // 120 seconds
  feature: number;  // 600 seconds
  bug: number;      // 300 seconds
}

const COOLDOWNS: RateLimitConfig = {
  comment: 120, // 2 minutes
  feature: 600, // 10 minutes
  bug: 300      // 5 minutes
};

interface RateLimitCheck {
  allowed: boolean;
  message?: string;
  remainingSeconds: number;
}

export const getRemainingSeconds = (
  _userId: string | undefined,
  action: 'comment' | 'feature' | 'bug'
): number => {
  const storageKey = `smartdm_ratelimit_device_${action}`;
  const lastTimestampStr = localStorage.getItem(storageKey);
  if (!lastTimestampStr) return 0;

  const lastTimestamp = parseInt(lastTimestampStr, 10);
  const elapsedSeconds = Math.floor((Date.now() - lastTimestamp) / 1000);
  const cooldownSeconds = COOLDOWNS[action];

  if (elapsedSeconds < cooldownSeconds) {
    return cooldownSeconds - elapsedSeconds;
  }
  return 0;
};

export const checkRateLimit = (
  userId: string | undefined,
  action: 'comment' | 'feature' | 'bug'
): RateLimitCheck => {
  const remainingSeconds = getRemainingSeconds(userId, action);

  if (remainingSeconds > 0) {
    const minutes = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    const timeFormatted = minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;

    let actionName = 'action';
    if (action === 'comment') actionName = 'comment';
    if (action === 'feature') actionName = 'feature proposal';
    if (action === 'bug') actionName = 'bug report';

    return {
      allowed: false,
      remainingSeconds,
      message: `Anti-Spam Protection: You can submit another ${actionName} in ${timeFormatted}.`
    };
  }

  return { allowed: true, remainingSeconds: 0 };
};

export const recordRateLimitAction = (
  _userId: string | undefined,
  action: 'comment' | 'feature' | 'bug'
) => {
  const storageKey = `smartdm_ratelimit_device_${action}`;
  localStorage.setItem(storageKey, Date.now().toString());
};
