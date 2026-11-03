export type ToneId = 'ink' | 'slate' | 'warm' | 'rose' | 'sky' | 'moss';
export type MotionPreference = 'standard' | 'reduced';

export interface GuiPreferences {
  tone: ToneId;
  motion: MotionPreference;
  floaters: boolean;
  immersive: boolean;
}

export const DEFAULT_GUI_PREFERENCES: GuiPreferences = {
  tone: 'ink',
  motion: 'standard',
  floaters: true,
  immersive: false,
};

const STORAGE_KEY = 'seeenglish.gui.preferences.v1';
const TONES: ToneId[] = ['ink', 'slate', 'warm', 'rose', 'sky', 'moss'];

export function loadGuiPreferences(): GuiPreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GUI_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<GuiPreferences>;
    return {
      tone: TONES.includes(parsed.tone as ToneId)
        ? (parsed.tone as ToneId)
        : DEFAULT_GUI_PREFERENCES.tone,
      motion: parsed.motion === 'reduced' ? 'reduced' : 'standard',
      floaters:
        typeof parsed.floaters === 'boolean'
          ? parsed.floaters
          : DEFAULT_GUI_PREFERENCES.floaters,
      immersive:
        typeof parsed.immersive === 'boolean'
          ? parsed.immersive
          : DEFAULT_GUI_PREFERENCES.immersive,
    };
  } catch {
    return { ...DEFAULT_GUI_PREFERENCES };
  }
}

export function saveGuiPreferences(preferences: GuiPreferences): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Preferences are a convenience; storage failure should not break the UI.
  }
}

export function applyGuiPreferences(preferences: GuiPreferences): void {
  const root = document.documentElement;
  root.dataset.tone = preferences.tone;
  root.dataset.motion = preferences.motion;
  root.dataset.floaters = preferences.floaters ? 'on' : 'off';
  root.dataset.immersive = preferences.immersive ? 'on' : 'off';
}
