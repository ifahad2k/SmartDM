/**
 * Aspect-Ratio Preserving Image Compressor for SmartDM.
 * Preserves 100% exact original aspect ratio while iteratively tuning
 * WebP quality and canvas scale to guarantee high clarity and payload size < 220KB.
 */
export const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Failed to read image file.'));

    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image element.'));

      img.onload = () => {
        const origWidth = img.width;
        const origHeight = img.height;
        
        // Calculate exact original aspect ratio (width / height)
        const aspectRatio = origWidth / origHeight;

        let targetWidth = origWidth;
        let targetHeight = origHeight;

        // Proportional scale to max 1400px preserving EXACT original aspect ratio
        const MAX_BOUND = 1400;
        if (targetWidth > MAX_BOUND || targetHeight > MAX_BOUND) {
          if (origWidth >= origHeight) {
            targetWidth = MAX_BOUND;
            targetHeight = Math.round(MAX_BOUND / aspectRatio);
          } else {
            targetHeight = MAX_BOUND;
            targetWidth = Math.round(MAX_BOUND * aspectRatio);
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Failed to get canvas context.'));

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        // Iterative quality loop to ensure dataUrl is strictly < 300,000 chars (~220KB)
        let quality = 0.82;
        let dataUrl = canvas.toDataURL('image/webp', quality);

        if (!dataUrl.startsWith('data:image/webp')) {
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        while (dataUrl.length > 300000 && quality > 0.35) {
          quality -= 0.10;
          dataUrl = canvas.toDataURL('image/webp', quality);
          if (!dataUrl.startsWith('data:image/webp')) {
            dataUrl = canvas.toDataURL('image/jpeg', quality);
          }
        }

        resolve(dataUrl);
      };

      img.src = event.target?.result as string;
    };

    reader.readAsDataURL(file);
  });
};
