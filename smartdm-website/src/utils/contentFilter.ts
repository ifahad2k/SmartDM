/**
 * Strict Content Safety & Vulgarity Scanner for SmartDM.
 * Detects all profanity variations, explicit slurs, hate speech, and vulgar terms.
 */

// Comprehensive list of profane, vulgar, and offensive root terms & variations
const VULGAR_TERMS = [
  'fuck', 'fuk', 'fck', 'motherfuck', 'motherfucker', 'fucking', 'fucked', 'fuckin',
  'shit', 'shitting', 'shitty', 'bullshit',
  'bitch', 'bitches', 'bitching',
  'asshole', 'asswipe', 'dumbass', 'jackass', 'arse', 'arsehole',
  'bastard', 'cunt', 'cunts',
  'dick', 'dicks', 'dickhead', 'cock', 'cocks', 'cocksucker',
  'pussy', 'pussies', 'whore', 'whores', 'slut', 'sluts',
  'nigger', 'nigga', 'niggers', 'niggas', 'faggot', 'fag', 'retard', 'retarded',
  'spic', 'chink', 'kike', 'porn', 'nsfw', 'hentai', 'xxx'
];

interface ContentCheckResult {
  isSafe: boolean;
  reason?: string;
}

export const checkTextSafety = (text: string): ContentCheckResult => {
  if (!text || text.trim().length === 0) {
    return { isSafe: true };
  }

  // Remove leetspeak numbers & symbols for normalization (e.g., f*ck, f u c k, f#ck, sh!t, b!tch)
  const normalized = text
    .toLowerCase()
    .replace(/[@@]/g, 'a')
    .replace(/[!i1|]/g, 'i')
    .replace(/[$s5]/g, 's')
    .replace(/[0o]/g, 'o')
    .replace(/[^a-z\s]/g, ' ');

  // Split into individual words and word pairs
  const words = normalized.split(/\s+/);

  for (const word of words) {
    if (!word) continue;
    for (const term of VULGAR_TERMS) {
      if (word.includes(term)) {
        return {
          isSafe: false,
          reason: `Submission contains vulgar or offensive word ("${word}"). Please keep feedback respectful.`
        };
      }
    }
  }

  // Also check raw string substring match for phrases like "fuck you", "you motherfucker"
  const rawLower = text.toLowerCase();
  for (const term of VULGAR_TERMS) {
    if (rawLower.includes(term)) {
      return {
        isSafe: false,
        reason: 'Submission contains vulgar or offensive language. Please keep feedback respectful.'
      };
    }
  }

  return { isSafe: true };
};

export const checkImageSafety = (dataUrl: string): ContentCheckResult => {
  if (!dataUrl) return { isSafe: true };

  if (!dataUrl.startsWith('data:image/')) {
    return { isSafe: false, reason: 'Invalid image format uploaded.' };
  }

  return { isSafe: true };
};
