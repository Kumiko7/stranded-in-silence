/**
 * How loud a teammate is, from how far away they are. Nothing else.
 *
 * Distance only: walls and doors never muffle voice (docs/ARCHITECTURE.md
 * "Deliberately NOT built" -> sound occlusion). In a maze of rooms an occlusion
 * term would apply nearly all the time and quietly destroy the thing voice is
 * for, which is hearing each other across the map.
 *
 * Deliberately generous. `hearingRange` is far beyond what the enemy can hear
 * speech at (`enemy.json -> hearing.voiceRoomLimit`), so talking is mostly safe
 * and sprinting is not.
 */
import type { VoiceConfig } from '@/config/types';

/**
 * 1 inside `fullVolumeRange`, 0 at `hearingRange`, and a curve between them.
 *
 * `inverse` matches the `PannerNode` distance model the rest of the game's
 * audio uses, so a voice falls off like a footstep does; `linear` is there for
 * anyone tuning who wants a flatter, more readable range.
 */
export function voiceGain(distance: number, config: VoiceConfig): number {
  const near = Math.max(0, config.fullVolumeRange);
  const far = Math.max(near + 0.01, config.hearingRange);

  if (distance <= near) return 1;
  if (distance >= far) return 0;

  const linear = 1 - (distance - near) / (far - near);
  if (config.falloff === 'linear') return linear;

  // Inverse-square-ish, then faded out over the last stretch so a voice reaches
  // true silence at the range rather than being cut off mid-word.
  return (near / distance) * linear;
}
