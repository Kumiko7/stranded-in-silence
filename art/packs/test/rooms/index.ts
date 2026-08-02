import type { RoomBlueprint } from '../../../lib/contract';
import { empty } from './empty';
import { pillars } from './pillars';
import { crates } from './crates';
import { table } from './table';
import { shelves } from './shelves';
import { closets } from './closet';

export const rooms: readonly RoomBlueprint[] = [empty, pillars, crates, table, shelves, ...closets];
