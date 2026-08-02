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
  };
  exit: {
    minGridDistanceFromSpawn: number;
    holdSeconds: number;
  };
  validation: {
    maxAttempts: number;
  };
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
  graphics: GraphicsConfig;
  input: InputConfig;
  net: NetConfig;
  maps: MapsConfig;
  ui: UiConfig;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
