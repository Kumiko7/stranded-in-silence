/**
 * Types for the config values currently consumed by logic.
 *
 * Only what is actually read is typed - the JSON carries more than this, and
 * unknown keys are legal (a config may run ahead of the code). Add a type here
 * when you start reading a new value. See docs/CONFIG.md.
 */

export interface GameConfig {
  session: {
    maxPlayers: number;
    lobbyCodeLength: number;
    lobbyCodeAlphabet: string;
  };
}

export interface PlayerConfig {
  body: {
    radius: number;
    standHeight: number;
    crouchHeight: number;
    eyeHeightOffset: number;
    heightLerpSpeed: number;
  };
  movement: {
    walkSpeed: number;
    sprintSpeed: number;
    crouchSpeed: number;
    acceleration: number;
    deceleration: number;
  };
  camera: {
    fovDegrees: number;
    mouseSensitivity: number;
    invertY: boolean;
    pitchClampDegrees: number;
  };
  interaction: {
    rayLength: number;
    holdCancelOnLookAway: boolean;
    lookAwayGraceSeconds: number;
  };
}

export interface WorldConfig {
  grid: {
    width: number;
    height: number;
    cellSize: number;
    wallThickness: number;
    ceilingHeight: number;
  };
  layout: {
    extraDoorChance: number;
    maxDuplicatesPerRoom: number;
  };
  doors: {
    width: number;
    height: number;
    openSeconds: number;
    closeSeconds: number;
    lockedDoorCount: number;
    lockedDoorMinDepth: number;
    keySpareCount: number;
  };
  exit: {
    minGridDistanceFromSpawn: number;
    holdSeconds: number;
  };
  containers: {
    chestOpenHoldSeconds: number;
    lockerEnterSeconds: number;
    lockerExitSeconds: number;
  };
  contents: {
    chests: { min: number; max: number; mapTotalMin: number };
    lockers: { min: number; max: number };
    itemSpawns: { min: number; max: number };
  };
  /** Weighted `{ itemId: weight }`. The id `empty` leaves the slot bare. */
  loot: {
    chestTable: Record<string, number>;
    floorTable: Record<string, number>;
  };
  validation: {
    maxAttempts: number;
  };
}

export interface ItemDef {
  nameKey: string;
  descKey: string;
  artId: string;
  behaviour: string;
  useMode: 'press' | 'hold' | 'toggle' | 'none';
  consumedOnUse: boolean;
  occupiesSlot?: boolean;
  params: Record<string, number | string | boolean>;
}

export interface ItemsConfig {
  sizeClass: { width: number; depth: number; height: number };
  defaults: { pickupRange: number; dropForwardOffset: number };
  items: Record<string, ItemDef>;
}

export interface GraphicsConfig {
  pixelRatioCap: number;
  antialias: boolean;
  exposure: number;
  ambientIntensity: number;
  ambientColor: string;
  minAmbientFloor: number;
  shadows: { enabled: boolean };
  fog: { enabled: boolean; color: string; density: number };
  renderDistanceRooms: number;
}

export interface InputConfig {
  actions: Record<string, { labelKey: string; keys: string[]; mode?: string; rebindable?: boolean }>;
  mouse: { sensitivity: number; invertY: boolean };
}

export interface NetConfig {
  simulation: { snapshotRateHz: number; interpolationDelayMs: number };
}

export interface MapEntry {
  nameKey: string;
  descKey?: string;
  artPack: string;
  enabled?: boolean;
  overrides?: { graphics?: Partial<GraphicsConfig>; world?: DeepPartial<WorldConfig> };
}

export interface MapsConfig {
  defaultMapId: string;
  maps: Record<string, MapEntry>;
}

export interface UiConfig {
  theme: { colours: Record<string, string> };
  hud: { crosshair: { enabled: boolean; size: number; colour: string; opacity: number } };
}

export interface Config {
  game: GameConfig;
  player: PlayerConfig;
  world: WorldConfig;
  items: ItemsConfig;
  graphics: GraphicsConfig;
  input: InputConfig;
  net: NetConfig;
  maps: MapsConfig;
  ui: UiConfig;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
