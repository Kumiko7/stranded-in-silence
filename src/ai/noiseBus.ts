/**
 * The noise bus. See docs/ARCHITECTURE.md section 8.
 *
 * Every noisy action in the game pushes one event here; the enemy's hearing is
 * the only consumer. Propagation is DISTANCE ONLY - walls and doors never muffle
 * anything. Doors cost the enemy time, not hearing.
 *
 * Events live for exactly one simulation tick: the enemy reacts to them or they
 * are gone, so nothing has to age or expire.
 */
import type { NoiseSpec, PlayerConfig } from '@/config/types';

/** Every emitter kind. The string doubles as the key into `player.json -> noise`. */
export type NoiseKind =
  | 'walk'
  | 'sprint'
  | 'crouch'
  | 'doorOpen'
  | 'doorSlam'
  | 'chestOpen'
  | 'lockerEnter'
  | 'itemDrop'
  | 'voice'
  | 'injured';

export interface NoiseEvent {
  x: number;
  z: number;
  /** Metres at which the enemy may perceive it, before its own `rangeMultiplier`. */
  radius: number;
  loudness: number;
  kind: NoiseKind;
  /** Peer id of whoever made it, so the enemy can chase the right player. */
  sourceId: string;
}

export class NoiseBus {
  #events: NoiseEvent[] = [];

  emit(event: NoiseEvent): void {
    this.#events.push(event);
  }

  /** Everything emitted since the last `clear()`. */
  get events(): readonly NoiseEvent[] {
    return this.#events;
  }

  clear(): void {
    this.#events.length = 0;
  }
}

/** Looks an emitter's `{ radius, loudness }` out of `player.json -> noise`. */
export function noiseSpec(config: PlayerConfig, kind: NoiseKind): NoiseSpec {
  const spec = config.noise[kind];
  if (spec && typeof spec === 'object') return spec;
  console.warn(`[noise] player.json has no noise entry "${kind}"`);
  return { radius: 0, loudness: 0 };
}

/**
 * Seconds between footsteps for the movement the player is actually doing.
 * Sprinting is the loudest thing a player does without opening something.
 */
export function footstepInterval(config: PlayerConfig, sprinting: boolean, crouching: boolean): number {
  if (sprinting) return config.noise.footstepIntervalSprint;
  if (crouching) return config.noise.footstepIntervalCrouch;
  return config.noise.footstepIntervalWalk;
}

export function footstepKind(sprinting: boolean, crouching: boolean): NoiseKind {
  return sprinting ? 'sprint' : crouching ? 'crouch' : 'walk';
}
