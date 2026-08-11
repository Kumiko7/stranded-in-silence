/**
 * Every compartment of Kerberos Deep.
 *
 * Sixteen 1x1 blueprints plus four multi-cell set pieces. Rooms are rotated in
 * 90 degree steps to fit their slot, so the one-door cryo bay serves every dead
 * end in the map on its own and nothing needs a mirrored twin.
 *
 * The set is deliberately split down the middle between **station** rooms -
 * plate, tile, amber emergency light, straight lines - and **abyss** rooms -
 * silt, basalt, bioluminescence, no straight lines at all. Walking from one
 * zone into the other is the map's main beat, so the two halves are weighted
 * evenly and neither has more than one really bright room in it. Two rooms are
 * honestly both (`moonpool`, `breach`), and they are what make the boundary read
 * as deliberate rather than as two packs stapled together.
 *
 * Multi-cell set pieces are packed into the grid before the maze is grown, at
 * most one of each per map, and only while `world.json -> layout.multiCellRooms`
 * is enabled.
 */
import type { RoomBlueprint } from '../../../lib/contract';

import { anglers } from './anglers';
import { archive } from './archive';
import { atrium } from './atrium';
import { breach } from './breach';
import { brine } from './brine';
import { coral } from './coral';
import { cryo } from './cryo';
import { decon } from './decon';
import { drydock } from './drydock';
import { gallery } from './gallery';
import { hatchery } from './hatchery';
import { jelly } from './jelly';
import { kelp } from './kelp';
import { moonpool } from './moonpool';
import { pumps } from './pumps';
import { quarters } from './quarters';
import { reactor } from './reactor';
import { ruins } from './ruins';
import { sonar } from './sonar';
import { tunnel } from './tunnel';
import { vents } from './vents';
import { wetlab } from './wetlab';
import { whalefall } from './whalefall';
import { wreck } from './wreck';

export const rooms: readonly RoomBlueprint[] = [
  // 1x1 - station
  wetlab,
  cryo,
  sonar,
  moonpool,
  pumps,
  quarters,
  hatchery,
  archive,
  decon,
  reactor,

  // 1x1 - abyss
  gallery,
  kelp,
  coral,
  jelly,
  wreck,
  ruins,
  anglers,
  whalefall,
  brine,
  vents,

  // Multi-cell set pieces, one of each, used only when the generator packs them.
  atrium,
  tunnel,
  drydock,
  breach,
];
