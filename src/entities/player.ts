/**
 * First-person player movement.
 *
 * Written as a pure-ish step over plain data - no THREE objects, no DOM - so the
 * same function can run as the local prediction and as the host's authoritative
 * simulation once netcode lands. See docs/ARCHITECTURE.md section 2.
 *
 * Speed is uniform in every direction on purpose: backing away from something
 * while watching it must carry no penalty.
 */
import type { PlayerConfig } from '@/config/types';
import type { CollisionWorld } from '@/world/collision';
import { createHealth, isDown, type Health } from './health';

export interface PlayerState {
  x: number;
  z: number;
  velocityX: number;
  velocityZ: number;
  yaw: number;
  pitch: number;
  height: number;
  crouching: boolean;
  sprinting: boolean;
  health: Health;
}

export interface MoveIntent {
  forward: number;
  strafe: number;
  sprint: boolean;
  crouch: boolean;
}

export function createPlayerState(x: number, z: number, yaw: number, config: PlayerConfig): PlayerState {
  return {
    x,
    z,
    velocityX: 0,
    velocityZ: 0,
    yaw,
    pitch: 0,
    height: config.body.standHeight,
    crouching: false,
    sprinting: false,
    health: createHealth(),
  };
}

export function applyLook(state: PlayerState, deltaX: number, deltaY: number, config: PlayerConfig, sensitivityScale: number): void {
  const sensitivity = config.camera.mouseSensitivity * sensitivityScale;
  state.yaw -= deltaX * sensitivity;
  state.pitch += (config.camera.invertY ? deltaY : -deltaY) * sensitivity;

  const clamp = (config.camera.pitchClampDegrees * Math.PI) / 180;
  state.pitch = Math.max(-clamp, Math.min(clamp, state.pitch));
}

/**
 * `speedScale` is ground the player is fighting: a tar slick multiplies it down.
 * It scales the target speed only, so acceleration and collision are unchanged.
 */
export function stepPlayer(
  state: PlayerState,
  intent: MoveIntent,
  dt: number,
  config: PlayerConfig,
  collision: CollisionWorld,
  speedScale = 1,
): void {
  // A downed player is immobile on the floor. They are not dead, and not on a
  // timer - they are waiting for someone to come back for them.
  const downed = isDown(state.health.state);
  state.crouching = intent.crouch && !downed;
  state.sprinting = !downed && intent.sprint && !intent.crouch && (intent.forward !== 0 || intent.strafe !== 0);

  const base = state.crouching
    ? config.movement.crouchSpeed
    : state.sprinting
      ? config.movement.sprintSpeed
      : config.movement.walkSpeed;

  const speed =
    downed ? 0 : base * (state.health.state === 'injured' ? config.movement.injuredSpeedMultiplier : 1) * speedScale;

  // Intent is in view space; rotate into world space by yaw.
  const sin = Math.sin(state.yaw);
  const cos = Math.cos(state.yaw);
  let desiredX = intent.strafe * cos - intent.forward * sin;
  let desiredZ = -intent.strafe * sin - intent.forward * cos;

  const magnitude = Math.hypot(desiredX, desiredZ);
  if (magnitude > 1e-4) {
    desiredX = (desiredX / magnitude) * speed;
    desiredZ = (desiredZ / magnitude) * speed;
  } else {
    desiredX = 0;
    desiredZ = 0;
  }

  const rate = magnitude > 1e-4 ? config.movement.acceleration : config.movement.deceleration;
  const blend = Math.min(1, rate * dt);
  state.velocityX += (desiredX - state.velocityX) * blend;
  state.velocityZ += (desiredZ - state.velocityZ) * blend;

  const nextX = state.x + state.velocityX * dt;
  const nextZ = state.z + state.velocityZ * dt;
  const resolved = collision.resolve(nextX, nextZ, config.body.radius);

  // Kill velocity along the axis we were pushed back on, so we do not keep
  // accelerating into a wall and shoot off when it clears.
  if (Math.abs(resolved.x - nextX) > 1e-5) state.velocityX = 0;
  if (Math.abs(resolved.z - nextZ) > 1e-5) state.velocityZ = 0;

  state.x = resolved.x;
  state.z = resolved.z;

  const targetHeight = state.crouching ? config.body.crouchHeight : config.body.standHeight;
  state.height += (targetHeight - state.height) * Math.min(1, config.body.heightLerpSpeed * dt);
}

/** Camera Y. Presentation only - never feeds back into the sim. */
export function eyeHeight(state: PlayerState, config: PlayerConfig): number {
  if (isDown(state.health.state)) return config.body.downedEyeHeight;
  return state.height + config.body.eyeHeightOffset;
}
