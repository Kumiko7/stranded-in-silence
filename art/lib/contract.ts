/**
 * THE ART CONTRACT.
 *
 * The only thing `src/` and `art/` are allowed to share. Art never imports
 * anything from `src/` - everything it needs arrives through a build context.
 *
 * Authoring reference: docs/art/ROOM_FORMAT.md and docs/art/SHARED_ART.md.
 */
import type * as THREE from 'three';

export type Side = 'north' | 'east' | 'south' | 'west';
export const SIDES: readonly Side[] = ['north', 'east', 'south', 'west'];

/** Grid cell offset, relative to the room's own origin cell. */
export type Cell = readonly [number, number];

/** `'none'` means solid wall. Anything else means cut an opening. */
export type DoorState = 'none' | 'open' | 'locked';

/** Key into `RoomBuildContext.doors`: `"gx,gy:side"`. Build with `doorKey()`. */
export function doorKey(cell: Cell, side: Side): string {
  return `${cell[0]},${cell[1]}:${side}`;
}

export interface Anchor {
  readonly position: readonly [number, number, number];
  readonly rotationY?: number;
}

export interface RoomAnchors {
  readonly chest?: readonly Anchor[];
  readonly locker?: readonly Anchor[];
  readonly itemSpawn?: readonly Anchor[];
  readonly playerSpawn?: readonly Anchor[];
  readonly enemySpawn?: readonly Anchor[];
  readonly patrolPoint?: readonly Anchor[];
  readonly trap?: readonly Anchor[];
  readonly treasure?: readonly Anchor[];
}

/** 2D collision on the floor plane. There is no jumping - you can walk into it or you cannot. */
export type Collider =
  | { readonly kind: 'box'; readonly center: readonly [number, number]; readonly halfExtents: readonly [number, number]; readonly rotationY?: number }
  | { readonly kind: 'circle'; readonly center: readonly [number, number]; readonly radius: number };

/** World dimensions, passed in so art never has to import config. */
export interface RoomDims {
  readonly cellSize: number;
  readonly ceilingHeight: number;
  readonly wallThickness: number;
  readonly doorWidth: number;
  readonly doorHeight: number;
}

export interface MaterialLibrary {
  /** Cached. Never create materials per room instance - duplicate rooms would blow the draw-call budget. */
  get(name: string): THREE.Material;
  dispose(): void;
}

export interface BuiltPiece {
  object: THREE.Object3D;
  colliders: Collider[];
  lights?: THREE.Light[];
}

export interface BuiltRoom extends BuiltPiece {
  dispose?(): void;
}

/** Pack-specific shell + furniture builders, shared by every room in a pack. */
export interface PackKit {
  /** Floor, ceiling and walls for a footprint, with openings cut wherever `ctx.doors` says so. */
  shell(ctx: RoomBuildContext, footprint: readonly Cell[]): BuiltPiece;
}

export interface RoomBuildContext {
  /** Which of this room's `doorWalls` actually became openings this run. Keyed by `doorKey()`. */
  readonly doors: Readonly<Record<string, DoorState>>;
  readonly kit: PackKit;
  readonly materials: MaterialLibrary;
  /** Seeded. NEVER use Math.random() in art - peers would desync. */
  readonly rng: () => number;
  readonly dims: RoomDims;
  readonly roomIndex: number;
  readonly lightBudget: number;
}

export interface RoomBlueprint {
  /** `<packId>.<roomName>`. Never rename a shipped id. */
  readonly id: string;
  readonly nameKey?: string;
  /** Cells occupied, must include [0,0]. Most rooms are [[0,0]]. */
  readonly footprint: readonly Cell[];
  /** Every wall edge ALLOWED to become a door. The generator picks a subset. */
  readonly doorWalls: readonly { readonly cell: Cell; readonly side: Side }[];
  readonly anchors: RoomAnchors;
  readonly weight?: number;
  readonly tags?: readonly string[];
  readonly maxPerMap?: number;
  build(ctx: RoomBuildContext): BuiltRoom;
}

/* --- shared art (doors, chests, characters, items) ------------------------ */

export interface ArtBuildContext {
  readonly materials: MaterialLibrary;
  readonly rng: () => number;
  readonly dims: RoomDims;
}

export interface BuiltArt extends BuiltPiece {
  /** Named parts logic drives. Required parts per artId are in docs/art/SHARED_ART.md. */
  parts: Record<string, THREE.Object3D>;
  dispose?(): void;
}

export type ArtBuilder = (ctx: ArtBuildContext) => BuiltArt;
export type ArtRegistry = Readonly<Record<string, ArtBuilder>>;

export interface ArtPack {
  readonly id: string;
  readonly nameKey?: string;
  readonly rooms: readonly RoomBlueprint[];
  createMaterials(): MaterialLibrary;
  createKit(): PackKit;
  /** Themed replacements for shared art. Must satisfy the same contract. */
  readonly overrides?: ArtRegistry;
}
