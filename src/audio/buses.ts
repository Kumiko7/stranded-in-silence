/**
 * The mixer: `master -> { music, sfx, ambience, voice, ui }`, built from
 * `config/audio.json -> buses`. Every voice in the game ends up in exactly one
 * of these, which is what makes an options slider a one-line change later.
 *
 * Plain `GainNode`s rather than Tone.js wrappers: Tone renders the sounds, but
 * playback is cheap raw Web Audio and the two meet here.
 */
import type { AudioConfig } from '@/config/types';

export class BusGraph {
  readonly #nodes = new Map<string, GainNode>();
  readonly #master: GainNode;

  constructor(context: AudioContext, config: AudioConfig['buses']) {
    for (const [id, entry] of Object.entries(config)) {
      const gain = context.createGain();
      gain.gain.value = entry.defaultVolume;
      this.#nodes.set(id, gain);
    }

    let master: GainNode | null = null;
    for (const [id, entry] of Object.entries(config)) {
      const node = this.#nodes.get(id);
      if (!node) continue;
      const parent = entry.parent ? this.#nodes.get(entry.parent) : null;
      if (parent) {
        node.connect(parent);
      } else {
        // A bus with no parent is the top of the tree.
        node.connect(context.destination);
        master ??= node;
      }
    }

    if (!master) throw new Error('config: audio.json has no parentless bus to use as master');
    this.#master = master;
  }

  /** Falls back to master so an unknown bus id is audible rather than silent. */
  node(id: string): GainNode {
    return this.#nodes.get(id) ?? this.#master;
  }

  setVolume(id: string, volume: number): void {
    const node = this.#nodes.get(id);
    if (node) node.gain.value = Math.max(0, volume);
  }
}
