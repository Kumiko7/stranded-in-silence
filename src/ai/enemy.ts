/**
 * The hunter. See docs/systems/AI.md for the state machine this implements.
 *
 * Runs on the HOST only - clients receive its transform and alert level and
 * interpolate (docs/systems/NETWORKING.md). Like the player step it is plain
 * data in, plain data out: no THREE objects, no DOM, so the same function will
 * survive the move to an authoritative simulation unchanged.
 *
 * The whole design rests on one asymmetry: it is faster than a sprinting player
 * but SLOWER through doors. You never outrun it, you make it commit to the
 * wrong noise and put a door between you.
 *
 * A map may carry more than one (`enemy.json -> spawn.regions`). They are fully
 * independent instances of this file with one exception: patrol room choice
 * knows where the others are, so they cover the map instead of shadowing each
 * other. Nothing else about them is shared.
 */
import { pickWeighted, type Rng } from '@/core/rng';
import type { EnemyArchetype } from '@/config/types';
import type { CollisionWorld } from '@/world/collision';
import type { Door } from '@/world/doors';
import { canSeePoint, listen, look, type PerceptionTarget } from './perception';
import type { NoiseEvent } from './noiseBus';
import type { CellKey, RoomGraph } from './roomGraph';

export type EnemyStateName = 'patrol' | 'investigate' | 'search' | 'chase' | 'attack';
export type AlertLevel = 'calm' | 'suspicious' | 'alerted' | 'chasing';

/** A step of the route: a point to walk to, optionally through a door first. */
interface Waypoint {
  x: number;
  z: number;
  doorId?: string;
}

export interface EnemyState {
  x: number;
  z: number;
  yaw: number;
  velocityX: number;
  velocityZ: number;
  state: EnemyStateName;
  alert: AlertLevel;
  /** Remaining route. The head is the point currently being walked to. */
  waypoints: Waypoint[];
  /** Room the current route ends in, so patrol does not re-plan every tick. */
  destination: CellKey | null;
  targetId: string | null;
  lastKnown: { x: number; z: number } | null;
  /** Seconds each room was last stood in, so patrol can prefer stale ones. */
  visited: Map<CellKey, number>;
  time: number;
  seenFor: number;
  lostFor: number;
  idleFor: number;
  searchFor: number;
  doorWait: number;
  lockerWait: number;
  lockerId: string | null;
  attackCooldown: number;
  windup: number;
  slowdown: number;
  /** Seconds it is standing there doing nothing, from a flare going off in its face. */
  stunFor: number;
  /** How long it has been scraping against something without getting anywhere. */
  stuckFor: number;
  /** A locker it WATCHED someone climb into. Searched first, and never rolled for. */
  witnessedLocker: string | null;
  /** Throttles the in-room detour search while a chase is blocked by furniture. */
  repathIn: number;
  searchedLockers: Set<string>;
}

/** A locker the enemy may throw open mid-search. */
export interface EnemyLocker {
  id: string;
  x: number;
  z: number;
  /** Who is hiding in it, if anyone. Hiding beats sight, not a search. */
  occupantId: string | null;
}

/** Someone climbed into a locker this tick. If the enemy saw it, hiding is over. */
export interface LockerEntry {
  lockerId: string;
  playerId: string;
  /**
   * Where they were STANDING as they climbed in, not the locker itself - the
   * locker has a collider, so a sight test against its centre is always blocked
   * by the very thing being looked at.
   */
  x: number;
  z: number;
}

/** Another hunter on the map, as far as this one is concerned. */
export interface EnemyPeer {
  x: number;
  z: number;
  /** The room its current route ends in, if it has one. */
  destination: CellKey | null;
}

export interface EnemyContext {
  targets: readonly PerceptionTarget[];
  noise: readonly NoiseEvent[];
  /**
   * Every OTHER hunter. They do not co-ordinate, share what they have seen or
   * react to each other in any way - the only thing this is used for is picking
   * a patrol room, so two of them stop sweeping the same wing together. Empty
   * with one hunter on the map, which is why its behaviour is unchanged.
   */
  others: readonly EnemyPeer[];
  lockerEntries: readonly LockerEntry[];
  graph: RoomGraph;
  doors: ReadonlyMap<string, Door>;
  lockers: readonly EnemyLocker[];
  collision: CollisionWorld;
  config: EnemyArchetype;
  rng: Rng;
  /** Ground multiplier at a position - a tar slick makes it wade. 1 when clear. */
  slowAt(x: number, z: number): number;
  /** Opening a door is the enemy's own action: it toggles, replicates and is loud. */
  openDoor(doorId: string): void;
  /** Healthy -> injured, injured -> downed. The caller owns the health ladder. */
  attack(targetId: string): void;
  /** A searched locker throws its doors open, whether or not anyone is inside. */
  searchLocker(lockerId: string): void;
}

const ARRIVE_RADIUS = 0.55;
const DOOR_STAND_OFF = 1.15;
/**
 * How many rooms patrol will consider before it settles for standing still.
 *
 * Rooms behind a locked door are `Infinity` in the graph, so a pick can simply
 * have no route - and for a hunter that starts sealed into a partition of its
 * own (`spawn.regions`) most of the map is like that. One pick per idle cycle
 * would leave it loitering by the door it cannot open; a handful of picks costs
 * a few A* runs over 36 nodes and it walks its own wing like anything else.
 */
const PATROL_ROOM_ATTEMPTS = 4;

export function createEnemy(x: number, z: number): EnemyState {
  return {
    x,
    z,
    yaw: 0,
    velocityX: 0,
    velocityZ: 0,
    state: 'patrol',
    alert: 'calm',
    waypoints: [],
    destination: null,
    targetId: null,
    lastKnown: null,
    visited: new Map(),
    time: 0,
    seenFor: 0,
    lostFor: 0,
    idleFor: 0,
    searchFor: 0,
    doorWait: 0,
    lockerWait: 0,
    lockerId: null,
    attackCooldown: 0,
    windup: 0,
    slowdown: 0,
    stunFor: 0,
    stuckFor: 0,
    witnessedLocker: null,
    repathIn: 0,
    searchedLockers: new Set(),
  };
}

export function updateEnemy(enemy: EnemyState, dt: number, ctx: EnemyContext): void {
  const { config } = ctx;

  enemy.time += dt;
  enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
  enemy.slowdown = Math.max(0, enemy.slowdown - dt);
  enemy.stunFor = Math.max(0, enemy.stunFor - dt);
  enemy.visited.set(ctx.graph.cellAt(enemy.x, enemy.z), enemy.time);

  // A flare in the face. It keeps whatever it was thinking - alert level, target,
  // route - and simply cannot act on any of it, which is the whole window.
  if (enemy.stunFor > 0) {
    enemy.velocityX = 0;
    enemy.velocityZ = 0;
    enemy.doorWait = 0;
    return;
  }

  perceive(enemy, dt, ctx);

  switch (enemy.state) {
    case 'patrol':
      patrol(enemy, dt, ctx);
      break;
    case 'investigate':
      investigate(enemy, ctx);
      break;
    case 'search':
      search(enemy, dt, ctx);
      break;
    case 'chase':
      chase(enemy, dt, ctx);
      break;
    case 'attack':
      attack(enemy, dt, ctx);
      break;
  }

  enemy.alert =
    enemy.state === 'chase' || enemy.state === 'attack'
      ? 'chasing'
      : enemy.state === 'search'
        ? 'alerted'
        : enemy.state === 'investigate'
          ? 'suspicious'
          : 'calm';

  const speed =
    (enemy.state === 'chase' || enemy.state === 'attack'
      ? config.movement.chaseSpeed
      : enemy.state === 'patrol'
        ? config.movement.patrolSpeed
        : config.movement.searchSpeed) *
    (enemy.slowdown > 0 ? config.movement.injuredPlayerSlowdownMultiplier : 1) *
    // Tar does not care how fast it is meant to be.
    ctx.slowAt(enemy.x, enemy.z);

  steer(enemy, dt, speed, ctx);
}

/* --- perception ----------------------------------------------------------- */

function perceive(enemy: EnemyState, dt: number, ctx: EnemyContext): void {
  const { sight } = ctx.config;
  if (witnessLockerEntry(enemy, ctx)) return;

  const seen = look(enemy, ctx.targets, ctx.config, ctx.collision, ctx.graph);

  if (seen) {
    enemy.seenFor += dt;
    enemy.lostFor = 0;
    enemy.lastKnown = { x: seen.target.x, z: seen.target.z };

    if (enemy.seenFor >= sight.timeToAcquireSeconds && enemy.state !== 'attack') {
      if (enemy.targetId !== seen.target.id || enemy.state !== 'chase') beginChase(enemy, seen.target.id);
    }
    return;
  }

  enemy.seenFor = 0;

  if (enemy.state === 'chase' || enemy.state === 'attack') {
    enemy.lostFor += dt;
    // It holds the target for a moment after losing sight, then commits to the
    // last place it saw them and starts sweeping.
    if (enemy.lostFor >= sight.timeToLoseSeconds) beginSearch(enemy, ctx);
    return;
  }

  const heard = listen(enemy, ctx.noise, ctx.config, ctx.graph, ctx.rng);
  if (!heard) return;

  // A louder noise always wins the enemy's attention, even mid-investigation.
  enemy.lastKnown = { x: heard.x, z: heard.z };
  enemy.state = 'investigate';
  enemy.destination = null;
  enemy.waypoints = [];
  enemy.idleFor = 0;
}

/**
 * Climbing into a locker in full view of the hunter is not hiding, it is
 * cornering yourself. The moment it sees you do it, that locker is the only
 * thing it is going to search - no roll, no sweep.
 */
function witnessLockerEntry(enemy: EnemyState, ctx: EnemyContext): boolean {
  for (const entry of ctx.lockerEntries) {
    if (!canSeePoint(enemy, entry.x, entry.z, ctx.config, ctx.collision)) continue;

    enemy.targetId = entry.playerId;
    enemy.lastKnown = { x: entry.x, z: entry.z };
    beginSearch(enemy, ctx);
    enemy.witnessedLocker = entry.lockerId;
    return true;
  }
  return false;
}

/* --- states --------------------------------------------------------------- */

function patrol(enemy: EnemyState, dt: number, ctx: EnemyContext): void {
  if (enemy.waypoints.length) return;

  if (enemy.idleFor > 0) {
    enemy.idleFor -= dt;
    return;
  }

  const here = ctx.graph.cellAt(enemy.x, enemy.z);
  const node = ctx.graph.node(here);

  // Walk this room's own patrol points before moving on, so it sweeps rooms
  // rather than cutting corner to corner through them.
  if (enemy.destination === here && node && node.patrolPoints.length > 1) {
    const point = node.patrolPoints[Math.floor(ctx.rng() * node.patrolPoints.length)];
    if (point) {
      enemy.waypoints = [{ x: point[0], z: point[1] }];
      enemy.idleFor = idleSeconds(ctx);
      enemy.destination = null;
      return;
    }
  }

  for (let attempt = 0; attempt < PATROL_ROOM_ATTEMPTS; attempt++) {
    const target = choosePatrolRoom(enemy, ctx, here);
    if (!target) return;

    const route = routeTo(enemy, ctx, target, pointInRoom(ctx, target, ctx.rng));
    if (!route.length) continue;

    enemy.destination = target;
    enemy.waypoints = route;
    enemy.idleFor = idleSeconds(ctx);
    return;
  }
}

function investigate(enemy: EnemyState, ctx: EnemyContext): void {
  const goal = enemy.lastKnown;
  if (!goal) {
    enemy.state = 'patrol';
    return;
  }

  if (!enemy.waypoints.length) {
    const cell = ctx.graph.cellAt(goal.x, goal.z);
    if (cell === ctx.graph.cellAt(enemy.x, enemy.z) || enemy.destination === cell) {
      // Arrived, and whatever made the noise is not in sight - start sweeping.
      beginSearch(enemy, ctx);
      return;
    }
    enemy.destination = cell;
    enemy.waypoints = routeTo(enemy, ctx, cell, goal);
    if (!enemy.waypoints.length) beginSearch(enemy, ctx);
  }
}

function search(enemy: EnemyState, dt: number, ctx: EnemyContext): void {
  enemy.searchFor -= dt;
  if (enemy.searchFor <= 0) {
    enemy.state = 'patrol';
    enemy.destination = null;
    enemy.waypoints = [];
    enemy.targetId = null;
    enemy.witnessedLocker = null;
    enemy.lockerId = null;
    enemy.lockerWait = 0;
    enemy.searchedLockers.clear();
    return;
  }

  // Committed to a locker: walk to it, then stand there and go through it. The
  // timer only starts on arrival - it must not run down on the way over.
  if (enemy.lockerId) {
    if (enemy.waypoints.length) return;
    if (enemy.lockerWait <= 0) enemy.lockerWait = ctx.config.search.lockerSearchSeconds;

    enemy.lockerWait -= dt;
    if (enemy.lockerWait > 0) return;

    const locker = ctx.lockers.find((candidate) => candidate.id === enemy.lockerId);
    enemy.lockerId = null;
    enemy.lockerWait = 0;
    if (!locker) return;

    ctx.searchLocker(locker.id);
    // Lockers hide you from sight, not from a search. This is the whole trade.
    if (locker.occupantId) {
      beginChase(enemy, locker.occupantId);
      ctx.attack(locker.occupantId);
      afterAttack(enemy, ctx, true);
    }
    return;
  }

  if (enemy.waypoints.length) return;

  // A locker it watched someone climb into first, then anything unsearched in
  // this room, then the next room over.
  const here = ctx.graph.cellAt(enemy.x, enemy.z);
  const witnessed = enemy.witnessedLocker
    ? ctx.lockers.find((candidate) => candidate.id === enemy.witnessedLocker)
    : undefined;

  const locker =
    witnessed ??
    ctx.lockers.find(
      (candidate) =>
        !enemy.searchedLockers.has(candidate.id) &&
        ctx.graph.cellAt(candidate.x, candidate.z) === here &&
        ctx.rng() < ctx.config.search.lockerSearchChance,
    );

  if (locker) {
    enemy.witnessedLocker = null;
    enemy.searchedLockers.add(locker.id);
    enemy.lockerId = locker.id;
    enemy.lockerWait = 0;
    enemy.waypoints = routeTo(enemy, ctx, ctx.graph.cellAt(locker.x, locker.z), { x: locker.x, z: locker.z });
    return;
  }

  const nearby = ctx.graph.roomsWithin(here, 1);
  const room = nearby[Math.floor(ctx.rng() * nearby.length)];
  if (!room) return;

  enemy.destination = room;
  enemy.waypoints = routeTo(enemy, ctx, room, pointInRoom(ctx, room, ctx.rng));
}

function chase(enemy: EnemyState, dt: number, ctx: EnemyContext): void {
  const target = ctx.targets.find((candidate) => candidate.id === enemy.targetId);
  if (!target || (target.downed && ctx.config.attack.ignoresDownedPlayers)) {
    beginSearch(enemy, ctx);
    return;
  }

  enemy.lastKnown = { x: target.x, z: target.z };

  const distance = Math.hypot(target.x - enemy.x, target.z - enemy.z);
  if (distance <= ctx.config.attack.range && enemy.attackCooldown <= 0) {
    enemy.state = 'attack';
    enemy.windup = ctx.config.attack.windupSeconds;
    enemy.waypoints = [];
    return;
  }

  const cell = ctx.graph.cellAt(target.x, target.z);
  // In the same room it beelines - unless a table is in the way, in which case
  // it goes around rather than standing there pushing into the furniture.
  if (cell === ctx.graph.cellAt(enemy.x, enemy.z)) {
    enemy.destination = cell;

    if (ctx.collision.segmentClear(enemy.x, enemy.z, target.x, target.z)) {
      enemy.waypoints = [{ x: target.x, z: target.z }];
      enemy.repathIn = 0;
      return;
    }

    enemy.repathIn -= dt;
    if (enemy.repathIn <= 0 || !enemy.waypoints.length) {
      enemy.repathIn = 0.3;
      enemy.waypoints = routeInRoom(enemy, ctx, { x: target.x, z: target.z });
    }
    return;
  }

  // Otherwise it re-plans only when the target changes room, which is what
  // keeps chases readable instead of jittery.
  if (enemy.destination !== cell || !enemy.waypoints.length) {
    enemy.destination = cell;
    enemy.waypoints = routeTo(enemy, ctx, cell, { x: target.x, z: target.z });
  }
}

function attack(enemy: EnemyState, dt: number, ctx: EnemyContext): void {
  enemy.windup -= dt;
  if (enemy.windup > 0) return;

  const target = ctx.targets.find((candidate) => candidate.id === enemy.targetId);
  const landed = !!target && Math.hypot(target.x - enemy.x, target.z - enemy.z) <= ctx.config.attack.range * 1.3;
  if (landed && target) ctx.attack(target.id);
  afterAttack(enemy, ctx, landed);
}

/* --- transitions ---------------------------------------------------------- */

function beginChase(enemy: EnemyState, targetId: string): void {
  enemy.state = 'chase';
  enemy.targetId = targetId;
  enemy.lostFor = 0;
  enemy.idleFor = 0;
  enemy.destination = null;
  enemy.waypoints = [];
}

function beginSearch(enemy: EnemyState, ctx: EnemyContext): void {
  enemy.state = 'search';
  enemy.searchFor = ctx.config.search.durationSeconds;
  enemy.destination = null;
  enemy.waypoints = [];
  enemy.lostFor = 0;
  enemy.seenFor = 0;
  enemy.lockerWait = 0;
  enemy.lockerId = null;
  enemy.searchedLockers.clear();

  // Start the sweep where the target was last known to be.
  if (enemy.lastKnown) {
    const cell = ctx.graph.cellAt(enemy.lastKnown.x, enemy.lastKnown.z);
    enemy.destination = cell;
    enemy.waypoints = routeTo(enemy, ctx, cell, enemy.lastKnown);
  }
}

/**
 * The window the design promises you after being hit: it slows right down.
 * A whiffed lunge earns it nothing - dodging one is not the same as taking one.
 */
function afterAttack(enemy: EnemyState, ctx: EnemyContext, landed: boolean): void {
  enemy.attackCooldown = ctx.config.attack.cooldownSeconds;
  if (landed) enemy.slowdown = ctx.config.movement.injuredPlayerSlowdownSeconds;
  enemy.state = 'chase';
  enemy.windup = 0;
  enemy.waypoints = [];
  enemy.destination = null;
}

/* --- routing and steering -------------------------------------------------- */

/** Room-graph route turned into points, with the doors on the way marked. */
function routeTo(enemy: EnemyState, ctx: EnemyContext, cell: CellKey, finish: { x: number; z: number }): Waypoint[] {
  const from = ctx.graph.cellAt(enemy.x, enemy.z);
  if (from === cell) return routeInRoom(enemy, ctx, finish);

  const rooms = ctx.graph.path(from, cell, ctx.doors, {
    doorSeconds: doorSeconds(enemy, ctx),
    canOpenLockedDoors: ctx.config.doors.canOpenLockedDoors,
  });
  if (!rooms) return [];

  const waypoints: Waypoint[] = [];
  let current = from;

  for (const next of rooms) {
    const link = ctx.graph.node(current)?.links.find((candidate) => candidate.key === next);
    const door = link ? ctx.doors.get(link.doorId) : undefined;
    if (door) waypoints.push({ x: door.x, z: door.z, doorId: door.id });

    // Then the middle of the room it just entered. Without this it would cut
    // straight from one doorway toward the next and scrape along the walls.
    const centre = ctx.graph.centreOf(next);
    waypoints.push({ x: centre.x, z: centre.z });
    current = next;
  }
  waypoints.pop(); // the last room's centre is replaced by the real destination

  waypoints.push({ x: finish.x, z: finish.z });
  return waypoints;
}

/**
 * Getting across ONE room when the straight line is blocked.
 *
 * The room graph is too coarse for this - both ends are the same node - so it
 * builds a tiny visibility graph over the room's own `patrolPoint` anchors and
 * takes the cheapest one- or two-hop detour. Those anchors are already authored
 * as "somewhere in this room you can stand", which is exactly what a corner to
 * cut around needs to be, so no extra data is asked of art.
 *
 * At most four anchors per room, so this is a couple of dozen segment tests and
 * it is throttled by `repathIn` on top of that.
 */
function routeInRoom(from: { x: number; z: number }, ctx: EnemyContext, goal: { x: number; z: number }): Waypoint[] {
  const clear = (a: { x: number; z: number }, b: { x: number; z: number }) =>
    ctx.collision.segmentClear(a.x, a.z, b.x, b.z);

  if (clear(from, goal)) return [{ x: goal.x, z: goal.z }];

  const node = ctx.graph.node(ctx.graph.cellAt(from.x, from.z));
  const points = (node?.patrolPoints ?? []).map(([x, z]) => ({ x, z }));
  const reachable = points.filter((point) => clear(from, point));

  let bestCost = Infinity;
  let bestHops: { x: number; z: number }[] = [];
  const consider = (cost: number, hops: { x: number; z: number }[]): void => {
    if (cost >= bestCost) return;
    bestCost = cost;
    bestHops = hops;
  };

  for (const first of reachable) {
    const legOne = distance(from, first);
    if (clear(first, goal)) consider(legOne + distance(first, goal), [first]);

    for (const second of points) {
      if (second === first || !clear(first, second) || !clear(second, goal)) continue;
      consider(legOne + distance(first, second) + distance(second, goal), [first, second]);
    }
  }

  // Nothing visible gets there: head straight at it anyway and let the stuck
  // timer shake it loose. Standing still would be worse than shuffling.
  return [...bestHops, { x: goal.x, z: goal.z }].map((point) => ({ x: point.x, z: point.z }));
}

function distance(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function doorSeconds(enemy: EnemyState, ctx: EnemyContext): number {
  return enemy.state === 'chase' || enemy.state === 'attack'
    ? ctx.config.doors.openSecondsWhenChasing
    : ctx.config.doors.openSeconds;
}

/**
 * What THIS door costs it. A barricade is priced in the one currency the hunter
 * cannot cheat: standing still. It pays exactly what a player pays.
 */
function doorDelay(enemy: EnemyState, ctx: EnemyContext, door: Door): number {
  return doorSeconds(enemy, ctx) + door.barricadeSeconds;
}

/**
 * Moves toward the head waypoint, waiting out any closed door on the way. The
 * wait is the single most important balance lever in the game - it is the only
 * thing a player can put between themselves and something faster than they are.
 */
function steer(enemy: EnemyState, dt: number, speed: number, ctx: EnemyContext): void {
  const waypoint = enemy.waypoints[0];

  let desiredX = 0;
  let desiredZ = 0;

  if (waypoint) {
    const door = waypoint.doorId ? ctx.doors.get(waypoint.doorId) : undefined;
    const distance = Math.hypot(waypoint.x - enemy.x, waypoint.z - enemy.z);

    if (door && !door.open && distance <= DOOR_STAND_OFF) {
      enemy.doorWait += dt;
      if (enemy.doorWait >= doorDelay(enemy, ctx, door)) {
        enemy.doorWait = 0;
        // A locked door it cannot open is not a route; give up and re-plan.
        if (door.locked && !ctx.config.doors.canOpenLockedDoors) {
          enemy.waypoints = [];
          enemy.destination = null;
        } else {
          ctx.openDoor(door.id);
        }
      }
    } else if (distance <= (waypoint.doorId ? ARRIVE_RADIUS * 0.8 : ARRIVE_RADIUS)) {
      enemy.waypoints.shift();
      enemy.doorWait = 0;
    } else {
      enemy.doorWait = 0;
      desiredX = ((waypoint.x - enemy.x) / distance) * speed;
      desiredZ = ((waypoint.z - enemy.z) / distance) * speed;
    }
  }

  const blend = Math.min(1, ctx.config.movement.acceleration * dt);
  enemy.velocityX += (desiredX - enemy.velocityX) * blend;
  enemy.velocityZ += (desiredZ - enemy.velocityZ) * blend;

  const nextX = enemy.x + enemy.velocityX * dt;
  const nextZ = enemy.z + enemy.velocityZ * dt;
  const resolved = ctx.collision.resolve(nextX, nextZ, ctx.config.body.radius);

  const blocked = Math.abs(resolved.x - nextX) > 1e-4 || Math.abs(resolved.z - nextZ) > 1e-4;
  const progress = Math.hypot(resolved.x - enemy.x, resolved.z - enemy.z);

  enemy.x = resolved.x;
  enemy.z = resolved.z;

  // Brushing a wall is normal - it slides along it. Only give up on a waypoint
  // after being pinned for a while, or a doorway corner would cancel every route.
  if (blocked && progress < speed * dt * 0.35) {
    enemy.stuckFor += dt;
    if (enemy.stuckFor > 0.7) {
      enemy.stuckFor = 0;
      enemy.velocityX = 0;
      enemy.velocityZ = 0;
      enemy.waypoints.shift();
    }
  } else {
    enemy.stuckFor = 0;
  }

  const moving = Math.hypot(enemy.velocityX, enemy.velocityZ);
  if (moving > 0.05) {
    const wanted = Math.atan2(-enemy.velocityX, -enemy.velocityZ);
    const rate = (ctx.config.movement.turnRateDegreesPerSecond * Math.PI) / 180;
    let delta = wanted - enemy.yaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    enemy.yaw += Math.max(-rate * dt, Math.min(rate * dt, delta));
  }
}

/* --- room choice ---------------------------------------------------------- */

/** Weighted by staleness, so it drifts toward rooms it has not seen recently. */
function choosePatrolRoom(enemy: EnemyState, ctx: EnemyContext, here: CellKey): CellKey | null {
  const { patrol: config } = ctx.config;
  const candidates = ctx.graph.nodes.filter((node) => node.key !== here);
  if (!candidates.length) return null;

  const taken = otherHuntersPatch(ctx);

  const weightOf = (key: CellKey): number => {
    const last = enemy.visited.get(key);
    const stale = last === undefined || enemy.time - last > config.recentVisitDecaySeconds;
    const near = enemy.lastKnown ? ctx.graph.cellAt(enemy.lastKnown.x, enemy.lastKnown.z) === key : false;
    const weight = 1 + (stale ? config.preferUnvisitedWeight : 0) + (near ? config.preferRoomsNearLastNoiseWeight : 0);
    // A multiplier, not an exclusion: a wing another hunter has drops right down
    // the list without ever becoming a place this one refuses to go. A noise it
    // heard over there still outweighs the whole thing, which is the point.
    return taken.has(key) ? weight * config.otherHunterAreaWeight : weight;
  };

  return pickWeighted(ctx.rng, candidates, (node) => weightOf(node.key)).key;
}

/**
 * The rooms the other hunters have between them: where each is standing and
 * where each is heading, plus everything within `avoidOtherHuntersRooms` links
 * of either. Two hunters searching the same three rooms is two hunters doing
 * one hunter's job.
 */
function otherHuntersPatch(ctx: EnemyContext): ReadonlySet<CellKey> {
  const patch = new Set<CellKey>();
  if (!ctx.others.length) return patch;

  const { avoidOtherHuntersRooms: reach } = ctx.config.patrol;
  const spread = (key: CellKey): void => {
    patch.add(key);
    for (const room of ctx.graph.roomsWithin(key, reach)) patch.add(room);
  };

  for (const other of ctx.others) {
    spread(ctx.graph.cellAt(other.x, other.z));
    if (other.destination) spread(other.destination);
  }
  return patch;
}

function pointInRoom(ctx: EnemyContext, key: CellKey, rng: Rng): { x: number; z: number } {
  const node = ctx.graph.node(key);
  const points = node?.patrolPoints ?? [];
  const point = points[Math.floor(rng() * points.length)];
  return point ? { x: point[0], z: point[1] } : ctx.graph.centreOf(key);
}

function idleSeconds(ctx: EnemyContext): number {
  const [min, max] = ctx.config.patrol.idleAtWaypointSeconds;
  return min + ctx.rng() * Math.max(0, max - min);
}
