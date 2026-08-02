/**
 * Items and the two-hand inventory.
 *
 * Two hands, two slots: left is used with LMB, right with RMB. Picking up a
 * third item drops whatever was in the hand it goes into - there is no bag.
 *
 * Everything about an item comes from config/items.json. Logic only ever
 * branches on `behaviour`, so adding an item is config + one behaviour + art.
 */
import type * as THREE from 'three';
import type { ItemDef, ItemsConfig } from '@/config/types';

export type Hand = 'left' | 'right';
export const HANDS: readonly Hand[] = ['left', 'right'];

/** An item lying in the world, waiting to be picked up. */
export interface WorldItem {
  readonly id: string;
  readonly itemId: string;
  readonly object: THREE.Object3D;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Inventory {
  left: string | null;
  right: string | null;
}

export function createInventory(): Inventory {
  return { left: null, right: null };
}

export function itemDef(config: ItemsConfig, itemId: string | null): ItemDef | null {
  return itemId ? config.items[itemId] ?? null : null;
}

/** Number param off an item's `params` block, with the config value as the only source. */
export function itemParam(def: ItemDef, name: string, fallback: number): number {
  const value = def.params[name];
  return typeof value === 'number' ? value : fallback;
}

/**
 * Puts an item in a hand, preferring an empty one. Returns the item that was
 * displaced, which the caller drops into the world.
 */
export function takeItem(inventory: Inventory, itemId: string): { hand: Hand; displaced: string | null } {
  const hand: Hand = inventory.left === null ? 'left' : inventory.right === null ? 'right' : 'left';
  const displaced = inventory[hand];
  inventory[hand] = itemId;
  return { hand, displaced };
}

export function dropFrom(inventory: Inventory, hand: Hand): string | null {
  const itemId = inventory[hand];
  inventory[hand] = null;
  return itemId;
}

/** The first hand holding `itemId`, or null. Used by "press E and the key is spent". */
export function handHolding(inventory: Inventory, itemId: string): Hand | null {
  return HANDS.find((hand) => inventory[hand] === itemId) ?? null;
}
