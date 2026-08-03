/**
 * Positional audio. Distance only, exactly like the noise bus and (later) voice
 * chat - walls and doors never muffle anything in this game, by design
 * (docs/ARCHITECTURE.md "Deliberately NOT built" -> sound occlusion).
 *
 * Nodes are made with the context's factory methods rather than the `new
 * PannerNode(context, ...)` constructors: the context we share with Tone.js is a
 * wrapper, and the constructors reject anything that is not a native context.
 */
import type { AudioConfig } from '@/config/types';

export function createPanner(context: AudioContext, config: AudioConfig['spatial']): PannerNode {
  const panner = context.createPanner();
  panner.panningModel = config.panningModel;
  panner.distanceModel = config.distanceModel;
  panner.refDistance = config.refDistance;
  panner.rolloffFactor = config.rolloffFactor;
  panner.maxDistance = config.maxDistance;
  return panner;
}

export function placePanner(panner: PannerNode, x: number, y: number, z: number): void {
  panner.positionX.value = x;
  panner.positionY.value = y;
  panner.positionZ.value = z;
}

/**
 * Where the ears are. Called from the camera update, so a sound stays put while
 * you turn your head - which is the whole point of spatialising it at all.
 */
export function placeListener(
  listener: AudioListener,
  position: { x: number; y: number; z: number },
  forward: { x: number; y: number; z: number },
  up: { x: number; y: number; z: number },
): void {
  listener.positionX.value = position.x;
  listener.positionY.value = position.y;
  listener.positionZ.value = position.z;
  listener.forwardX.value = forward.x;
  listener.forwardY.value = forward.y;
  listener.forwardZ.value = forward.z;
  listener.upX.value = up.x;
  listener.upY.value = up.y;
  listener.upZ.value = up.z;
}
