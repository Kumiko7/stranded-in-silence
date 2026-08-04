/**
 * Thrown items: one ballistic arc, integrated the same way twice.
 *
 * The preview you aim with and the object that actually flies run through
 * `stepProjectile` identically, so the line on screen is not an approximation of
 * the throw - it IS the throw. Every peer integrates the same numbers from the
 * same release state, which is why a throw crosses the wire as six floats and
 * nothing else has to be replicated (docs/systems/NETWORKING.md).
 *
 * Plain data in, plain data out: no THREE, no DOM.
 *
 * What stops a throw is deliberately NOT the collision world. Collision is one
 * flat 2D set - a wall and a side table are the same shape to it - so a flask
 * would die on furniture it visibly sailed over. A throw is tested against the
 * maze's own walls and doors (`WallGrid`) plus the bodies in the room. Hitting
 * either kills its horizontal speed; it then falls, and it always LANDS on the
 * floor. Nothing ever comes to rest in mid-air.
 */
import type { Side } from '@art/lib/contract';
import type { ThrowConfig } from '@/config/types';
import type { Edge, WallGrid } from '@/world/wallGrid';

export interface Projectile {
  readonly id: string;
  readonly itemId: string;
  /** Peer who threw it, so noise it makes is credited to the right roster line. */
  readonly ownerId: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
}

/** A player or the hunter, as far as a thrown object is concerned. */
export interface ProjectileBody {
  id: string;
  x: number;
  z: number;
  radius: number;
  height: number;
}

export interface ProjectileWorld {
  config: ThrowConfig;
  ceilingHeight: number;
  walls: WallGrid;
  /** A door mid-swing still blocks, exactly as it does for a player. */
  doorOpen(doorId: string): boolean;
  bodies: readonly ProjectileBody[];
}

export interface Landing {
  x: number;
  y: number;
  z: number;
  /** Who it clipped on the way down, or null. */
  hitId: string | null;
}

/** Substep length in metres. Well under the thinnest thing a throw can hit. */
const SUBSTEP = 0.09;
/** Pulled back off a surface by this much, so nothing rests inside geometry. */
const SKIN = 0.02;

export function createProjectile(
  id: string,
  itemId: string,
  ownerId: string,
  from: { x: number; y: number; z: number },
  velocity: { x: number; y: number; z: number },
): Projectile {
  return { id, itemId, ownerId, x: from.x, y: from.y, z: from.z, vx: velocity.x, vy: velocity.y, vz: velocity.z, age: 0 };
}

/** The release velocity for a look direction. Speed is config, aim is the player. */
export function throwVelocity(config: ThrowConfig, yaw: number, pitch: number): { x: number; y: number; z: number } {
  const flat = Math.cos(pitch);
  return {
    x: -Math.sin(yaw) * flat * config.speed,
    y: Math.sin(pitch) * config.speed,
    z: -Math.cos(yaw) * flat * config.speed,
  };
}

/**
 * Advances one simulation tick. Returns the landing on the tick it comes to
 * rest, and null on every tick before that.
 */
export function stepProjectile(projectile: Projectile, dt: number, world: ProjectileWorld): Landing | null {
  const speed = Math.hypot(projectile.vx, projectile.vy, projectile.vz);
  const substeps = Math.max(1, Math.min(24, Math.ceil((speed * dt) / SUBSTEP)));
  const h = dt / substeps;
  let hitId: string | null = null;

  for (let i = 0; i < substeps; i++) {
    projectile.age += h;
    const landed = advance(projectile, h, world);
    if (landed.hitId) hitId = landed.hitId;
    if (landed.done) return { x: projectile.x, y: projectile.y, z: projectile.z, hitId };

    // A throw that somehow never finds the floor still has to stop being a
    // problem: it drops where it is rather than flying for the rest of the run.
    if (projectile.age >= world.config.maxFlightSeconds) {
      projectile.y = world.config.radius;
      return { x: projectile.x, y: projectile.y, z: projectile.z, hitId };
    }
  }
  return null;
}

function advance(p: Projectile, h: number, world: ProjectileWorld): { done: boolean; hitId: string | null } {
  const { config } = world;
  p.vy -= config.gravity * h;

  const fromX = p.x;
  const fromZ = p.z;
  let toX = p.x + p.vx * h;
  let toZ = p.z + p.vz * h;
  let toY = p.y + p.vy * h;

  const ceiling = world.ceilingHeight - config.ceilingClearance;
  if (toY > ceiling) {
    toY = ceiling;
    p.vy = -Math.abs(p.vy) * config.ceilingBounce;
  }

  let hitId: string | null = null;

  const wall = crossing(world, fromX, fromZ, toX, toZ);
  if (wall) {
    // Stopped dead against the wall plane; gravity takes it from here.
    toX = fromX + (wall.x - fromX) * (1 - SKIN);
    toZ = fromZ + (wall.z - fromZ) * (1 - SKIN);
    p.vx = 0;
    p.vz = 0;
  } else {
    const body = bodyAt(world, toX, toY, toZ, p);
    if (body) {
      hitId = body.id;
      toX = fromX;
      toZ = fromZ;
      p.vx = 0;
      p.vz = 0;
    }
  }

  p.x = toX;
  p.z = toZ;
  p.y = toY;

  if (p.y <= config.radius) {
    p.y = config.radius;
    return { done: true, hitId };
  }
  return { done: false, hitId };
}

/** Where the step leaves the cell it started in through something solid. */
function crossing(
  world: ProjectileWorld,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): { x: number; z: number } | null {
  const { walls } = world;
  const cx0 = walls.cellIndex(x0);
  const cz0 = walls.cellIndex(z0);
  const cx1 = walls.cellIndex(x1);
  const cz1 = walls.cellIndex(z1);
  if (cx0 === cx1 && cz0 === cz1) return null;

  // A substep is 9 cm and a cell is metres across, so at most one boundary per
  // axis is crossed - but a corner can cross one of each, in some order.
  const events: { t: number; axis: 'x' | 'z'; side: Side }[] = [];
  if (cx1 !== cx0) {
    const plane = walls.boundary(Math.min(cx0, cx1));
    events.push({ t: (plane - x0) / (x1 - x0), axis: 'x', side: cx1 > cx0 ? 'east' : 'west' });
  }
  if (cz1 !== cz0) {
    const plane = walls.boundary(Math.min(cz0, cz1));
    events.push({ t: (plane - z0) / (z1 - z0), axis: 'z', side: cz1 > cz0 ? 'south' : 'north' });
  }
  events.sort((a, b) => a.t - b.t);

  let cx = cx0;
  let cz = cz0;
  for (const event of events) {
    if (!passable(world, walls.edge(cx, cz, event.side))) {
      return { x: x0 + (x1 - x0) * event.t, z: z0 + (z1 - z0) * event.t };
    }
    if (event.axis === 'x') cx = cx1;
    else cz = cz1;
  }
  return null;
}

function passable(world: ProjectileWorld, edge: Edge): boolean {
  if (edge.kind === 'open') return true;
  if (edge.kind === 'solid') return false;
  return world.doorOpen(edge.doorId);
}

function bodyAt(world: ProjectileWorld, x: number, y: number, z: number, p: Projectile): ProjectileBody | null {
  for (const body of world.bodies) {
    // You cannot hit yourself with your own throw, and a throw that clears
    // someone's head passes over them.
    if (body.id === p.ownerId || y > body.height) continue;
    if (Math.hypot(body.x - x, body.z - z) <= body.radius + world.config.radius) return body;
  }
  return null;
}

/**
 * The aim line: the same integration run forward from a hypothetical release,
 * flattened into `[x, y, z, ...]` for the preview art.
 */
export function sampleArc(
  ownerId: string,
  from: { x: number; y: number; z: number },
  velocity: { x: number; y: number; z: number },
  world: ProjectileWorld,
): { points: number[]; landing: Landing } {
  const ghost = createProjectile('aim', '', ownerId, from, velocity);
  const points: number[] = [from.x, from.y, from.z];
  const { sampleSeconds, maxPoints } = world.config.aim;

  for (let i = 0; i < maxPoints; i++) {
    const landing = stepProjectile(ghost, sampleSeconds, world);
    points.push(ghost.x, ghost.y, ghost.z);
    if (landing) return { points, landing };
  }
  return { points, landing: { x: ghost.x, y: ghost.y, z: ghost.z, hitId: null } };
}
