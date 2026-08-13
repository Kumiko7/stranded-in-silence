/**
 * Every room in Vulcan's Anvil, in the order the pack presents them.
 *
 * The set is split into two families that alternate as you walk the maze - the
 * Works (the black site) and the Mountain (what it was drilled into) - with
 * three hinge rooms that are honestly both, and two rooms of the thing they
 * grew, which belongs to neither.
 */
import type { RoomBlueprint } from '../../../lib/contract';

import { airlock } from './airlock';
import { caldera } from './caldera';
import { cast } from './cast';
import { drill } from './drill';
import { lavafallRoom } from './lavafall';
import { obsidianRoom } from './obsidian';
import { pit } from './pit';
import { roots } from './roots';
import { sulphur } from './sulphur';
import { tube } from './tube';
import { vent } from './vent';
import { armoury } from './armoury';
import { control } from './control';
import { dorm } from './dorm';
import { laser } from './laser';
import { medbay } from './medbay';
import { morgue } from './morgue';
import { server } from './server';
import { smelt } from './smelt';
import { tap } from './tap';
import { tramway } from './tramway';
import { vivarium } from './vivarium';

/* --- the Works ------------------------------------------------------------- */
const works: readonly RoomBlueprint[] = [
  airlock,
  control,
  laser,
  vivarium,
  morgue,
  server,
  medbay,
  armoury,
  dorm,
  tap,
  smelt,
  tramway,
];

/* --- the Mountain ---------------------------------------------------------- */
const mountain: readonly RoomBlueprint[] = [
  lavafallRoom,
  sulphur,
  obsidianRoom,
  cast,
  pit,
  vent,
  roots,
  drill,
  tube,
  caldera,
];

export const rooms: readonly RoomBlueprint[] = [...works, ...mountain];
