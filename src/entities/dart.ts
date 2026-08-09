/**
 * The lobby dart minigame: flight, wind and scoring.
 *
 * Plain data in, plain data out - no THREE, no DOM - exactly as
 * `src/entities/projectile.ts` is, and for the same reason: every peer runs the
 * same numbers from the same release state, so a dart crosses the wire as a
 * handful of floats and its whole flight is re-derived on the other side.
 *
 * It is NOT the projectile module with different constants, and deliberately
 * not. A thrown flask is tested against the maze's walls and doors and has to
 * come to rest on a floor; a dart is thrown at one flat disc across an open
 * room, and the only questions worth asking are "did it get there" and "where
 * on it". Sharing the code would mean teaching `WallGrid` about a lobby that
 * has no cells.
 *
 * ## The wind
 *
 * The one thing here that is not honest physics. A hidden lateral acceleration,
 * drifting continuously, that never shows on screen: it is far too weak to make
 * you miss the board and quite strong enough to cost you the bull if you have
 * not been watching where your last three landed. Every peer that sees the
 * throw is handed the thrower's wind clock in the message, so the dart lands in
 * the same hole everywhere without the landing itself being replicated.
 */
import type { DartsConfig } from '@/config/types';

export interface Dart {
  readonly id: string;
  readonly ownerId: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Seconds flown. */
  age: number;
  /** The wind clock at release. `age` is added to it as the dart flies. */
  readonly windAt: number;
}

/** The board, in world space. Boards are vertical, so the normal is flat. */
export interface DartBoard {
  x: number;
  y: number;
  z: number;
  /** Unit normal in world XZ, pointing back at the thrower. */
  nx: number;
  nz: number;
  radius: number;
}

export interface DartWorld {
  config: DartsConfig;
  board: DartBoard;
  /**
   * The fence between the thrower and the board, as a distance along the
   * board's normal. A dart below `top` when it reaches that plane stops there.
   */
  fence: { distance: number; top: number };
  /** Anything below this has hit the ground. */
  floorY: number;
}

export type DartRing = 'miss' | 'single' | 'double' | 'treble' | 'outerBull' | 'innerBull';

/** Where a dart went into the board, in board-face metres from its centre. */
export interface DartHit {
  /** Across the face, positive toward the thrower's right. */
  u: number;
  /** Up the face. */
  v: number;
  sector: number;
  ring: DartRing;
  score: number;
}

export interface DartLanding {
  x: number;
  y: number;
  z: number;
  /** Set only when it went into the board. Everything else scores nothing. */
  hit: DartHit | null;
}

/** Substep length in metres. Well under the thinnest thing a dart can hit. */
const SUBSTEP = 0.06;

export function createDart(
  id: string,
  ownerId: string,
  from: { x: number; y: number; z: number },
  velocity: { x: number; y: number; z: number },
  windAt: number,
): Dart {
  return { id, ownerId, x: from.x, y: from.y, z: from.z, vx: velocity.x, vy: velocity.y, vz: velocity.z, age: 0, windAt };
}

/** The release velocity for a look direction. Speed is config, aim is the player. */
export function dartVelocity(config: DartsConfig, yaw: number, pitch: number): { x: number; y: number; z: number } {
  const flat = Math.cos(pitch);
  const { speed } = config.throw;
  return { x: -Math.sin(yaw) * flat * speed, y: Math.sin(pitch) * speed, z: -Math.cos(yaw) * flat * speed };
}

/**
 * The draught at `t` seconds on the wind clock, as `across` (in the board's own
 * plane, positive toward the thrower's right) and `up`.
 *
 * Two sines per axis whose periods do not divide each other, so it wanders
 * continuously and never repeats inside a session. Nothing seeds it and nothing
 * randomises it: it is a pure function of the clock, which is what lets a peer
 * re-derive somebody else's throw exactly.
 */
export function windAt(config: DartsConfig, t: number): { across: number; up: number } {
  const slow = config.wind.periodSeconds[0] ?? 17;
  const fast = config.wind.periodSeconds[1] ?? 6.5;
  const tau = Math.PI * 2;

  const across = Math.sin((t / slow) * tau) * 0.65 + Math.sin((t / fast) * tau + 1.7) * 0.35;
  const up = Math.sin((t / (slow * 0.73)) * tau + 0.9) * 0.6 + Math.sin((t / (fast * 1.31)) * tau) * 0.4;
  return { across: across * config.wind.strength, up: up * config.wind.strength * config.wind.verticalScale };
}

/** The board's "right", in world XZ, as the thrower sees it. */
function acrossAxis(board: DartBoard): { x: number; z: number } {
  return { x: board.nz, z: -board.nx };
}

/** How far in front of the board a point is, along the normal. */
function depth(board: DartBoard, x: number, z: number): number {
  return (x - board.x) * board.nx + (z - board.z) * board.nz;
}

/**
 * Advances one tick. Returns the landing on the tick it stops, and null before
 * that. A dart always stops somewhere - in the board, in the wall behind it, in
 * the fence, or in the floor - and the caller leaves it there to be looked at.
 */
export function stepDart(dart: Dart, dt: number, world: DartWorld): DartLanding | null {
  const speed = Math.hypot(dart.vx, dart.vy, dart.vz);
  const substeps = Math.max(1, Math.min(24, Math.ceil((speed * dt) / SUBSTEP)));
  const h = dt / substeps;

  const { board } = world;
  const across = acrossAxis(board);

  for (let i = 0; i < substeps; i++) {
    const wind = windAt(world.config, dart.windAt + dart.age);
    dart.age += h;

    dart.vy += (wind.up - world.config.throw.gravity) * h;
    dart.vx += wind.across * across.x * h;
    dart.vz += wind.across * across.z * h;

    const fromX = dart.x;
    const fromY = dart.y;
    const fromZ = dart.z;
    const toX = fromX + dart.vx * h;
    const toY = fromY + dart.vy * h;
    const toZ = fromZ + dart.vz * h;

    const wasIn = depth(board, fromX, fromZ);
    const nowIn = depth(board, toX, toZ);

    // The fence. Only a dart that reaches it too low is stopped by it.
    if (wasIn > world.fence.distance && nowIn <= world.fence.distance) {
      const t = (wasIn - world.fence.distance) / Math.max(1e-6, wasIn - nowIn);
      const y = fromY + (toY - fromY) * t;
      if (y < world.fence.top) {
        dart.x = fromX + (toX - fromX) * t;
        dart.y = y;
        dart.z = fromZ + (toZ - fromZ) * t;
        return { x: dart.x, y: dart.y, z: dart.z, hit: null };
      }
    }

    // The board plane, and the wall it is hung on: crossing it always stops the
    // dart, and whether it scored is only a question of where on the plane.
    if (wasIn > 0 && nowIn <= 0) {
      const t = wasIn / Math.max(1e-6, wasIn - nowIn);
      dart.x = fromX + (toX - fromX) * t;
      dart.y = fromY + (toY - fromY) * t;
      dart.z = fromZ + (toZ - fromZ) * t;

      const u = (dart.x - board.x) * across.x + (dart.z - board.z) * across.z;
      const v = dart.y - board.y;
      const hit = Math.hypot(u, v) <= board.radius ? scoreAt(world.config.board, u, v) : null;
      return { x: dart.x, y: dart.y, z: dart.z, hit };
    }

    dart.x = toX;
    dart.y = toY;
    dart.z = toZ;

    if (dart.y <= world.floorY + world.config.throw.radius) {
      dart.y = world.floorY + world.config.throw.radius;
      return { x: dart.x, y: dart.y, z: dart.z, hit: null };
    }
    // A dart that somehow never finds anything still has to stop being one.
    if (dart.age >= world.config.throw.maxFlightSeconds) {
      return { x: dart.x, y: dart.y, z: dart.z, hit: null };
    }
  }
  return null;
}

/**
 * Standard dart scoring for a point on the face, `u` across and `v` up, both in
 * metres from the centre.
 *
 * The rings and the bed order are `config/darts.json`, which is the same file
 * the board's texture is painted from - so what you see and what you are given
 * cannot come apart.
 */
export function scoreAt(board: DartsConfig['board'], u: number, v: number): DartHit {
  const r = Math.hypot(u, v) / Math.max(1e-6, board.radius);

  if (r <= board.innerBull) return { u, v, sector: 0, ring: 'innerBull', score: board.innerBullScore };
  if (r <= board.outerBull) return { u, v, sector: 0, ring: 'outerBull', score: board.outerBullScore };
  if (r > board.doubleOuter) return { u, v, sector: 0, ring: 'miss', score: 0 };

  const beds = board.sectors.length || 20;
  const step = (Math.PI * 2) / beds;
  // Clockwise from straight up, which is the middle of the first bed listed.
  const index = ((Math.round(Math.atan2(u, v) / step) % beds) + beds) % beds;
  const sector = board.sectors[index] ?? 0;

  if (r >= board.doubleInner) return { u, v, sector, ring: 'double', score: sector * 2 };
  if (r >= board.trebleInner && r <= board.trebleOuter) return { u, v, sector, ring: 'treble', score: sector * 3 };
  return { u, v, sector, ring: 'single', score: sector };
}
