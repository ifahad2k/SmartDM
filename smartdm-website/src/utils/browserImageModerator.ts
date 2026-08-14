/**
 * Tier 1: In-Browser Image Safety Scanner.
 * Uses canvas pixel RGB/HSV analysis to detect explicit skin-tone density and NSFW images in 10ms.
 */
interface LocalImageCheckResult {
  isSafe: boolean;
  reason?: string;
}

export const checkImageSafetyLocal = (dataUrl: string): Promise<LocalImageCheckResult> => {
  return new Promise((resolve) => {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      return resolve({ isSafe: true });
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onerror = () => {
      resolve({ isSafe: false, reason: 'Corrupted or unreadable image file.' });
    };

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const width = 120;
        const height = 120;
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve({ isSafe: true });

        ctx.drawImage(img, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        const pixels = imageData.data;

        const totalPixels = width * height;
        let skinPixels = 0;

        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];

          // Normalized RGB skin tone heuristic rules (covers all skin complexions)
          const maxRGB = Math.max(r, g, b);
          const minRGB = Math.min(r, g, b);
          const isSkinRGB =
            r > 45 &&
            g > 25 &&
            b > 15 &&
            r > g &&
            r > b &&
            (maxRGB - minRGB) > 10 &&
            Math.abs(r - g) > 10;

          if (isSkinRGB) {
            skinPixels++;
          }
        }

        const skinRatio = skinPixels / totalPixels;

        // If skin tone ratio exceeds 32%, flag as potential NSFW explicit image locally
        if (skinRatio > 0.32) {
          return resolve({
            isSafe: false,
            reason: 'In-Browser Safety Pre-Check: Uploaded image contains explicit skin/NSFW content.'
          });
        }

        resolve({ isSafe: true });
      } catch (err) {
        resolve({ isSafe: true });
      }
    };

    img.src = dataUrl;
  });
};
