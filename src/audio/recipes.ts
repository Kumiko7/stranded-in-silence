/**
 * Every sound effect in the game, synthesised with Tone.js.
 *
 * Each recipe is rendered ONCE at boot into an `AudioBuffer` (`library.ts`), so
 * playback afterwards is a plain buffer source - no synth graph is built per
 * footstep. That also means a synthesised sound and a composer's `.ogg` are the
 * same thing by the time anything plays them.
 *
 * These numbers are sound design, not gameplay: they are the equivalent of the
 * literals in `art/`, and they are why a recipe can be replaced by a file
 * without a line of logic changing. Anything a player or a designer would
 * plausibly tune - bus, volume, pitch spread, which event fires what - lives in
 * `config/audio.json` instead.
 *
 * Looping recipes must be seamless: keep modulation periods dividing the buffer
 * length and start/end at silence or at a matching phase.
 */
import * as Tone from 'tone';

export interface Recipe {
  /** Rendered buffer length. */
  seconds: number;
  /** Called inside `Tone.Offline`, so `.toDestination()` is the buffer. */
  build(): void;
}

/** Exponential ramps cannot reach zero; this is our practical silence. */
const FLOOR = 0.0005;

function sink(): Tone.Gain {
  return new Tone.Gain(FLOOR).toDestination();
}

/** Attack / hold / decay on a gain node, exponential so nothing clicks. */
function shape(node: Tone.Gain, at: number, attack: number, hold: number, decay: number, peak: number): void {
  const level = Math.max(FLOOR, peak);
  const param = node.gain;
  param.setValueAtTime(FLOOR, at);
  param.exponentialRampToValueAtTime(level, at + attack);
  param.setValueAtTime(level, at + attack + hold);
  param.exponentialRampToValueAtTime(FLOOR, at + attack + hold + decay);
}

interface ToneOptions {
  at?: number;
  from: number;
  to?: number;
  type?: Tone.ToneOscillatorType;
  attack?: number;
  hold?: number;
  decay?: number;
  peak?: number;
  /** Optional lowpass, for taking the edge off a saw. */
  lowpass?: number;
}

/** A single pitched voice with an envelope and an optional glide. */
function voice(options: ToneOptions): void {
  const at = options.at ?? 0;
  const attack = options.attack ?? 0.004;
  const hold = options.hold ?? 0;
  const decay = options.decay ?? 0.15;
  const end = at + attack + hold + decay;

  const gain = sink();
  const osc = new Tone.Oscillator(options.from, options.type ?? 'sine');

  if (options.lowpass) {
    const filter = new Tone.Filter({ type: 'lowpass', frequency: options.lowpass, Q: 1 });
    osc.connect(filter);
    filter.connect(gain);
  } else {
    osc.connect(gain);
  }

  osc.start(at).stop(end + 0.02);
  if (options.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, options.to), end);
  shape(gain, at, attack, hold, decay, options.peak ?? 0.5);
}

interface NoiseOptions {
  at?: number;
  colour?: Tone.NoiseType;
  filter?: BiquadFilterType;
  from: number;
  to?: number;
  q?: number;
  attack?: number;
  hold?: number;
  decay?: number;
  peak?: number;
}

/** A filtered noise burst: every impact, scrape and breath is built from these. */
function noise(options: NoiseOptions): void {
  const at = options.at ?? 0;
  const attack = options.attack ?? 0.003;
  const hold = options.hold ?? 0;
  const decay = options.decay ?? 0.12;
  const end = at + attack + hold + decay;

  const gain = sink();
  const filter = new Tone.Filter({ type: options.filter ?? 'bandpass', frequency: options.from, Q: options.q ?? 1 });
  const source = new Tone.Noise(options.colour ?? 'white');

  source.connect(filter);
  filter.connect(gain);
  source.start(at).stop(end + 0.02);
  if (options.to !== undefined) filter.frequency.exponentialRampToValueAtTime(Math.max(20, options.to), end);
  shape(gain, at, attack, hold, decay, options.peak ?? 0.4);
}

/**
 * Wood under load. A very resonant bandpass walked unevenly across a range -
 * smooth glides sound like a slide whistle, and hinges do not do that.
 */
function creak(options: { at?: number; seconds: number; from: number; to: number; peak: number; wobble?: number }): void {
  const at = options.at ?? 0;
  const gain = sink();
  const filter = new Tone.Filter({ type: 'bandpass', frequency: options.from, Q: 18 });
  const source = new Tone.Noise('brown');

  source.connect(filter);
  filter.connect(gain);
  source.start(at).stop(at + options.seconds + 0.02);

  const steps = 9;
  const wobble = options.wobble ?? 60;
  for (let i = 1; i <= steps; i++) {
    const progress = i / steps;
    const drift = ((i % 3) - 1) * wobble;
    filter.frequency.linearRampToValueAtTime(
      Math.max(90, options.from + (options.to - options.from) * progress + drift),
      at + options.seconds * progress,
    );
  }
  shape(gain, at, options.seconds * 0.2, options.seconds * 0.45, options.seconds * 0.35, options.peak);
}

/** Metal: inharmonic partials, so it rings rather than sings. */
function ping(options: { at?: number; from: number; decay?: number; peak?: number }): void {
  const at = options.at ?? 0;
  const decay = options.decay ?? 0.35;
  for (const [ratio, share] of [[1, 1], [2.76, 0.5], [5.42, 0.22]] as const) {
    voice({
      at,
      from: options.from * ratio,
      type: 'sine',
      attack: 0.001,
      decay: decay / ratio,
      peak: (options.peak ?? 0.3) * share,
    });
  }
}

/** A sustained stack of pitches. The interval is what makes it warm or wrong. */
function chord(options: {
  at?: number;
  root: number;
  ratios: readonly number[];
  type?: Tone.ToneOscillatorType;
  attack: number;
  hold: number;
  decay: number;
  peak: number;
  lowpass?: number;
}): void {
  for (const ratio of options.ratios) {
    voice({
      at: options.at,
      from: options.root * ratio,
      type: options.type ?? 'sine',
      attack: options.attack,
      hold: options.hold,
      decay: options.decay,
      peak: options.peak / options.ratios.length,
      ...(options.lowpass ? { lowpass: options.lowpass } : {}),
    });
  }
}

/** A steady filtered-noise bed at constant gain - loops without a seam. */
function bed(options: { seconds: number; from: number; q: number; peak: number; colour?: Tone.NoiseType }): Tone.Gain {
  const gain = new Tone.Gain(options.peak).toDestination();
  const filter = new Tone.Filter({ type: 'bandpass', frequency: options.from, Q: options.q });
  const source = new Tone.Noise(options.colour ?? 'brown');
  source.connect(filter);
  filter.connect(gain);
  source.start(0).stop(options.seconds);
  return gain;
}

export const RECIPES: Record<string, Recipe> = {
  /* --- interface ---------------------------------------------------------- */

  'ui.hover': {
    seconds: 0.12,
    build(): void {
      voice({ from: 1320, type: 'sine', attack: 0.004, decay: 0.07, peak: 0.18 });
    },
  },

  'ui.click': {
    seconds: 0.24,
    build(): void {
      noise({ from: 3200, filter: 'highpass', attack: 0.001, decay: 0.03, peak: 0.16 });
      voice({ from: 660, to: 520, type: 'triangle', attack: 0.002, decay: 0.1, peak: 0.3 });
      voice({ from: 150, to: 110, type: 'sine', attack: 0.002, decay: 0.14, peak: 0.35 });
    },
  },

  'ui.back': {
    seconds: 0.3,
    build(): void {
      voice({ from: 520, to: 300, type: 'triangle', attack: 0.003, decay: 0.16, peak: 0.28 });
      voice({ from: 130, to: 92, type: 'sine', attack: 0.003, decay: 0.2, peak: 0.28 });
    },
  },

  /* --- footsteps ----------------------------------------------------------- */

  'footstep.walk': {
    seconds: 0.28,
    build(): void {
      noise({ colour: 'brown', from: 420, to: 260, q: 1.3, attack: 0.002, decay: 0.1, peak: 0.4 });
      voice({ from: 92, to: 55, type: 'sine', attack: 0.002, decay: 0.09, peak: 0.35 });
    },
  },

  'footstep.sprint': {
    seconds: 0.34,
    build(): void {
      noise({ colour: 'brown', from: 620, to: 300, q: 1.1, attack: 0.001, decay: 0.11, peak: 0.6 });
      voice({ from: 110, to: 48, type: 'sine', attack: 0.001, decay: 0.13, peak: 0.6 });
      // The scuff of a foot that landed too hard to land flat.
      noise({ at: 0.05, from: 2400, filter: 'highpass', attack: 0.004, decay: 0.09, peak: 0.14 });
    },
  },

  'footstep.crouch': {
    seconds: 0.26,
    build(): void {
      noise({ colour: 'brown', from: 240, to: 170, q: 1.6, attack: 0.006, decay: 0.13, peak: 0.4 });
      voice({ from: 70, to: 46, type: 'sine', attack: 0.004, decay: 0.1, peak: 0.25 });
    },
  },

  /* --- the body ------------------------------------------------------------ */

  'player.injured': {
    seconds: 1.0,
    build(): void {
      // A sharp intake, then the sound of not wanting to make a sound.
      noise({ colour: 'pink', from: 900, to: 420, q: 2.2, attack: 0.02, hold: 0.05, decay: 0.25, peak: 0.34 });
      voice({ at: 0.06, from: 148, to: 116, type: 'sawtooth', lowpass: 700, attack: 0.03, hold: 0.12, decay: 0.4, peak: 0.3 });
      noise({ at: 0.34, colour: 'pink', from: 620, to: 300, q: 1.6, attack: 0.06, hold: 0.08, decay: 0.4, peak: 0.18 });
    },
  },

  'player.downed': {
    seconds: 1.9,
    build(): void {
      // The fall.
      voice({ from: 86, to: 38, type: 'sine', attack: 0.001, decay: 0.3, peak: 0.75 });
      noise({ colour: 'brown', from: 300, to: 120, q: 0.9, attack: 0.002, decay: 0.28, peak: 0.45 });
      // Then a groan that runs out of air.
      voice({ at: 0.22, from: 104, to: 72, type: 'sawtooth', lowpass: 460, attack: 0.09, hold: 0.35, decay: 0.9, peak: 0.34 });
      noise({ at: 0.3, colour: 'pink', from: 480, to: 220, q: 1.4, attack: 0.12, hold: 0.3, decay: 0.9, peak: 0.16 });
    },
  },

  'player.revive': {
    seconds: 2.0,
    build(): void {
      // Two breaths per loop: someone working, and someone still here.
      for (const at of [0, 1.0]) {
        noise({ at, colour: 'pink', from: 700, to: 380, q: 2.0, attack: 0.16, hold: 0.06, decay: 0.24, peak: 1.5 });
        noise({ at: at + 0.5, colour: 'brown', from: 320, to: 220, q: 1.4, attack: 0.1, hold: 0.04, decay: 0.3, peak: 1.0 });
      }
    },
  },

  'player.healed': {
    seconds: 1.4,
    build(): void {
      // A breath that finally goes all the way out, over a rising fifth. The
      // only unambiguously good news the sfx bus ever carries.
      noise({ colour: 'pink', from: 480, to: 260, q: 1.8, attack: 0.08, hold: 0.1, decay: 0.5, peak: 0.2 });
      chord({ at: 0.04, root: 196, ratios: [1, 1.5], type: 'triangle', lowpass: 1800, attack: 0.06, hold: 0.2, decay: 0.8, peak: 0.24 });
      ping({ at: 0.18, from: 1568, decay: 0.7, peak: 0.12 });
    },
  },

  'player.heartbeat': {
    seconds: 1.0,
    build(): void {
      // Lub-dub. Played faster and louder as it closes; see Game.#updateAudio.
      voice({ from: 62, to: 34, type: 'sine', attack: 0.008, decay: 0.16, peak: 0.85 });
      voice({ at: 0.005, from: 130, to: 70, type: 'triangle', lowpass: 220, attack: 0.005, decay: 0.1, peak: 0.25 });
      voice({ at: 0.3, from: 54, to: 30, type: 'sine', attack: 0.01, decay: 0.2, peak: 0.55 });
    },
  },

  /* --- doors --------------------------------------------------------------- */

  'door.open': {
    seconds: 1.5,
    build(): void {
      // Latch, then the hinge taking the weight.
      ping({ from: 1180, decay: 0.07, peak: 0.14 });
      noise({ from: 2600, filter: 'highpass', attack: 0.001, decay: 0.04, peak: 0.12 });
      creak({ at: 0.07, seconds: 1.05, from: 320, to: 560, peak: 0.75 });
      voice({ at: 0.05, from: 74, to: 52, type: 'sine', attack: 0.01, decay: 0.4, peak: 0.16 });
    },
  },

  'door.close': {
    seconds: 1.1,
    build(): void {
      // A slam is a door and a wall arguing about it.
      creak({ seconds: 0.3, from: 500, to: 340, peak: 0.2, wobble: 30 });
      voice({ at: 0.28, from: 128, to: 44, type: 'sine', attack: 0.001, decay: 0.34, peak: 0.9 });
      noise({ at: 0.28, colour: 'brown', from: 420, to: 130, q: 0.8, attack: 0.001, decay: 0.24, peak: 0.55 });
      ping({ at: 0.33, from: 1420, decay: 0.16, peak: 0.2 });
      // The frame ringing afterwards.
      voice({ at: 0.34, from: 240, to: 210, type: 'triangle', attack: 0.004, decay: 0.5, peak: 0.09 });
    },
  },

  'door.locked': {
    seconds: 0.6,
    build(): void {
      // A handle that will not turn, tried three times.
      for (const [i, at] of [0, 0.13, 0.27].entries()) {
        ping({ at, from: 2100 - i * 90, decay: 0.09, peak: 0.16 });
        noise({ at, colour: 'brown', from: 900, to: 500, q: 2.4, attack: 0.001, decay: 0.06, peak: 0.2 });
        voice({ at, from: 96, to: 74, type: 'sine', attack: 0.002, decay: 0.1, peak: 0.22 });
      }
    },
  },

  'door.unlock': {
    seconds: 0.95,
    build(): void {
      // Key in, key turning, bolt clearing the strike plate.
      noise({ from: 1900, to: 2600, filter: 'bandpass', q: 3.5, attack: 0.01, hold: 0.05, decay: 0.14, peak: 0.2 });
      ping({ at: 0.22, from: 1560, decay: 0.14, peak: 0.24 });
      ping({ at: 0.42, from: 980, decay: 0.3, peak: 0.3 });
      voice({ at: 0.42, from: 150, to: 96, type: 'sine', attack: 0.002, decay: 0.22, peak: 0.28 });
    },
  },

  /* --- containers ---------------------------------------------------------- */

  'chest.rummage': {
    seconds: 1.4,
    build(): void {
      // Loops for as long as the hold lasts: hinge strain and hands in the way.
      creak({ seconds: 0.7, from: 280, to: 400, peak: 2.6, wobble: 45 });
      noise({ at: 0.55, colour: 'brown', from: 1100, to: 700, q: 2.2, attack: 0.02, decay: 0.12, peak: 1.4 });
      noise({ at: 0.82, colour: 'brown', from: 800, to: 1300, q: 2.6, attack: 0.03, decay: 0.14, peak: 1.2 });
      creak({ at: 1.0, seconds: 0.38, from: 380, to: 290, peak: 1.9, wobble: 35 });
    },
  },

  'chest.opened': {
    seconds: 1.6,
    build(): void {
      creak({ seconds: 0.42, from: 300, to: 520, peak: 0.6 });
      // The lid going all the way over and hitting the back.
      voice({ at: 0.42, from: 130, to: 56, type: 'sine', attack: 0.001, decay: 0.3, peak: 0.7 });
      noise({ at: 0.42, colour: 'brown', from: 520, to: 180, q: 0.9, attack: 0.001, decay: 0.22, peak: 0.4 });
      // Something worth having.
      chord({ at: 0.52, root: 784, ratios: [1, 1.5, 2.51], attack: 0.02, hold: 0.1, decay: 0.85, peak: 0.16 });
    },
  },

  'locker.enter': {
    seconds: 0.8,
    build(): void {
      noise({ colour: 'brown', from: 700, to: 1200, q: 1.8, attack: 0.03, hold: 0.06, decay: 0.16, peak: 0.24 });
      ping({ at: 0.26, from: 760, decay: 0.4, peak: 0.22 });
      // Sheet steel is thin and says so.
      voice({ at: 0.28, from: 1720, to: 1660, type: 'triangle', attack: 0.002, decay: 0.34, peak: 0.08 });
      noise({ at: 0.34, colour: 'pink', from: 460, to: 300, q: 1.2, attack: 0.04, decay: 0.2, peak: 0.12 });
    },
  },

  'locker.exit': {
    seconds: 0.7,
    build(): void {
      ping({ from: 900, decay: 0.3, peak: 0.26 });
      noise({ colour: 'brown', from: 1300, to: 600, q: 1.6, attack: 0.002, decay: 0.2, peak: 0.26 });
      voice({ at: 0.02, from: 1840, to: 1780, type: 'triangle', attack: 0.002, decay: 0.28, peak: 0.07 });
    },
  },

  'item.pickup': {
    seconds: 0.5,
    build(): void {
      noise({ colour: 'pink', from: 1600, to: 900, q: 1.8, attack: 0.004, decay: 0.09, peak: 0.5 });
      voice({ at: 0.02, from: 880, type: 'triangle', attack: 0.004, decay: 0.1, peak: 0.3 });
      voice({ at: 0.09, from: 1318, type: 'triangle', attack: 0.004, decay: 0.22, peak: 0.26 });
    },
  },

  'item.drop': {
    seconds: 0.55,
    build(): void {
      voice({ from: 190, to: 96, type: 'sine', attack: 0.001, decay: 0.16, peak: 0.45 });
      noise({ colour: 'brown', from: 620, to: 240, q: 1.1, attack: 0.001, decay: 0.13, peak: 0.3 });
      // One small bounce, because nothing lands once.
      voice({ at: 0.15, from: 150, to: 90, type: 'sine', attack: 0.001, decay: 0.1, peak: 0.16 });
      noise({ at: 0.15, colour: 'brown', from: 500, to: 260, q: 1.2, attack: 0.001, decay: 0.08, peak: 0.12 });
    },
  },

  /* --- the item roster ------------------------------------------------------ */

  'item.throw': {
    seconds: 0.4,
    build(): void {
      // Cloth and air. Deliberately small: the throw is your sound, the landing
      // is everybody else's.
      noise({ colour: 'pink', from: 700, to: 2400, q: 1.1, attack: 0.02, hold: 0.03, decay: 0.16, peak: 0.24 });
      voice({ from: 240, to: 420, type: 'sine', attack: 0.02, decay: 0.14, peak: 0.08 });
    },
  },

  'item.impact': {
    seconds: 0.8,
    build(): void {
      // Something with weight hitting a floor it was not thrown at gently.
      voice({ from: 210, to: 62, type: 'sine', attack: 0.001, decay: 0.22, peak: 0.7 });
      noise({ colour: 'brown', from: 900, to: 240, q: 0.9, attack: 0.001, decay: 0.18, peak: 0.5 });
      ping({ at: 0.005, from: 1650, decay: 0.12, peak: 0.16 });
      // The skitter afterwards, because nothing thrown lands once.
      noise({ at: 0.17, colour: 'brown', from: 1300, to: 700, q: 2.0, attack: 0.002, decay: 0.1, peak: 0.16 });
      voice({ at: 0.28, from: 160, to: 100, type: 'sine', attack: 0.001, decay: 0.1, peak: 0.14 });
    },
  },

  'item.flash': {
    seconds: 2.4,
    build(): void {
      // The crack, then everything above 2 kHz for a moment, then the room.
      noise({ colour: 'white', from: 60, filter: 'highpass', attack: 0.0015, decay: 0.7, peak: 0.85 });
      voice({ from: 900, to: 60, type: 'sawtooth', lowpass: 3000, attack: 0.001, decay: 0.45, peak: 0.55 });
      voice({ from: 46, type: 'sine', attack: 0.004, hold: 0.12, decay: 0.9, peak: 0.7 });
      // The ring left in your ears once the bang has gone.
      voice({ at: 0.06, from: 4200, to: 3900, type: 'sine', attack: 0.02, hold: 0.5, decay: 1.5, peak: 0.12 });
    },
  },

  'item.alarm': {
    seconds: 1.0,
    build(): void {
      // Two bells beaten by one hammer, twelve strikes a second. One second of
      // it loops seamlessly, which is the whole point: it does not stop.
      for (let i = 0; i < 12; i++) {
        const at = i / 12;
        ping({ at, from: i % 2 === 0 ? 2340 : 2760, decay: 0.075, peak: 0.5 });
        noise({ at, colour: 'white', from: 5200, filter: 'highpass', attack: 0.001, decay: 0.02, peak: 0.12 });
      }
      // The case buzzing along with them.
      voice({ from: 156, type: 'square', lowpass: 900, attack: 0.05, hold: 0.85, decay: 0.1, peak: 0.05 });
    },
  },

  'item.tar': {
    seconds: 1.6,
    build(): void {
      // Glass giving up, then something heavy arriving flat.
      noise({ colour: 'white', from: 4600, to: 2200, filter: 'highpass', attack: 0.001, decay: 0.25, peak: 0.45 });
      for (const [at, from] of [[0.01, 3200], [0.05, 2600], [0.09, 3900]] as const) {
        ping({ at, from, decay: 0.18, peak: 0.14 });
      }
      voice({ at: 0.02, from: 150, to: 52, type: 'sine', attack: 0.002, decay: 0.3, peak: 0.5 });
      // The slick spreading: a wet, low, unhurried wash.
      noise({ at: 0.1, colour: 'brown', from: 520, to: 180, q: 1.1, attack: 0.08, hold: 0.25, decay: 0.7, peak: 0.34 });
    },
  },

  'item.medicine': {
    seconds: 2.0,
    build(): void {
      // Tearing gauze, twice, at slightly different lengths so the loop breathes.
      noise({ colour: 'pink', from: 2600, to: 1500, q: 1.2, attack: 0.02, hold: 0.14, decay: 0.2, peak: 1.2 });
      noise({ at: 0.7, colour: 'pink', from: 3000, to: 1700, q: 1.4, attack: 0.03, hold: 0.1, decay: 0.24, peak: 1.0 });
      // The tin, put down and picked up again.
      ping({ at: 1.25, from: 1180, decay: 0.2, peak: 0.5 });
      noise({ at: 1.5, colour: 'brown', from: 700, to: 420, q: 1.6, attack: 0.04, decay: 0.28, peak: 0.7 });
    },
  },

  'item.barricade': {
    seconds: 1.8,
    build(): void {
      // Wood against wood, worked at. Loops for as long as the ring is filling.
      creak({ seconds: 0.5, from: 240, to: 340, peak: 2.2, wobble: 50 });
      voice({ at: 0.55, from: 180, to: 90, type: 'sine', attack: 0.001, decay: 0.14, peak: 1.2 });
      noise({ at: 0.55, colour: 'brown', from: 800, to: 300, q: 1.2, attack: 0.001, decay: 0.16, peak: 0.9 });
      creak({ at: 0.95, seconds: 0.45, from: 320, to: 220, peak: 1.8, wobble: 40 });
      voice({ at: 1.45, from: 200, to: 96, type: 'sine', attack: 0.001, decay: 0.14, peak: 1.0 });
    },
  },

  'item.barricadePlaced': {
    seconds: 1.4,
    build(): void {
      // Three hammer blows and a plank settling against the frame.
      for (const [i, at] of [0, 0.2, 0.42].entries()) {
        voice({ at, from: 260 - i * 20, to: 90, type: 'sine', attack: 0.001, decay: 0.16, peak: 0.7 });
        noise({ at, colour: 'brown', from: 1400, to: 500, q: 1.4, attack: 0.001, decay: 0.1, peak: 0.4 });
        ping({ at, from: 2600 - i * 140, decay: 0.08, peak: 0.16 });
      }
      creak({ at: 0.62, seconds: 0.5, from: 280, to: 200, peak: 0.3, wobble: 40 });
    },
  },

  'item.barricadeBroken': {
    seconds: 1.8,
    build(): void {
      // Nails coming out of timber, and the timber losing.
      creak({ seconds: 0.35, from: 620, to: 300, peak: 0.55, wobble: 90 });
      noise({ at: 0.2, colour: 'brown', from: 2200, to: 600, q: 0.9, attack: 0.002, decay: 0.35, peak: 0.7 });
      voice({ at: 0.22, from: 320, to: 60, type: 'sawtooth', lowpass: 1600, attack: 0.002, decay: 0.4, peak: 0.5 });
      // The pieces hitting the floor after it.
      for (const [at, from] of [[0.5, 190], [0.68, 240], [0.83, 150]] as const) {
        voice({ at, from, to: from * 0.45, type: 'sine', attack: 0.001, decay: 0.18, peak: 0.4 });
        noise({ at, colour: 'brown', from: 800, to: 280, q: 1.2, attack: 0.001, decay: 0.14, peak: 0.26 });
      }
    },
  },

  'item.coins': {
    seconds: 1.2,
    build(): void {
      // A handful of metal, scooped. Nine strikes, deliberately uneven.
      for (const [i, at] of [0, 0.03, 0.07, 0.11, 0.18, 0.24, 0.33, 0.41, 0.52].entries()) {
        ping({ at, from: 1900 + ((i * 137) % 900), decay: 0.22 - i * 0.015, peak: 0.2 });
      }
      noise({ colour: 'white', from: 5200, filter: 'highpass', attack: 0.002, hold: 0.06, decay: 0.35, peak: 0.1 });
      voice({ at: 0.05, from: 260, to: 180, type: 'triangle', attack: 0.004, decay: 0.2, peak: 0.1 });
    },
  },

  'item.treasure': {
    seconds: 2.8,
    build(): void {
      // The only other consonant chord in the game, and it is not free.
      chord({ root: 261.6, ratios: [1, 1.5, 2, 3, 4], type: 'sine', attack: 0.02, hold: 0.5, decay: 1.9, peak: 0.34 });
      ping({ at: 0.01, from: 2093, decay: 1.6, peak: 0.24 });
      ping({ at: 0.14, from: 3136, decay: 1.2, peak: 0.16 });
      noise({ colour: 'white', from: 7000, filter: 'highpass', attack: 0.05, hold: 0.3, decay: 1.2, peak: 0.05 });
    },
  },

  /* --- the hunter ---------------------------------------------------------- */

  'enemy.idle': {
    seconds: 4.0,
    build(): void {
      // A drone that follows it around the map. Every frequency completes a whole
      // number of cycles in four seconds, so the loop has no seam.
      voice({ from: 55, type: 'sine', attack: 0.6, hold: 2.8, decay: 0.6, peak: 0.26 });
      voice({ from: 82.5, type: 'sine', attack: 0.9, hold: 2.2, decay: 0.9, peak: 0.12 });
      voice({ from: 110.5, type: 'triangle', lowpass: 400, attack: 1.2, hold: 1.6, decay: 1.2, peak: 0.08 });
      // Breath in, breath out, twice.
      bed({ seconds: 4.0, from: 420, q: 2.4, peak: 0.35, colour: 'pink' });
      for (const at of [0.2, 2.2]) {
        noise({ at, colour: 'pink', from: 560, to: 320, q: 3.0, attack: 0.5, hold: 0.2, decay: 0.7, peak: 0.7 });
      }
    },
  },

  'enemy.alerted': {
    seconds: 1.4,
    build(): void {
      // It heard something. A tritone that swells and then simply stops.
      chord({ root: 220, ratios: [1, 1.414], type: 'sawtooth', lowpass: 1400, attack: 0.5, hold: 0.25, decay: 0.35, peak: 0.32 });
      voice({ from: 3140, to: 3300, type: 'sine', attack: 0.6, hold: 0.2, decay: 0.3, peak: 0.05 });
      noise({ colour: 'pink', from: 1400, to: 2600, q: 1.4, attack: 0.7, hold: 0.1, decay: 0.3, peak: 0.08 });
    },
  },

  'enemy.sting': {
    seconds: 2.2,
    build(): void {
      // It has seen you. Nothing subtle happens here.
      noise({ colour: 'white', from: 8000, to: 900, filter: 'highpass', attack: 0.004, decay: 0.5, peak: 0.35 });
      chord({ root: 110, ratios: [1, 1.06, 1.414], type: 'sawtooth', lowpass: 2200, attack: 0.01, hold: 0.22, decay: 0.5, peak: 0.55 });
      voice({ from: 420, to: 84, type: 'sawtooth', lowpass: 1200, attack: 0.005, hold: 0.05, decay: 0.7, peak: 0.35 });
      // The low end left ringing under it.
      voice({ at: 0.1, from: 44, type: 'sine', attack: 0.05, hold: 0.6, decay: 1.2, peak: 0.5 });
    },
  },

  'enemy.attack': {
    seconds: 1.0,
    build(): void {
      noise({ colour: 'white', from: 6000, to: 700, filter: 'highpass', attack: 0.002, decay: 0.22, peak: 0.34 });
      voice({ from: 1400, to: 2900, type: 'sawtooth', lowpass: 4000, attack: 0.002, decay: 0.2, peak: 0.14 });
      voice({ from: 130, to: 40, type: 'sine', attack: 0.001, decay: 0.35, peak: 0.5 });
      chord({ at: 0.03, root: 155, ratios: [1, 1.06], type: 'sawtooth', lowpass: 900, attack: 0.01, hold: 0.1, decay: 0.4, peak: 0.2 });
    },
  },

  /* --- the exit ------------------------------------------------------------ */

  'exit.hold': {
    seconds: 2.0,
    build(): void {
      // A fifth held open under a slow tremolo. Frequencies are multiples of
      // 0.5 Hz so the loop point lands on a zero crossing.
      voice({ from: 110, type: 'sine', attack: 0.4, hold: 1.2, decay: 0.4, peak: 0.3 });
      voice({ from: 165, type: 'triangle', lowpass: 900, attack: 0.5, hold: 1.0, decay: 0.5, peak: 0.16 });
      voice({ from: 330, type: 'sine', attack: 0.7, hold: 0.6, decay: 0.7, peak: 0.08 });
      bed({ seconds: 2.0, from: 1800, q: 1.6, peak: 0.03, colour: 'pink' });
    },
  },

  'exit.escaped': {
    seconds: 3.4,
    build(): void {
      // The only consonant chord in the game.
      chord({ root: 146.8, ratios: [1, 1.5, 2, 3], type: 'triangle', lowpass: 2600, attack: 0.05, hold: 0.7, decay: 2.4, peak: 0.5 });
      ping({ at: 0.02, from: 1174, decay: 1.8, peak: 0.22 });
      noise({ colour: 'pink', from: 4000, to: 1200, q: 1.2, attack: 0.06, hold: 0.2, decay: 1.4, peak: 0.07 });
    },
  },

  'run.wiped': {
    seconds: 3.6,
    build(): void {
      // Everything sinks a semitone at a time and does not come back.
      chord({ root: 98, ratios: [1, 1.06, 1.5], type: 'sawtooth', lowpass: 700, attack: 0.4, hold: 0.6, decay: 2.4, peak: 0.4 });
      voice({ from: 49, to: 33, type: 'sine', attack: 0.3, hold: 0.8, decay: 2.2, peak: 0.6 });
      noise({ colour: 'brown', from: 300, to: 90, q: 1.0, attack: 0.5, hold: 0.4, decay: 2.2, peak: 0.14 });
    },
  },
};
