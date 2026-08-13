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
import { buildDoorBarricade } from './props/doorBarricade';
import { buildKey } from './props/items/key';
import { buildMedicine } from './props/items/medicine';
import { buildFlashbang } from './props/items/flashbang';
import { buildAlarmClock } from './props/items/alarmClock';
import { buildTarFlask } from './props/items/tarFlask';
import { buildBarricade } from './props/items/barricade';
import { buildCoinPile } from './props/items/coinPile';
import { buildDiamond } from './props/items/diamond';
import { buildThrowArc } from './vfx/throwArc';
import { buildTarPool } from './vfx/tarPool';
import { buildFlashBurst } from './vfx/flashBurst';
import { buildPlayer } from './characters/player';
import { buildGhost } from './characters/ghost';
import { hatArt } from './characters/hats';
import { buildLever, buildWardrobe } from './lobby/fixtures';
import { buildDart, buildDartStand, buildDartboard, buildScoreboard } from './lobby/darts';
import { buildPosterAbyss, buildPosterBlank, buildPosterCrypt, buildPosterForge, buildPosterMansion, buildPosterRandom, buildPosterTest, buildPosterViscera } from './lobby/poster';

export const sharedArt: ArtRegistry = {
  'door.standard': buildDoor,
  'door.exit': buildExitDoor,
  'chest.standard': buildChest,
  'locker.standard': buildLocker,
  'door.barricade': buildDoorBarricade,
  'player.masked': buildPlayer,
  'enemy.ghost': buildGhost,

  // The item roster (plan step 37). One entry per id in `config/items.json`.
  'item.key': buildKey,
  'item.medicine': buildMedicine,
  'item.flashbang': buildFlashbang,
  'item.alarmClock': buildAlarmClock,
  'item.tarFlask': buildTarFlask,
  'item.barricade': buildBarricade,
  'item.coinPile': buildCoinPile,
  'item.diamond': buildDiamond,

  // What throwables leave behind, plus the line you aim them along.
  'vfx.throwArc': buildThrowArc,
  'vfx.tarPool': buildTarPool,
  'vfx.flashBurst': buildFlashBurst,

  // The lobby. `poster.<mapId>` is named by `config/maps.json -> posterArtId`;
  // a map with no poster of its own falls back to `poster.blank`, which is also
  // what hangs in the slots no map has claimed yet.
  'poster.blank': buildPosterBlank,
  'poster.random': buildPosterRandom,
  'poster.mansion': buildPosterMansion,
  'poster.viscera': buildPosterViscera,
  'poster.abyss': buildPosterAbyss,
  'poster.crypt': buildPosterCrypt,
  'poster.forge': buildPosterForge,
  'poster.test': buildPosterTest,
  'lobby.wardrobe': buildWardrobe,
  'lobby.lever': buildLever,
  // The dart minigame, on the far side of the fence in the east gable.
  'lobby.dartboard': buildDartboard,
  'lobby.scoreboard': buildScoreboard,
  'lobby.dartStand': buildDartStand,
  'lobby.dart': buildDart,

  /**
   * The cosmetic hats (`art/shared/characters/hats.ts`). They are spread in
   * rather than listed, because the roster is meant to grow and the only two
   * places a new hat should have to be named are its own file and
   * `config/player.json -> customisation.hats`.
   *
   * Logic resolves a hat WITHOUT passing the pack's overrides, so a pack cannot
   * theme one. A player bought that top hat; it is the same top hat in every
   * map, which is the difference between a cosmetic and a prop.
   */
  ...hatArt,
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
