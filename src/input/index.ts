/**
 * Input: raw devices -> ACTION ids. Logic never reads key codes.
 *
 * Bindings come from config/input.json, so rebinding later is a data change plus
 * a UI, not a logic change. `labelFor()` exists so HUD prompts show the player's
 * actual binding rather than a hardcoded "E".
 */
import type { InputConfig } from '@/config/types';

export class Input {
  #down = new Set<string>();
  #pressed = new Set<string>();
  #bindings = new Map<string, string[]>();
  #config: InputConfig;
  #canvas: HTMLElement;

  lookDeltaX = 0;
  lookDeltaY = 0;
  pointerLocked = false;
  onPointerLockChange: ((locked: boolean) => void) | null = null;

  constructor(config: InputConfig, canvas: HTMLElement) {
    this.#config = config;
    this.#canvas = canvas;
    for (const [action, binding] of Object.entries(config.actions)) {
      this.#bindings.set(action, binding.keys);
    }
  }

  attach(): () => void {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      this.#press(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => this.#down.delete(event.code);
    const onMouseDown = (event: MouseEvent) => {
      if (this.pointerLocked) this.#press(`Mouse${event.button}`);
    };
    const onMouseUp = (event: MouseEvent) => this.#down.delete(`Mouse${event.button}`);
    const onMouseMove = (event: MouseEvent) => {
      if (!this.pointerLocked) return;
      this.lookDeltaX += event.movementX;
      this.lookDeltaY += event.movementY;
    };
    const onBlur = () => this.#down.clear();
    const onPointerLock = () => {
      this.pointerLocked = document.pointerLockElement === this.#canvas;
      if (!this.pointerLocked) this.#down.clear();
      this.onPointerLockChange?.(this.pointerLocked);
    };

    addEventListener('keydown', onKeyDown);
    addEventListener('keyup', onKeyUp);
    addEventListener('mousedown', onMouseDown);
    addEventListener('mouseup', onMouseUp);
    addEventListener('mousemove', onMouseMove);
    addEventListener('blur', onBlur);
    document.addEventListener('pointerlockchange', onPointerLock);

    return () => {
      removeEventListener('keydown', onKeyDown);
      removeEventListener('keyup', onKeyUp);
      removeEventListener('mousedown', onMouseDown);
      removeEventListener('mouseup', onMouseUp);
      removeEventListener('mousemove', onMouseMove);
      removeEventListener('blur', onBlur);
      document.removeEventListener('pointerlockchange', onPointerLock);
    };
  }

  #press(code: string): void {
    this.#down.add(code);
    this.#pressed.add(code);
  }

  requestPointerLock(): void {
    void this.#canvas.requestPointerLock();
  }

  releasePointerLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(action: string): boolean {
    const keys = this.#bindings.get(action);
    return keys ? keys.some((key) => this.#down.has(key)) : false;
  }

  /**
   * Edge-triggered, and CONSUMED on read: the loop may run several fixed
   * substeps in one frame, and a single key press must only fire once.
   */
  justPressed(action: string): boolean {
    const keys = this.#bindings.get(action);
    if (!keys) return false;
    const hit = keys.some((key) => this.#pressed.has(key));
    if (hit) for (const key of keys) this.#pressed.delete(key);
    return hit;
  }

  /** Mouse look accumulated since the last read, zeroed on read for the same reason. */
  consumeLook(): { x: number; y: number } {
    const delta = { x: this.lookDeltaX, y: this.lookDeltaY };
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    return delta;
  }

  axis(negative: string, positive: string): number {
    return (this.isDown(positive) ? 1 : 0) - (this.isDown(negative) ? 1 : 0);
  }

  /** Human-readable name of an action's primary binding, for HUD prompts. */
  labelFor(action: string): string {
    const key = this.#bindings.get(action)?.[0] ?? '';
    if (key.startsWith('Key')) return key.slice(3);
    if (key.startsWith('Digit')) return key.slice(5);
    if (key === 'Mouse0') return 'LMB';
    if (key === 'Mouse2') return 'RMB';
    if (key.endsWith('Left')) return key.slice(0, -4);
    return key;
  }

  get mouseSensitivity(): number {
    return this.#config.mouse.sensitivity;
  }

  /** Call once per rendered frame, after every substep has read input. */
  endFrame(): void {
    this.#pressed.clear();
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
  }
}
