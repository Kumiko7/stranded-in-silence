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
    /** Camera height while downed - you are on the floor, looking up. */
    downedEyeHeight: number;
    heightLerpSpeed: number;
  };
  movement: {
    walkSpeed: number;
    sprintSpeed: number;
    crouchSpeed: number;
    injuredSpeedMultiplier: number;
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
  health: {
    reviveHoldSeconds: number;
    reviveRange: number;
    revivedToState: HealthState;
    invulnerableSecondsAfterHit: number;
    invulnerableSecondsAfterRevive: number;
  };
  /** Noise emitters. `radius` is where the enemy may perceive it - see EnemyConfig.hearing. */
  noise: {
    footstepIntervalWalk: number;
    footstepIntervalSprint: number;
    footstepIntervalCrouch: number;
  } & Record<string, NoiseSpec | number>;
  effects: {
    heartbeatStartDistance: number;
    heartbeatMaxDistance: number;
    vignetteInjuredIntensity: number;
    vignetteDownedIntensity: number;
    chaseDistortionIntensity: number;
    damageFlashSeconds: number;
  };
}

export type HealthState = 'healthy' | 'injured' | 'downed' | 'dead';

export interface NoiseSpec {
  radius: number;
  loudness: number;
}

export interface EnemyArchetype {
  displayNameKey: string;
  artId: string;
  body: { radius: number; height: number; hoverHeight: number };
  movement: {
    patrolSpeed: number;
    searchSpeed: number;
    chaseSpeed: number;
    turnRateDegreesPerSecond: number;
    acceleration: number;
    injuredPlayerSlowdownSeconds: number;
    injuredPlayerSlowdownMultiplier: number;
  };
  doors: {
    openSeconds: number;
    openSecondsWhenChasing: number;
    canOpenLockedDoors: boolean;
    closesDoorsBehind: boolean;
  };
  sight: {
    range: number;
    fovDegrees: number;
    requiresLineOfSight: boolean;
    crouchedTargetRangeMultiplier: number;
    darknessRangeMultiplier: number;
    timeToAcquireSeconds: number;
    timeToLoseSeconds: number;
  };
  hearing: {
    rangeMultiplier: number;
    hearingMultiplier: number;
    threshold: number;
    voiceRoomLimit: number;
    positionJitterMetres: number;
  };
  attack: {
    range: number;
    cooldownSeconds: number;
    windupSeconds: number;
    healthyResult: HealthState;
    injuredResult: HealthState;
    ignoresDownedPlayers: boolean;
  };
  patrol: {
    preferUnvisitedWeight: number;
    recentVisitDecaySeconds: number;
    idleAtWaypointSeconds: [number, number];
    waypointsPerRoom: number;
    preferRoomsNearLastNoiseWeight: number;
  };
  search: {
    durationSeconds: number;
    roomsToSearch: number;
    lockerSearchChance: number;
    lockerSearchSeconds: number;
    investigateNoiseRadius: number;
    giveUpToPatrolSeconds: number;
  };
  spawn: {
    minRoomDistanceFromPlayers: number;
    requiresUnlockedPathToPlayers: boolean;
    count: number;
  };
  alert: {
    levels: string[];
    suspiciousDecaySeconds: number;
    alertedDecaySeconds: number;
  };
}

export interface EnemyConfig {
  defaultArchetype: string;
  archetypes: Record<string, EnemyArchetype>;
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
    multiCellRooms: {
      enabled: boolean;
      /** How many multi-cell footprints may be packed into one map. */
      maxSlots: number;
      /** Relative order footprints are tried in, keyed `1x2`, `2x2`, `L`, ... */
      footprintWeights: Record<string, number>;
    };
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
  hud: {
    crosshair: { enabled: boolean; size: number; colour: string; opacity: number };
    /** The bottom-left player roster: hearts, names and noise rings. */
    teammateList: { enabled: boolean };
  };
}

export interface Config {
  game: GameConfig;
  player: PlayerConfig;
  world: WorldConfig;
  enemy: EnemyConfig;
  items: ItemsConfig;
  graphics: GraphicsConfig;
  input: InputConfig;
  net: NetConfig;
  maps: MapsConfig;
  ui: UiConfig;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
