/**
 * User Drafts Manager for SmartDM.
 * Allows users to save draft bug reports & feature ideas locally with multiple images and submit later.
 */

export interface SavedDraft {
  id: string;
  type: 'feature' | 'bug';
  title: string;
  summary: string;
  platform: string;
  problem?: string;
  proposedSolution?: string;
  stepsToReproduce?: string;
  imageUrl?: string;
  imageUrls?: string[];
  savedAt: string;
}

const STORAGE_KEY = 'smartdm_user_drafts';

export const getSavedDrafts = (): SavedDraft[] => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch (e) {
    return [];
  }
};

export const saveDraft = (draft: Omit<SavedDraft, 'id' | 'savedAt'>): SavedDraft => {
  const existing = getSavedDrafts();
  const newDraft: SavedDraft = {
    id: `draft_${Date.now()}`,
    savedAt: new Date().toISOString(),
    ...draft
  };
  const updated = [newDraft, ...existing];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return newDraft;
};

export const deleteDraft = (draftId: string): void => {
  const existing = getSavedDrafts();
  const updated = existing.filter(d => d.id !== draftId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
};
