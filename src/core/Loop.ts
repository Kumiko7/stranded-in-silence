/**
 * Fixed-step simulation loop with a variable-rate render step.
 *
 * Gameplay systems update at a fixed dt so host and client sims stay
 * deterministic-ish and network reconciliation has a stable tick to talk about.
 * Rendering interpolates between the last two sim states.
 */
export interface LoopSystem {
  /** Fixed-step simulation. `dt` is always the same value. */
  fixedUpdate?(dt: number, tick: number): void;
  /** Variable-step. `alpha` is 0..1 progress between the last two sim ticks. */
  render?(dt: number, alpha: number): void;
}

export interface LoopOptions {
  /** Simulation ticks per second. */
  tickRateHz: number;
  /** Guard against spiral-of-death after a tab stall. */
  maxSubStepsPerFrame: number;
}

export class Loop {
  #systems: LoopSystem[] = [];
  #running = false;
  #rafId = 0;
  #accumulator = 0;
  #lastTime = 0;
  #tick = 0;
  readonly #fixedDt: number;
  readonly #maxSubSteps: number;

  constructor(options: LoopOptions) {
    this.#fixedDt = 1 / options.tickRateHz;
    this.#maxSubSteps = options.maxSubStepsPerFrame;
  }

  add(system: LoopSystem): () => void {
    this.#systems.push(system);
    return () => {
      const i = this.#systems.indexOf(system);
      if (i >= 0) this.#systems.splice(i, 1);
    };
  }

  get tick(): number {
    return this.#tick;
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#lastTime = performance.now();
    this.#accumulator = 0;
    this.#rafId = requestAnimationFrame(this.#frame);
  }

  stop(): void {
    this.#running = false;
    cancelAnimationFrame(this.#rafId);
  }

  #frame = (now: number): void => {
    if (!this.#running) return;
    this.#rafId = requestAnimationFrame(this.#frame);

    const frameDt = Math.min((now - this.#lastTime) / 1000, 0.25);
    this.#lastTime = now;
    this.#accumulator += frameDt;

    let steps = 0;
    while (this.#accumulator >= this.#fixedDt && steps < this.#maxSubSteps) {
      for (const system of this.#systems) system.fixedUpdate?.(this.#fixedDt, this.#tick);
      this.#accumulator -= this.#fixedDt;
      this.#tick++;
      steps++;
    }
    if (steps === this.#maxSubSteps) this.#accumulator = 0; // we fell behind; drop the debt

    const alpha = this.#accumulator / this.#fixedDt;
    for (const system of this.#systems) system.render?.(frameDt, alpha);
  };
}
