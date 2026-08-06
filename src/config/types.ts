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
  lobby: {
    /** Countdown opened by the first map pick, while somebody has still not picked. */
    autoStartSeconds: number;
    /** What the countdown drops to once every player has picked. */
    allReadyStartSeconds: number;
    /** How many frames the poster wall has. Slots past the map list hang blank. */
    posterSlots: number;
  };
  /** The post-run scoreboard: which counters it shows, in order. */
  scoring: {
    enabled: boolean;
    /** `id` names a counter in `src/world/runStats.ts`. */
    categories: { id: string; higherIsBetter: boolean }[];
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
    /** How far the options-menu field-of-view slider may be dragged. */
    fovRange?: [number, number];
    mouseSensitivity: number;
    invertY: boolean;
    pitchClampDegrees: number;
  };
  interaction: {
    rayLength: number;
    holdCancelOnLookAway: boolean;
    lookAwayGraceSeconds: number;
  };
  /** What the lobby wardrobe offers. One option for now - see plan step 43. */
  customisation: {
    defaultColourId: string;
    colours: { id: string; nameKey: string; hex: string }[];
    defaultHatId: string;
    /** `cost` is in banked coins; 0 means owned from the start. */
    hats: { id: string; nameKey: string; artId: string; cost: number }[];
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

/**
 * How a hand button drives an item.
 *
 * `hold` fills a ring while the button is down; `throw` draws the aim arc while
 * it is down and lets go on release; `none` is an item that only pays out on
 * escape; `pickup` never reaches a hand at all - it is spent on contact.
 */
export type ItemUseMode = 'hold' | 'throw' | 'none' | 'pickup';

export interface ItemDef {
  nameKey: string;
  descKey: string;
  artId: string;
  behaviour: string;
  useMode: ItemUseMode;
  consumedOnUse: boolean;
  occupiesSlot?: boolean;
  params: Record<string, number | string | boolean>;
}

/** Ballistics shared by every throwable. See `items.json -> defaults.throw`. */
export interface ThrowConfig {
  speed: number;
  gravity: number;
  radius: number;
  /** Where the item leaves your hand, relative to eye height. */
  releaseHeightOffset: number;
  maxFlightSeconds: number;
  /** How far under the ceiling a throw is stopped from rising. */
  ceilingClearance: number;
  /** Fraction of vertical speed kept after clipping the ceiling. */
  ceilingBounce: number;
  aim: { sampleSeconds: number; maxPoints: number };
}

export interface ItemsConfig {
  sizeClass: { width: number; depth: number; height: number };
  defaults: { pickupRange: number; dropForwardOffset: number; throw: ThrowConfig };
  items: Record<string, ItemDef>;
}

export interface GraphicsConfig {
  pixelRatioCap: number;
  antialias: boolean;
  exposure: number;
  /** How far the options-menu brightness slider may be dragged. It multiplies `exposure`. */
  brightnessRange?: [number, number];
  ambientIntensity: number;
  ambientColor: string;
  minAmbientFloor: number;
  /**
   * How many point lights are enabled at once. A fixed budget rather than a cap:
   * three.js compiles a program per material per light count, so a set that
   * changes size recompiles the world mid-run. See `Renderer.updateLights`.
   */
  maxActiveLights: number;
  /** How long a lamp takes to fade in or out of one of those slots. */
  lightFadeSeconds: number;
  /** `maxCastingLights` is the shadow-casting share of `maxActiveLights`. */
  shadows: { enabled: boolean; maxCastingLights: number };
  fog: { enabled: boolean; color: string; density: number };
  renderDistanceRooms: number;
  /** Portal culling. See `src/world/visibility.ts`. */
  culling: {
    enabled: boolean;
    /** Metres the doorway quad is widened by before it is projected to the screen. */
    portalMarginMetres: number;
    /** Fractions of half the viewport the projected rectangle is widened by. */
    screenMargin: number;
  };
  /** Merged over the block above while the lobby scene is up. */
  lobby?: DeepPartial<GraphicsConfig>;
}

export interface InputConfig {
  actions: Record<
    string,
    { labelKey: string; keys: string[]; category?: string; mode?: string; rebindable?: boolean }
  >;
  /** Raw `KeyboardEvent.code` -> what is printed on the key cap the HUD draws. */
  keyLabels: Record<string, string>;
  /** Codes whose cap is drawn wider, because the word on it does not fit a square. */
  wideKeys: string[];
  mouse: {
    /** Scales `player.json -> camera.mouseSensitivity`. The options slider writes this. */
    sensitivity: number;
    invertY: boolean;
    /** How far the options-menu sensitivity slider may be dragged. */
    sensitivityRange?: [number, number];
  };
}

/** Off, open mic, or hold the key. One control switches between them. */
export type VoiceMode = 'off' | 'voiceActivity' | 'pushToTalk';

export interface VoiceConfig {
  enabled: boolean;
  defaultMode: VoiceMode;
  modes: VoiceMode[];
  /** Metres at which a teammate fades to silence. Far beyond the enemy's reach. */
  hearingRange: number;
  /** Inside this, no attenuation at all. */
  fullVolumeRange: number;
  falloff: string;
  gainSmoothingSeconds: number;
  voiceActivityThresholdDb: number;
  voiceActivityHangoverMs: number;
  emitsNoiseToEnemy: boolean;
  /** Speak louder than this before the hunter gets a noise event at all. */
  noiseThresholdDb: number;
  noiseIntervalSeconds: number;
  /** Level on a received track that counts as "they are talking", for the HUD. */
  speakingThresholdDb: number;
  speakingHoldMs: number;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  bitrateKbps: number;
  spectatorChannelSeparate: boolean;
}

export interface NetConfig {
  simulation: {
    snapshotRateHz: number;
    /** How far in the past remote bodies are drawn, so there is always a gap to fill. */
    interpolationDelayMs: number;
    /** How long a body keeps moving on its last known velocity before it freezes. */
    maxExtrapolationMs: number;
  };
  connection: {
    heartbeatSeconds: number;
    timeoutSeconds: number;
    loadTimeoutSeconds: number;
  };
  voice: VoiceConfig;
}

/**
 * One registry entry. `synth` names a recipe in `src/audio/recipes.ts`; `files`
 * are checked first and win whenever one is actually present under
 * `assets/audio/`. Neither is required - a soundId with no source is silent.
 */
export interface SoundDef {
  bus: string;
  synth?: string;
  files: string[];
  volume: number;
  pitchRange?: [number, number];
  loop?: boolean;
  /** `false` keeps a sound flat even when logic hands it a world position. */
  spatial?: boolean;
  cooldownSeconds?: number;
}

export interface MusicLayerDef {
  files: string[];
  volume: number;
}

export interface AudioConfig {
  /** A bus with a `labelKey` gets a volume slider in the options menu, in this order. */
  buses: Record<string, { defaultVolume: number; parent?: string; labelKey?: string }>;
  spatial: {
    distanceModel: DistanceModelType;
    refDistance: number;
    rolloffFactor: number;
    maxDistance: number;
    panningModel: PanningModelType;
  };
  sounds: Record<string, SoundDef>;
  cues: {
    noiseSounds: Record<string, string>;
    selfFlat: { kinds: string[] };
    alertStings: Record<string, string>;
    holdLoops: Record<string, string>;
    /** Item behaviour -> looping soundId while a hand button is held on it. */
    itemUseLoops: Record<string, string>;
    /** Playback rate a hold loop reaches as its ring fills. */
    holdLoopEndRate: number;
    /** Playback rate the heartbeat reaches when the hunter is on top of you. */
    heartbeatMaxRate: number;
  };
  music: {
    crossfadeSeconds: number;
    duckOnVoiceDb: number;
    bpm: number;
    rootHz: number;
    intensityByAlert: Record<string, number>;
    proximityWeight: number;
    chaseLayerThreshold: number;
    layers: Record<string, MusicLayerDef>;
  };
}

export interface MapEntry {
  nameKey: string;
  descKey?: string;
  artPack: string;
  /** Art id of this map's lobby poster. Missing or unregistered falls back to a blank. */
  posterArtId?: string;
  enabled?: boolean;
  overrides?: { graphics?: Partial<GraphicsConfig>; world?: DeepPartial<WorldConfig> };
}

export interface MapsConfig {
  defaultMapId: string;
  maps: Record<string, MapEntry>;
}

export interface DifficultyMode {
  nameKey: string;
  /** Off until step 38 applies the overlay. The lobby lever only cycles enabled modes. */
  enabled?: boolean;
}

export interface DifficultyConfig {
  default: string;
  modes: Record<string, DifficultyMode>;
}

export interface UiConfig {
  /** Written into CSS custom properties at boot by `src/ui/theme.ts`. */
  theme: {
    colours: Record<string, string>;
    fontDisplay?: string;
    fontBody?: string;
    fontMono?: string;
    radius?: string;
    transitionMs?: number;
  };
  hud: {
    crosshair: { enabled: boolean; size: number; colour: string; opacity: number };
    /** The bottom-left player roster: hearts, names and noise rings. */
    teammateList: { enabled: boolean; showVoiceIndicator: boolean };
    /** The voice pill above the roster: mode, transmitting state, input level. */
    voiceIndicator: { enabled: boolean; showLevelMeter: boolean };
    /** The run purse. Hidden until you have actually picked something up. */
    coins: { enabled: boolean; showWhenEmpty: boolean };
  };
}

export interface Config {
  audio: AudioConfig;
  difficulty: DifficultyConfig;
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
