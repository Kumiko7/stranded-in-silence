/**
 * Doors: the game's core tactical object.
 *
 * Logic owns the state and drives the art's `hinge` and `lockIndicator` parts. It
 * never inspects what the door looks like, which is why a themed door drops in
 * without code changes.
 */
import type * as THREE from 'three';
import type { WorldCollider } from './collision';

export type DoorId = string;

export interface Door {
  readonly id: DoorId;
  readonly isExit: boolean;
  readonly object: THREE.Object3D;
  readonly hinge: THREE.Object3D;
  readonly lockIndicator: THREE.Object3D;
  readonly x: number;
  readonly z: number;
  /** Facing, so anything hung on the door (a barricade) lines up with the leaf. */
  readonly rotationY: number;
  /** A locked door cannot be opened until a key is spent on it. */
  locked: boolean;
  open: boolean;
  /** 0 = closed, 1 = fully open. Animated toward `open`. */
  progress: number;
  collider: WorldCollider | null;
  /**
   * Extra seconds ANYONE - player or hunter - must spend to get this door open,
   * from a barricade wedged against it. 0 when the door is clear. A barricade is
   * destroyed by whoever forces it, so this only ever goes back to 0 once.
   */
  barricadeSeconds: number;
}

export function isBarricaded(door: Door): boolean {
  return door.barricadeSeconds > 0;
}

const OPEN_ANGLE = Math.PI / 2;

export function toggleDoor(door: Door, open?: boolean): void {
  if (door.locked || isBarricaded(door)) return;
  door.open = open ?? !door.open;
}

/** Spends a key on a door. The key itself is consumed by the caller. */
export function unlockDoor(door: Door): void {
  door.locked = false;
  door.lockIndicator.visible = false;
}

/**
 * Wedges a door shut, or tears the wedge off again with `seconds` of 0. The art
 * is the caller's: it hangs a `door.barricade` piece on the door and takes it
 * down again, exactly as it does for any other decor.
 */
export function setBarricade(door: Door, seconds: number): void {
  door.barricadeSeconds = Math.max(0, seconds);
}

export function updateDoors(doors: readonly Door[], dt: number, openSeconds: number, closeSeconds: number): void {
  for (const door of doors) {
    const target = door.open ? 1 : 0;
    if (door.progress !== target) {
      const rate = dt / Math.max(0.01, door.open ? openSeconds : closeSeconds);
      door.progress = door.open
        ? Math.min(1, door.progress + rate)
        : Math.max(0, door.progress - rate);
      door.hinge.rotation.y = -OPEN_ANGLE * easeInOut(door.progress);
    }
    // Half-open still blocks, so you cannot squeeze through a door mid-swing.
    if (door.collider) door.collider.enabled = door.progress < 0.5;
  }
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
}
