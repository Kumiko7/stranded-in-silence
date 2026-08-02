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
  /** A locked door cannot be opened until a key is spent on it. */
  locked: boolean;
  open: boolean;
  /** 0 = closed, 1 = fully open. Animated toward `open`. */
  progress: number;
  collider: WorldCollider | null;
}

const OPEN_ANGLE = Math.PI / 2;

export function toggleDoor(door: Door, open?: boolean): void {
  if (door.locked) return;
  door.open = open ?? !door.open;
}

/** Spends a key on a door. The key itself is consumed by the caller. */
export function unlockDoor(door: Door): void {
  door.locked = false;
  door.lockIndicator.visible = false;
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
