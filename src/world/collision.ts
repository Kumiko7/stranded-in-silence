/**
 * Collision. 2D circle-vs-shape on the floor plane.
 *
 * There is no jumping and no vertical movement, so a full physics engine would
 * add a large dependency and a determinism problem to solve what fits here.
 * See docs/ARCHITECTURE.md section 10.
 *
 * Colliders are bucketed by grid cell so a move only tests nearby geometry.
 */
import type { Collider } from '@art/lib/contract';

export interface WorldCollider {
  kind: 'box' | 'circle';
  x: number;
  z: number;
  hx: number;
  hz: number;
  radius: number;
  rotationY: number;
  /** Doors flip this as they swing. Disabled colliders are skipped, not removed. */
  enabled: boolean;
}

export class CollisionWorld {
  #buckets = new Map<string, WorldCollider[]>();
  readonly #cellSize: number;

  constructor(cellSize: number) {
    this.#cellSize = cellSize;
  }

  /** Adds room-local colliders, offset into world space. */
  add(colliders: readonly Collider[], originX: number, originZ: number): WorldCollider[] {
    return colliders.map((collider) => {
      const world: WorldCollider =
        collider.kind === 'box'
          ? {
              kind: 'box',
              x: collider.center[0] + originX,
              z: collider.center[1] + originZ,
              hx: collider.halfExtents[0],
              hz: collider.halfExtents[1],
              radius: 0,
              rotationY: collider.rotationY ?? 0,
              enabled: true,
            }
          : {
              kind: 'circle',
              x: collider.center[0] + originX,
              z: collider.center[1] + originZ,
              hx: 0,
              hz: 0,
              radius: collider.radius,
              rotationY: 0,
              enabled: true,
            };
      this.#bucketFor(world.x, world.z).push(world);
      return world;
    });
  }

  #bucketFor(x: number, z: number): WorldCollider[] {
    const key = `${Math.floor(x / this.#cellSize)},${Math.floor(z / this.#cellSize)}`;
    let bucket = this.#buckets.get(key);
    if (!bucket) {
      bucket = [];
      this.#buckets.set(key, bucket);
    }
    return bucket;
  }

  clear(): void {
    this.#buckets.clear();
  }

  /**
   * Line of sight between two points. Walls and CLOSED doors block it - a door
   * disables its collider as it swings, so an opening door reveals you.
   *
   * Sampled rather than swept: at `step` well under the thinnest wall it cannot
   * miss one, and it stays a handful of point tests per target per tick.
   */
  segmentClear(x0: number, z0: number, x1: number, z1: number, step = 0.25): boolean {
    const distance = Math.hypot(x1 - x0, z1 - z0);
    const samples = Math.ceil(distance / step);
    for (let i = 1; i < samples; i++) {
      const t = i / samples;
      if (this.contains(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false;
    }
    return true;
  }

  /** Whether a point is inside any enabled collider. */
  contains(x: number, z: number): boolean {
    const cx = Math.floor(x / this.#cellSize);
    const cz = Math.floor(z / this.#cellSize);

    for (let gz = cz - 1; gz <= cz + 1; gz++) {
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        const bucket = this.#buckets.get(`${gx},${gz}`);
        if (!bucket) continue;
        for (const collider of bucket) {
          if (!collider.enabled) continue;
          // A hair of radius, because the push-out tests treat "exactly touching"
          // as clear and a zero radius would never register a hit at all.
          const hit = collider.kind === 'box'
            ? pushOutBox(x, z, 1e-3, collider)
            : pushOutCircle(x, z, 1e-3, collider);
          if (hit) return true;
        }
      }
    }
    return false;
  }

  /**
   * Pushes a circle out of anything it overlaps. Called after integration, so
   * sliding along walls falls out naturally rather than needing a special case.
   */
  resolve(x: number, z: number, radius: number): { x: number; z: number } {
    const cx = Math.floor(x / this.#cellSize);
    const cz = Math.floor(z / this.#cellSize);
    let px = x;
    let pz = z;

    // Two passes so a corner (two contacts at once) settles instead of jittering.
    for (let pass = 0; pass < 2; pass++) {
      for (let gz = cz - 1; gz <= cz + 1; gz++) {
        for (let gx = cx - 1; gx <= cx + 1; gx++) {
          const bucket = this.#buckets.get(`${gx},${gz}`);
          if (!bucket) continue;
          for (const collider of bucket) {
            if (!collider.enabled) continue;
            const pushed = collider.kind === 'box'
              ? pushOutBox(px, pz, radius, collider)
              : pushOutCircle(px, pz, radius, collider);
            if (pushed) {
              px = pushed.x;
              pz = pushed.z;
            }
          }
        }
      }
    }
    return { x: px, z: pz };
  }
}

function pushOutBox(px: number, pz: number, radius: number, box: WorldCollider): { x: number; z: number } | null {
  const cos = Math.cos(box.rotationY);
  const sin = Math.sin(box.rotationY);
  const dx = px - box.x;
  const dz = pz - box.z;

  // Into box-local space (rotate by -rotationY).
  const lx = dx * cos + dz * sin;
  const lz = -dx * sin + dz * cos;

  const qx = Math.max(-box.hx, Math.min(box.hx, lx));
  const qz = Math.max(-box.hz, Math.min(box.hz, lz));

  let nx = lx - qx;
  let nz = lz - qz;
  let distance = Math.hypot(nx, nz);

  if (distance >= radius) return null;

  if (distance > 1e-6) {
    nx /= distance;
    nz /= distance;
  } else {
    // Centre is inside: escape along the shallowest axis.
    const penX = box.hx - Math.abs(lx);
    const penZ = box.hz - Math.abs(lz);
    if (penX < penZ) {
      nx = lx < 0 ? -1 : 1;
      nz = 0;
      distance = -penX;
    } else {
      nx = 0;
      nz = lz < 0 ? -1 : 1;
      distance = -penZ;
    }
  }

  const push = radius - distance;
  return {
    x: px + (nx * cos - nz * sin) * push,
    z: pz + (nx * sin + nz * cos) * push,
  };
}

function pushOutCircle(px: number, pz: number, radius: number, circle: WorldCollider): { x: number; z: number } | null {
  const dx = px - circle.x;
  const dz = pz - circle.z;
  const distance = Math.hypot(dx, dz);
  const minimum = radius + circle.radius;
  if (distance >= minimum) return null;

  if (distance < 1e-6) return { x: px + minimum, z: pz };
  const push = (minimum - distance) / distance;
  return { x: px + dx * push, z: pz + dz * push };
}
