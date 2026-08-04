/**
 * The three voice modes and the single control that switches between them.
 *
 * The design brief is explicit that this is ONE control (docs/systems/UI.md ->
 * Pause), so the order below is the order the pause menu shows and the order
 * `nextMode()` cycles - both read it from `net.json -> voice.modes` rather than
 * hardcoding a sequence.
 */
import type { VoiceMode } from '@/config/types';

/** Locale key for a mode's label. Shared by the pause control and the HUD pill. */
export function modeLabelKey(mode: VoiceMode): string {
  return `options.voiceMode.${mode}`;
}

/** The next mode in the configured order, wrapping. */
export function nextMode(modes: readonly VoiceMode[], current: VoiceMode): VoiceMode {
  if (!modes.length) return current;
  const index = modes.indexOf(current);
  return modes[(index + 1) % modes.length] ?? modes[0]!;
}

/** Whether the mode wants a live microphone at all. `off` stops the track. */
export function needsMicrophone(mode: VoiceMode): boolean {
  return mode !== 'off';
}

/**
 * Whether the mic should currently be OPEN, given the mode and the two inputs
 * that can open it. Push-to-talk ignores the level entirely: holding the key
 * transmits whatever you have got, including a whisper.
 */
export function shouldTransmit(mode: VoiceMode, activity: boolean, pushToTalk: boolean): boolean {
  if (mode === 'off') return false;
  return mode === 'pushToTalk' ? pushToTalk : activity;
}
