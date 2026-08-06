/**
 * One player's body in the world, wearing what they chose in the wardrobe.
 *
 * `Game` (teammates in a run), `Lobby` (teammates and the mannequin in front of
 * the wardrobe) and `render/portraits.ts` (the scoreboard) all need the same
 * thing: build `player.masked`, tint it, hang a hat on it, and be able to throw
 * the whole lot away again. They used to each do the first two by hand, which
 * is how the mannequin and the run bodies drifted apart in the first place.
 *
 * This file owns the *only* mapping from a wardrobe id to something visual.
 * Everywhere else in `src/` a cosmetic is the two ids in `@shared/cosmetics`,
 * which is why that type lives there and not here: `net/` ships it over the
 * wire and is not allowed to know what a hat looks like.
 */
import * as THREE from 'three';
import { hasArt, resolveArt } from '@art/shared/index';
import type { MaterialLibrary, RoomDims } from '@art/lib/contract';
import type { PlayerConfig } from '@/config/types';
import type { Cosmetic } from '@shared/cosmetics';

export type { Cosmetic };

export interface PlayerBody {
  object: THREE.Object3D;
  /** Yawed by logic. The art's own `root`, or the whole object if it has none. */
  root: THREE.Object3D;
  /** Applies a whole wardrobe choice. Cheap to call with what is already on. */
  wear(cosmetic: Cosmetic): void;
  dispose(): void;
}

/** The hex behind a colour id, falling back to the configured default. */
export function colourHexOf(player: PlayerConfig, colourId: string | null): string {
  const { colours, defaultColourId } = player.customisation;
  const wanted = colourId ?? defaultColourId;
  return (colours.find((entry) => entry.id === wanted) ?? colours[0])?.hex ?? '#6f7690';
}

/** The art id behind a hat id. An id nobody recognises means a bare head. */
export function hatArtIdOf(player: PlayerConfig, hatId: string | null): string {
  const { hats, defaultHatId } = player.customisation;
  const wanted = hatId ?? defaultHatId;
  return (hats.find((entry) => entry.id === wanted) ?? hats.find((entry) => entry.id === defaultHatId))?.artId ?? 'hat.none';
}

/** What a peer who has never opened the wardrobe is wearing. */
export function defaultCosmetic(player: PlayerConfig): Cosmetic {
  return { colourId: player.customisation.defaultColourId, hatId: player.customisation.defaultHatId };
}

export function createPlayerBody(
  player: PlayerConfig,
  materials: MaterialLibrary,
  rng: () => number,
  dims: RoomDims,
): PlayerBody {
  const ctx = { materials, rng, dims };
  const art = resolveArt('player.masked')(ctx);
  const setColour = art.api?.setColour?.bind(art.api);
  const hatAnchor = art.parts['hatAnchor'] ?? art.parts['head'] ?? art.parts['root'] ?? art.object;

  let colourId: string | null = null;
  let hatArtId: string | null = null;
  let hat: { object: THREE.Object3D; dispose?(): void } | null = null;

  const clearHat = (): void => {
    if (!hat) return;
    hatAnchor.remove(hat.object);
    hat.dispose?.();
    hat = null;
  };

  return {
    object: art.object,
    root: art.parts['root'] ?? art.object,

    wear(cosmetic: Cosmetic): void {
      if (cosmetic.colourId !== colourId) {
        colourId = cosmetic.colourId;
        setColour?.(colourHexOf(player, colourId));
      }

      // Hats are resolved WITHOUT the pack's overrides on purpose: a cosmetic
      // somebody paid for is the same object in every map (docs/art/SHARED_ART.md).
      const named = hatArtIdOf(player, cosmetic.hatId);
      // A config entry naming art nobody registered is a bare head, not a
      // crashed run - the same rule a map with an unknown poster gets.
      const wanted = hasArt(named) ? named : 'hat.none';
      if (wanted === hatArtId) return;
      hatArtId = wanted;
      clearHat();

      const built = resolveArt(wanted)(ctx);
      hatAnchor.add(built.object);
      hat = { object: built.object, ...(built.dispose ? { dispose: built.dispose.bind(built) } : {}) };
    },

    dispose(): void {
      clearHat();
      art.dispose?.();
    },
  };
}
