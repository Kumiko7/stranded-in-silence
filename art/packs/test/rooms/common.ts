/**
 * Shared bits for test-pack rooms.
 *
 * Furniture must stay out of the door lanes: doorways are centred on each wall,
 * so keep solid props to the four corner quadrants (|x| > 1.1 and |z| > 1.1).
 */
import type { Side } from '../../../lib/contract';

export const ALL_WALLS = (['north', 'east', 'south', 'west'] as const).map((side: Side) => ({
  cell: [0, 0] as const,
  side,
}));

export const wallsFor = (...sides: Side[]) => sides.map((side) => ({ cell: [0, 0] as const, side }));

/** Corner-quadrant centres, safe places to put things in a 1x1 room. */
export const QUADRANTS = [
  [2.3, 2.3],
  [-2.3, 2.3],
  [2.3, -2.3],
  [-2.3, -2.3],
] as const;
