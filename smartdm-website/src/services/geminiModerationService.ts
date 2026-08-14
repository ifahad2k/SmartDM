import { checkTextSafety } from '../utils/contentFilter';
import { checkImageSafetyLocal } from '../utils/browserImageModerator';

interface ModerationResult {
  safe: boolean;
  reason?: string;
}

/**
 * 2-Tier Multimodal Content Moderation Service:
 * Tier 1: Instant In-Browser Text & Canvas Image Pre-Check (~20ms)
 * Tier 2: Gemini 1.5 Flash Multimodal AI Safety Inspection (Supports multiple attached images)
 */
export const moderateSubmission = async (
  title: string,
  text: string,
  imageUrls?: string[]
): Promise<ModerationResult> => {
  // 1. Tier 1: In-Browser Text Profanity & Vulgarity Filter
  const textCheck = checkTextSafety(`${title} ${text}`);
  if (!textCheck.isSafe) {
    return { safe: false, reason: textCheck.reason };
  }

  // 2. Tier 1: In-Browser Image Pre-Check for each attached image
  if (imageUrls && imageUrls.length > 0) {
    for (const imgUrl of imageUrls) {
      if (imgUrl) {
        const localCheck = await checkImageSafetyLocal(imgUrl);
        if (!localCheck.isSafe) {
          return { safe: false, reason: localCheck.reason };
        }
      }
    }
  }

  // 3. Tier 2: Gemini 1.5 Flash Vision AI Inspection
  const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY || "AIzaSyAxjo3IEitPP__rhi_SxmlFgjNzVOWvGWo";
  if (!geminiApiKey) {
    return { safe: true };
  }

  try {
    const parts: any[] = [
      {
        text: `STRICT SAFETY AUDIT: You are an automated content moderation AI for SmartDM open source software.
Analyze the following user feedback submission AND ALL ATTACHED IMAGES for inappropriate, vulgar, sexually explicit, NSFW, nudity, suggestive graphics, hate speech, or offensive content.

Title: "${title}"
Details: "${text}"

If any attached image contains explicit nudity, sexually suggestive content, or NSFW graphics, YOU MUST REJECT IT (set safe to false).

Respond ONLY with a valid JSON object in this format:
{"safe": true} OR {"safe": false, "reason": "Explicit image or inappropriate text detected"}`
      }
    ];

    // Append all attached images to parts array using proper Gemini REST JSON fields
    if (imageUrls && imageUrls.length > 0) {
      for (const imgUrl of imageUrls) {
        if (imgUrl && imgUrl.startsWith('data:image/')) {
          const rawMime = imgUrl.substring(imgUrl.indexOf(':') + 1, imgUrl.indexOf(';'));
          const mimeType = rawMime.includes('webp') ? 'image/webp' : rawMime.includes('png') ? 'image/png' : 'image/jpeg';
          const base64Data = imgUrl.substring(imgUrl.indexOf(',') + 1);

          parts.push({
            inlineData: {
              mimeType,
              data: base64Data
            }
          });
        }
      }
    }

    const payload = {
      contents: [{ parts }]
    };

    // Call Gemini 1.5 Flash REST API
    let response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    // Fallback to gemini-2.0-flash if 1.5 is busy
    if (!response.ok) {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );
    }

    if (response.ok) {
      const data = await response.json();
      const candidate = data.candidates?.[0];

      // Check if Gemini blocked the submission due to safety filters
      if (candidate?.finishReason === "SAFETY" || candidate?.finishReason === "RECITATION") {
        return {
          safe: false,
          reason: "Image or content blocked by Gemini AI Safety System (Sexually Explicit / NSFW detected)."
        };
      }

      // Check safety ratings for HIGH probability sexually explicit content
      const safetyRatings = candidate?.safetyRatings || [];
      for (const rating of safetyRatings) {
        if (
          rating.category === "HARM_CATEGORY_SEXUALLY_EXPLICIT" &&
          rating.probability === "HIGH"
        ) {
          return {
            safe: false,
            reason: "Uploaded image flagged as sexually explicit or NSFW by Gemini AI."
          };
        }
      }

      // Parse JSON text response
      const outputText = candidate?.content?.parts?.[0]?.text || '';
      const jsonMatch = outputText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.safe === false) {
          return {
            safe: false,
            reason: parsed.reason || 'Image or text content violated safety guidelines.'
          };
        }
      }
    }
  } catch (err) {
    console.warn('Gemini AI moderation exception:', err);
  }

  return { safe: true };
};
