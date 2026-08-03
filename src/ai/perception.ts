/**
 * What the enemy knows. See docs/systems/AI.md.
 *
 * Two senses, deliberately asymmetric:
 *   sight   - a cone, needs line of sight, shortened by crouching and darkness,
 *             and takes a moment to acquire and a while to lose.
 *   hearing - the noise bus, distance only, no occlusion, and it gives the enemy
 *             a jittered POSITION rather than a target. It gets a direction, not
 *             a fix, which is what makes throwing noise around work.
 */
import type { EnemyArchetype } from '@/config/types';
import type { CollisionWorld } from '@/world/collision';
import type { NoiseEvent } from './noiseBus';
import type { RoomGraph } from './roomGraph';

/** Anything the enemy can perceive and chase. Players, local or remote. */
export interface PerceptionTarget {
  id: string;
  x: number;
  z: number;
  crouching: boolean;
  /** Hidden players are never seen, however brightly lit the room is. */
  hidden: boolean;
  downed: boolean;
  /** Rooms light themselves; a target in an unlit room is seen from closer. */
  inDarkness: boolean;
}

export interface SightResult {
  target: PerceptionTarget;
  distance: number;
}

/**
 * The closest target the enemy can currently see. `eyeYaw` is the enemy's facing;
 * the cone is symmetric around it.
 */
export function look(
  enemy: { x: number; z: number; yaw: number },
  targets: readonly PerceptionTarget[],
  config: EnemyArchetype,
  collision: CollisionWorld,
): SightResult | null {
  const { sight } = config;
  let best: SightResult | null = null;

  for (const target of targets) {
    if (target.hidden) continue;
    if (target.downed && config.attack.ignoresDownedPlayers) continue;

    let range = sight.range;
    if (target.crouching) range *= sight.crouchedTargetRangeMultiplier;
    if (target.inDarkness) range *= sight.darknessRangeMultiplier;

    if (!inSight(enemy, target.x, target.z, range, config, collision)) continue;

    const distance = Math.hypot(target.x - enemy.x, target.z - enemy.z);
    if (!best || distance < best.distance) best = { target, distance };
  }
  return best;
}

/**
 * Whether a bare point is in view at full sight range. Used for things the enemy
 * watches happen rather than watches move - a locker door closing on someone.
 */
export function canSeePoint(
  enemy: { x: number; z: number; yaw: number },
  x: number,
  z: number,
  config: EnemyArchetype,
  collision: CollisionWorld,
): boolean {
  return inSight(enemy, x, z, config.sight.range, config, collision);
}

function inSight(
  enemy: { x: number; z: number; yaw: number },
  x: number,
  z: number,
  range: number,
  config: EnemyArchetype,
  collision: CollisionWorld,
): boolean {
  const dx = x - enemy.x;
  const dz = z - enemy.z;
  const distance = Math.hypot(dx, dz);
  if (distance > range) return false;

  // Facing is -Z at yaw 0, matching every other transform in the game.
  const facingX = -Math.sin(enemy.yaw);
  const facingZ = -Math.cos(enemy.yaw);
  const dot = (dx * facingX + dz * facingZ) / Math.max(1e-4, distance);
  if (Math.acos(Math.max(-1, Math.min(1, dot))) > ((config.sight.fovDegrees / 2) * Math.PI) / 180) return false;

  return !config.sight.requiresLineOfSight || collision.segmentClear(enemy.x, enemy.z, x, z);
}

/**
 * The loudest noise event the enemy can hear this tick, with its position
 * already jittered - the enemy never learns exactly where you are from sound.
 */
export function listen(
  enemy: { x: number; z: number },
  events: readonly NoiseEvent[],
  config: EnemyArchetype,
  graph: RoomGraph,
  rng: () => number,
): { x: number; z: number; sourceId: string; loudness: number } | null {
  const { hearing } = config;
  let best: NoiseEvent | null = null;

  for (const event of events) {
    if (event.loudness * hearing.hearingMultiplier < hearing.threshold) continue;
    if (Math.hypot(event.x - enemy.x, event.z - enemy.z) > event.radius * hearing.rangeMultiplier) continue;

    // Voice is the one exception to distance-only: players hear each other far
    // further than the enemy does, so talking stays worth the risk.
    if (event.kind === 'voice') {
      const rooms = graph.roomDistance(graph.cellAt(enemy.x, enemy.z), graph.cellAt(event.x, event.z));
      if (rooms > hearing.voiceRoomLimit) continue;
    }

    if (!best || event.loudness > best.loudness) best = event;
  }
  if (!best) return null;

  const jitter = hearing.positionJitterMetres;
  return {
    x: best.x + (rng() * 2 - 1) * jitter,
    z: best.z + (rng() * 2 - 1) * jitter,
    sourceId: best.sourceId,
    loudness: best.loudness,
  };
}
