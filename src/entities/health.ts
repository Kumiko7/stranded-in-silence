/**
 * The health ladder: healthy -> injured -> downed -> dead.
 *
 * Nobody bleeds out. Being downed is not a timer, it is a problem for the team
 * (docs/GAMEPLAY.md section 2), so the only things with clocks here are the
 * invulnerability windows that stop one attack chaining into the next.
 */
import type { HealthState, PlayerConfig } from '@/config/types';

export interface Health {
  state: HealthState;
  /** Seconds of grace after being hit or revived. */
  invulnerableFor: number;
  /** 0..1 while a teammate is holding E on a downed player. */
  reviveProgress: number;
}

export function createHealth(): Health {
  return { state: 'healthy', invulnerableFor: 0, reviveProgress: 0 };
}

export function tickHealth(health: Health, dt: number): void {
  health.invulnerableFor = Math.max(0, health.invulnerableFor - dt);
}

/**
 * Applies one hit. Returns the new state, or null when the hit does nothing -
 * a downed player cannot be hurt further, and grace windows swallow the rest.
 */
export function applyHit(
  health: Health,
  results: { healthyResult: HealthState; injuredResult: HealthState },
  config: PlayerConfig,
): HealthState | null {
  if (health.invulnerableFor > 0) return null;
  if (health.state === 'downed' || health.state === 'dead') return null;

  health.state = health.state === 'healthy' ? results.healthyResult : results.injuredResult;
  health.invulnerableFor = config.health.invulnerableSecondsAfterHit;
  health.reviveProgress = 0;
  return health.state;
}

/**
 * Medicine. Walks one rung back UP the ladder, and only from injured: a downed
 * player is a revive, which is a teammate's time rather than an item.
 * Returns the new state, or null when there was nothing to treat.
 */
export function applyHeal(health: Health, toState: HealthState): HealthState | null {
  if (health.state !== 'injured') return null;
  health.state = toState;
  return health.state;
}

/**
 * Giving up. The only route from `downed` to `dead`, and it is the player's own
 * hand on it - nothing in this game kills you on a clock. Returns the new state,
 * or null when there was nothing to give up on.
 */
export function applyGiveUp(health: Health): HealthState | null {
  if (health.state !== 'downed') return null;
  health.state = 'dead';
  health.reviveProgress = 0;
  return health.state;
}

/** Revived players come back injured, not healthy - `health.revivedToState`. */
export function applyRevive(health: Health, config: PlayerConfig): HealthState {
  health.state = config.health.revivedToState;
  health.invulnerableFor = config.health.invulnerableSecondsAfterRevive;
  health.reviveProgress = 0;
  return health.state;
}

export function isDown(state: HealthState): boolean {
  return state === 'downed' || state === 'dead';
}
