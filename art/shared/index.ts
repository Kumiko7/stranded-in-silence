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
import { buildLever, buildMinigamePlaceholder, buildWardrobe } from './lobby/fixtures';
import { buildPosterBlank, buildPosterMansion, buildPosterTest } from './lobby/poster';

export const sharedArt: ArtRegistry = {
  'door.standard': buildDoor,
  'door.exit': buildExitDoor,
  'chest.standard': buildChest,
  'locker.standard': buildLocker,
  'item.key': buildKey,
  'player.masked': buildPlayer,
  'enemy.ghost': buildGhost,

  // The lobby. `poster.<mapId>` is named by `config/maps.json -> posterArtId`;
  // a map with no poster of its own falls back to `poster.blank`, which is also
  // what hangs in the slots no map has claimed yet.
  'poster.blank': buildPosterBlank,
  'poster.mansion': buildPosterMansion,
  'poster.test': buildPosterTest,
  'lobby.wardrobe': buildWardrobe,
  'lobby.lever': buildLever,
  'lobby.minigame': buildMinigamePlaceholder,
};

export function resolveArt(artId: string, overrides?: ArtRegistry): ArtBuilder {
  const builder = overrides?.[artId] ?? sharedArt[artId];
  if (!builder) throw new Error(`no art registered for "${artId}"`);
  return builder;
}

/** Whether an art id resolves at all, so callers can fall back rather than throw. */
export function hasArt(artId: string, overrides?: ArtRegistry): boolean {
  return Boolean(overrides?.[artId] ?? sharedArt[artId]);
}
