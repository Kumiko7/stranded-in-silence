/**
 * soundId -> AudioBuffer.
 *
 * A file under `assets/audio/` always wins; failing that the Tone.js recipe named
 * by the registry entry is rendered offline once. A sound with neither is legal
 * and silent - gameplay is allowed to ship ahead of its audio, which is exactly
 * how this project got here (docs/systems/AUDIO_VOICE.md).
 */
import * as Tone from 'tone';
import type { AudioConfig } from '@/config/types';
import { firstPresent } from './files';
import { RECIPES } from './recipes';

export class SoundLibrary {
  readonly #buffers = new Map<string, AudioBuffer>();
  readonly #warned = new Set<string>();

  /**
   * Renders and decodes everything in the registry. Offline rendering swaps
   * Tone's global context for the duration, so recipes are done one at a time.
   */
  async load(context: AudioContext, sounds: Record<string, AudioConfig['sounds'][string]>): Promise<void> {
    for (const [soundId, def] of Object.entries(sounds)) {
      const url = firstPresent(def.files);
      if (url) {
        const buffer = await decode(context, url);
        if (buffer) {
          this.#buffers.set(soundId, buffer);
          continue;
        }
      }

      const recipe = def.synth ? RECIPES[def.synth] : undefined;
      if (!recipe) {
        if (def.synth) console.warn(`[audio] "${soundId}" names unknown synth recipe "${def.synth}"`);
        continue;
      }

      const rendered = await Tone.Offline(() => recipe.build(), recipe.seconds);
      const buffer = rendered.get();
      if (buffer) this.#buffers.set(soundId, buffer);
    }
  }

  /** Null once per unknown or sourceless sound, then quietly forever. */
  buffer(soundId: string): AudioBuffer | null {
    const buffer = this.#buffers.get(soundId);
    if (buffer) return buffer;
    if (!this.#warned.has(soundId)) {
      this.#warned.add(soundId);
      console.info(`[audio] "${soundId}" has no source - staying silent`);
    }
    return null;
  }
}

async function decode(context: AudioContext, url: string): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await context.decodeAudioData(await response.arrayBuffer());
  } catch (error) {
    console.warn(`[audio] could not decode ${url}`, error);
    return null;
  }
}
