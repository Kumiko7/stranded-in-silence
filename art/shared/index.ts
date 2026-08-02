/**
 * Shared art registry: everything gameplay touches, used by every map.
 *
 * Resolution order is pack override -> this table (see resolveArt()).
 * Required parts per artId are documented in docs/art/SHARED_ART.md.
 */
import type { ArtBuilder, ArtRegistry } from '../lib/contract';
import { buildDoor, buildExitDoor } from './props/door';
import { buildPlayer } from './characters/player';

export const sharedArt: ArtRegistry = {
  'door.standard': buildDoor,
  'door.exit': buildExitDoor,
  'player.masked': buildPlayer,
};

export function resolveArt(artId: string, overrides?: ArtRegistry): ArtBuilder {
  const builder = overrides?.[artId] ?? sharedArt[artId];
  if (!builder) throw new Error(`no art registered for "${artId}"`);
  return builder;
}
