/**
 * Art pack registry. Adding a map means adding a pack here and an entry in
 * config/maps.json - no change anywhere in src/.
 */
import type { ArtPack } from '../lib/contract';
import { pack as test } from './test/pack';
import { pack as mansion } from './mansion/pack';

export const artPacks: Readonly<Record<string, ArtPack>> = {
  test,
  mansion,
};

export function getArtPack(id: string): ArtPack {
  const pack = artPacks[id];
  if (!pack) throw new Error(`unknown art pack "${id}" (have: ${Object.keys(artPacks).join(', ')})`);
  return pack;
}
