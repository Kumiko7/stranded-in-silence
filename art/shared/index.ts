/**
 * Shared art registry: everything gameplay touches, used by every map.
 *
 * Resolution order is pack override -> this table (see resolveArt()).
 * Required parts per artId are documented in docs/art/SHARED_ART.md.
 */
import type { ArtBuilder, ArtRegistry } from '../lib/contract';
import { buildDoor, buildExitDoor } from './props/door';
import { buildChest } from './props/chest';
import { buildLocker } from './props/locker';
import { buildKey } from './props/items/key';
import { buildPlayer } from './characters/player';
import { buildGhost } from './characters/ghost';

export const sharedArt: ArtRegistry = {
  'door.standard': buildDoor,
  'door.exit': buildExitDoor,
  'chest.standard': buildChest,
  'locker.standard': buildLocker,
  'item.key': buildKey,
  'player.masked': buildPlayer,
  'enemy.ghost': buildGhost,
};

export function resolveArt(artId: string, overrides?: ArtRegistry): ArtBuilder {
  const builder = overrides?.[artId] ?? sharedArt[artId];
  if (!builder) throw new Error(`no art registered for "${artId}"`);
  return builder;
}
