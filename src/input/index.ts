/**
 * Input: raw devices -> ACTION ids. Logic never reads key codes.
 *
 * Bindings come from config/input.json and are overlaid with whatever the player
 * rebound (`src/save/options.ts`). `bindingFor()` hands the HUD the raw code so
 * it can draw the actual key cap rather than a hardcoded "E" - turning a code
 * into something a player reads is the UI's job (`src/ui/keys.ts`), not this
 * module's, because it is a display decision and a localisable one.
 */
import type { InputConfig } from '@/config/types';

/** What a rebinding UI needs to draw a row without reading the config itself. */
export interface ActionInfo {
  id: string;
  labelKey: string;
  category: string;
  keys: string[];
  rebindable: boolean;
}

export class Input {
  #down = new Set<string>();
  #pressed = new Set<string>();
  #bindings = new Map<string, string[]>();
  #config: InputConfig;
  #canvas: HTMLElement;

  /**
   * The mouse settings, owned here rather than read from config on every look:
   * the options menu writes them at runtime and `config/` is only where they
   * start. `sensitivity` scales `player.json -> camera.mouseSensitivity`.
   */
  #sensitivity: number;
  #invertY: boolean;

  /**
   * Something on screen is taking typed characters - the chat box. Every action
   * reads as unpressed while it is set, so a `W` meant for a sentence does not
   * also walk you into a corridor. The keys are still tracked, so releasing the
   * capture does not leave a phantom key held down.
   */
  #textCapture = false;

  lookDeltaX = 0;
  lookDeltaY = 0;
  pointerLocked = false;
  onPointerLockChange: ((locked: boolean) => void) | null = null;

  constructor(config: InputConfig, canvas: HTMLElement) {
    this.#canvas = canvas;
    this.#config = config;
    this.#sensitivity = config.mouse.sensitivity;
    this.#invertY = config.mouse.invertY;
    this.resetBindings();
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

  /**
   * `requestPointerLock()` returns a promise in current browsers, and it rejects
   * whenever the call did not come from a user gesture. The rejection has to be
   * swallowed here: `pointerlockerror` already fires for the same failure and
   * the callers listen for that, so an unhandled rejection would be pure noise.
   */
  requestPointerLock(): void {
    const result = this.#canvas.requestPointerLock() as unknown;
    if (result instanceof Promise) result.catch(() => {});
  }

  releasePointerLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /**
   * Hands the keyboard to a text field, or takes it back. Held keys and pending
   * presses are dropped in both directions: the key that opened the box must not
   * still be down when it closes, and nothing typed into it is an action.
   */
  setTextCapture(capturing: boolean): void {
    if (this.#textCapture === capturing) return;
    this.#textCapture = capturing;
    this.#down.clear();
    this.#pressed.clear();
  }

  get capturingText(): boolean {
    return this.#textCapture;
  }

  isDown(action: string): boolean {
    if (this.#textCapture) return false;
    const keys = this.#bindings.get(action);
    return keys ? keys.some((key) => this.#down.has(key)) : false;
  }

  /**
   * Edge-triggered, and CONSUMED on read: the loop may run several fixed
   * substeps in one frame, and a single key press must only fire once.
   */
  justPressed(action: string): boolean {
    if (this.#textCapture) return false;
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

  /* --- bindings ------------------------------------------------------------ */

  /**
   * The raw code of an action's primary binding - `KeyE`, `Mouse0`. The HUD
   * draws it; nothing here decides what it looks like.
   */
  bindingFor(action: string): string {
    return this.#bindings.get(action)?.[0] ?? '';
  }

  /** Every action, in config order, for the rebinding screen. */
  actions(): ActionInfo[] {
    return Object.entries(this.#config.actions).map(([id, action]) => ({
      id,
      labelKey: action.labelKey,
      category: action.category ?? 'other',
      keys: this.#bindings.get(id) ?? [],
      rebindable: action.rebindable !== false,
    }));
  }

  /**
   * Rebinds an action's PRIMARY key, leaving any alternates alone. WASD ships
   * with arrow keys as a second binding and rebinding W should not silently
   * cost you the up arrow.
   *
   * Returns false for an action config marks unrebindable - Escape has to keep
   * working, because it is how you reach the menu that would undo this.
   */
  setBinding(action: string, code: string): boolean {
    const entry = this.#config.actions[action];
    if (!entry || entry.rebindable === false || !code) return false;

    const keys = [...(this.#bindings.get(action) ?? [])];
    keys[0] = code;
    this.#bindings.set(action, keys);
    return true;
  }

  /**
   * Other actions whose primary key is also `code`. Shown to the player rather
   * than resolved for them: two actions on one key is occasionally deliberate
   * (spectate next and use-left both sit on the mouse, in different states),
   * and silently unbinding somebody's other key is worse than telling them.
   */
  conflicts(action: string, code: string): string[] {
    return this.actions()
      .filter((other) => other.id !== action && other.keys[0] === code)
      .map((other) => other.id);
  }

  /** Back to `config/input.json`, discarding every rebind. */
  resetBindings(): void {
    this.#bindings.clear();
    for (const [action, binding] of Object.entries(this.#config.actions)) {
      this.#bindings.set(action, [...binding.keys]);
    }
  }

  /** Applies a saved override set over the defaults. Unknown actions are ignored. */
  applyBinds(binds: Record<string, string>): void {
    this.resetBindings();
    for (const [action, code] of Object.entries(binds)) this.setBinding(action, code);
  }

  get mouseSensitivity(): number {
    return this.#sensitivity;
  }

  /** Whether pushing the mouse forward looks up. Read by `applyLook`. */
  get invertY(): boolean {
    return this.#invertY;
  }

  /** Options menu. Takes effect on the very next look sample. */
  setMouse(options: { sensitivity: number; invertY: boolean }): void {
    this.#sensitivity = options.sensitivity;
    this.#invertY = options.invertY;
  }

  /** Call once per rendered frame, after every substep has read input. */
  endFrame(): void {
    this.#pressed.clear();
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
  }
}
