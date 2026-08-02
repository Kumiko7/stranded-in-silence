/**
 * Chests and lockers.
 *
 * Both are pure state here; the art is driven through its named parts (`lid`,
 * `doorLeft`/`doorRight`) exactly like doors, so a themed chest needs no code.
 *
 * A chest is slow and loud to open and holds the keys. A locker hides you from
 * sight - not from a searching enemy, once there is one.
 */
import type * as THREE from 'three';

export interface Chest {
  readonly id: string;
  readonly object: THREE.Object3D;
  readonly lid: THREE.Object3D;
  readonly contentsAnchor: THREE.Object3D;
  readonly x: number;
  readonly z: number;
  /** Item id revealed on opening. Cleared once it has been dropped into the world. */
  contents: string | null;
  opened: boolean;
  /** 0 = shut, 1 = lid fully back. */
  progress: number;
}

export interface Locker {
  readonly id: string;
  readonly object: THREE.Object3D;
  readonly doorLeft: THREE.Object3D;
  readonly doorRight: THREE.Object3D;
  /** World-space eye position for a player hidden inside. */
  readonly inside: { x: number; y: number; z: number };
  readonly x: number;
  readonly z: number;
  /** Facing, so a hidden player looks out through the slats. */
  readonly yaw: number;
  occupied: boolean;
  /** 0 = shut, 1 = doors fully open. */
  progress: number;
}

const LID_ANGLE = Math.PI * 0.62;
const LOCKER_DOOR_ANGLE = Math.PI * 0.55;

export function updateChests(chests: readonly Chest[], dt: number, openSeconds: number): void {
  for (const chest of chests) {
    const target = chest.opened ? 1 : 0;
    if (chest.progress === target) continue;
    chest.progress = Math.min(1, chest.progress + dt / Math.max(0.01, openSeconds));
    chest.lid.rotation.x = LID_ANGLE * easeOut(chest.progress);
  }
}

export function updateLockers(lockers: readonly Locker[], dt: number, enterSeconds: number, exitSeconds: number): void {
  for (const locker of lockers) {
    const target = locker.occupied ? 1 : 0;
    if (locker.progress === target) continue;
    const rate = dt / Math.max(0.01, locker.occupied ? enterSeconds : exitSeconds);
    locker.progress = locker.occupied
      ? Math.min(1, locker.progress + rate)
      : Math.max(0, locker.progress - rate);

    const swing = LOCKER_DOOR_ANGLE * easeOut(locker.progress);
    locker.doorLeft.rotation.y = swing;
    locker.doorRight.rotation.y = -swing;
  }
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}
