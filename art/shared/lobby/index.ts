/**
 * The lobby cabin, as one entry point.
 *
 * `src/world/lobbyScene.ts` calls `buildLobby()` for the room and then places
 * the posters, the wardrobe and the lever through the shared-art registry at the
 * anchors it hands back - exactly the split `worldBuilder.ts` uses for rooms and
 * their doors and containers.
 */
export { buildCabin as buildLobby, HALF_X, HALF_Z, EAVE, RIDGE } from './cabin';
export type { BuiltCabin, CabinAnchors, Pose } from './cabin';
export { createLobbyMaterials } from './materials';
export { POSTER_WIDTH, POSTER_HEIGHT } from './poster';
