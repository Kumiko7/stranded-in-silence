/**
 * The health ladder: healthy -> injured -> downed -> dead.
 *
 * Being downed is a problem for the team first and a clock second: the floor
 * has `health.downedBleedOutSeconds` on it, and that clock STOPS the moment
 * somebody has their hands on you (docs/GAMEPLAY.md section 2). A revive that
 * started in time is never lost to it, and a team that cannot come is not made
 * to wait out a run they have already lost.
 */
import type { HealthState, PlayerConfig } from '@/config/types';

export interface Health {
  state: HealthState;
  /** Seconds of grace after being hit or revived. */
  invulnerableFor: number;
  /** 0..1 while a teammate is holding E on a downed player. */
  reviveProgress: number;
  /** Seconds left on the floor. Only ever meaningful while `downed`. */
  bleedOutFor: number;
}

export function createHealth(): Health {
  return { state: 'healthy', invulnerableFor: 0, reviveProgress: 0, bleedOutFor: 0 };
}

export function tickHealth(health: Health, dt: number): void {
  health.invulnerableFor = Math.max(0, health.invulnerableFor - dt);
}

/**
 * The clock on the floor. Returns the new state when it runs out, and null
 * every other tick - including every tick somebody is working on you, which is
 * what `paused` is: a revive is time, and time you are not losing.
 */
export function tickBleedOut(
  health: Health,
  dt: number,
  config: PlayerConfig,
  paused: boolean,
): HealthState | null {
  if (health.state !== 'downed' || !config.health.downedBleedOut) return null;
  if (paused) return null;

  health.bleedOutFor = Math.max(0, health.bleedOutFor - dt);
  if (health.bleedOutFor > 0) return null;

  health.state = 'dead';
  health.reviveProgress = 0;
  return health.state;
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
  // Wound up here rather than on entering `downed` from anywhere, because being
  // put on the floor is the only way onto it.
  if (health.state === 'downed') health.bleedOutFor = config.health.downedBleedOutSeconds;
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
 * Giving up. The player's own hand on it, and the one route off the floor that
 * does not wait for either a teammate or the clock. Returns the new state, or
 * null when there was nothing to give up on.
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
  health.bleedOutFor = 0;
  return health.state;
}

export function isDown(state: HealthState): boolean {
  return state === 'downed' || state === 'dead';
}
