export type TextTone = 'ink' | 'slate' | 'warm' | 'rose' | 'sky' | 'moss';
export type MotionPreference = 'standard' | 'reduced';
export type LibraryLayout = 'list' | 'grid';

export interface Preferences {
  tone: TextTone;
  motion: MotionPreference;
  floaters: boolean;
  immersive: boolean;
  libraryLayout: LibraryLayout;
}

export const DEFAULT_PREFERENCES: Preferences = {
  tone: 'ink',
  motion: 'standard',
  floaters: true,
  immersive: false,
  libraryLayout: 'list',
};

const STORAGE_KEY = 'seeenglish.preferences.v1';
const TONES: TextTone[] = ['ink', 'slate', 'warm', 'rose', 'sky', 'moss'];
const MOTIONS: MotionPreference[] = ['standard', 'reduced'];
const LIBRARY_LAYOUTS: LibraryLayout[] = ['list', 'grid'];

export function loadPreferences(): Preferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      tone: TONES.includes(parsed.tone as TextTone)
        ? (parsed.tone as TextTone)
        : DEFAULT_PREFERENCES.tone,
      motion: MOTIONS.includes(parsed.motion as MotionPreference)
        ? (parsed.motion as MotionPreference)
        : DEFAULT_PREFERENCES.motion,
      floaters:
        typeof parsed.floaters === 'boolean'
          ? parsed.floaters
          : DEFAULT_PREFERENCES.floaters,
      immersive:
        typeof parsed.immersive === 'boolean'
          ? parsed.immersive
          : DEFAULT_PREFERENCES.immersive,
      libraryLayout: LIBRARY_LAYOUTS.includes(parsed.libraryLayout as LibraryLayout)
        ? (parsed.libraryLayout as LibraryLayout)
        : DEFAULT_PREFERENCES.libraryLayout,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(preferences: Preferences): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Preferences are a convenience; storage failures should not break the app.
  }
}

export function applyPreferences(preferences: Preferences): void {
  const root = document.documentElement;
  root.dataset.tone = preferences.tone;
  root.dataset.motion = preferences.motion;
  root.dataset.floaters = preferences.floaters ? 'on' : 'off';
  root.dataset.immersive = preferences.immersive ? 'on' : 'off';
}
