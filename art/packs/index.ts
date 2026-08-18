/**
 * Art pack registry. Adding a map means adding a pack here and an entry in
 * config/maps.json - no change anywhere in src/.
 */
import type { ArtPack } from '../lib/contract';
import { pack as test } from './test/pack';
import { pack as mansion } from './mansion/pack';
import { pack as viscera } from './viscera/pack';
import { pack as abyss } from './abyss/pack';
import { pack as crypt } from './crypt/pack';
import { pack as forge } from './forge/pack';
import { pack as heartwood } from './heartwood/pack';

export const artPacks: Readonly<Record<string, ArtPack>> = {
  test,
  mansion,
  viscera,
  abyss,
  crypt,
  forge,
  heartwood,
};

export function getArtPack(id: string): ArtPack {
  const pack = artPacks[id];
  if (!pack) throw new Error(`unknown art pack "${id}" (have: ${Object.keys(artPacks).join(', ')})`);
  return pack;
}
