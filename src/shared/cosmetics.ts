/**
 * What a player chose to look like, as it crosses the wire.
 *
 * It lives in `shared/` rather than next to the art that draws it because both
 * ends of the connection need the shape and neither end of `net/` is allowed to
 * know what a colour or a hat actually looks like - `src/render/playerBody.ts`
 * is the only file in the game that turns these two ids into geometry.
 *
 * Both are ids from `config/player.json -> customisation`. An id this build has
 * never heard of - an older peer, a hat added since - falls back to the
 * configured default rather than failing, so a mismatched roster costs one
 * player their hat and nothing else.
 */
export interface Cosmetic {
  colourId: string;
  hatId: string;
}
