/**
 * Fixed-step simulation with a variable-rate render step.
 *
 * The simulation runs at one rate and the display at another, on purpose. A
 * machine drawing 30 frames a second takes two steps in some of them; one
 * drawing 240 takes none in most. Both reach the same world state after the
 * same second of real time, and that is the whole contract: the host simulates
 * the run for everybody, so what the host's graphics card is doing must not
 * change how fast the hunter walks.
 *
 * Three things make that true rather than merely intended.
 *
 * **Debt is caught up, within reason.** A frame that took 200 ms owes three
 * steps and pays them. Past `maxCatchUpSeconds` the debt is written off instead,
 * because a machine that cannot afford the backlog only falls further behind
 * paying it - each frame would owe more than the last until the tab stops
 * responding. Writing it off means the world runs slow on that machine for as
 * long as it is struggling, which for a client costs nothing (it is drawing
 * everybody else from a buffer that has its own clock) and for a host is the
 * least bad of the available answers.
 *
 * **Frames are not the only thing that can drive it.** `requestAnimationFrame`
 * stops in a window that is not in front, and a host who alt-tabs would stop
 * simulating the run for three other people. So when no frame has arrived for
 * `stallPumpMs` the steps are taken from a timer instead. Chromium exempts a
 * page with a live peer connection from its worst timer throttling, which is
 * exactly the case this is for.
 *
 * **Presentation gets `alpha`.** The renderer runs between two simulation
 * states and is told how far between them it is, so a 144 Hz display draws 144
 * distinct positions out of 60 simulated ones rather than showing each of the
 * 60 twice and stuttering on the remainder.
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
  /** How much real time one pass may catch up before the rest is written off. */
  maxCatchUpSeconds: number;
  /** No frame for this long and the steps are taken from a timer instead. */
  stallPumpMs: number;
}

export class Loop {
  #systems: LoopSystem[] = [];
  #running = false;
  #rafId = 0;
  #pumpId: ReturnType<typeof setInterval> | null = null;
  #accumulator = 0;
  #lastTime = 0;
  /** When a frame last arrived, so the pump knows whether it is needed. */
  #lastFrame = 0;
  #tick = 0;
  readonly #fixedDt: number;
  readonly #maxCatchUp: number;
  readonly #stallPumpMs: number;

  constructor(options: LoopOptions) {
    this.#fixedDt = 1 / options.tickRateHz;
    this.#maxCatchUp = options.maxCatchUpSeconds;
    this.#stallPumpMs = options.stallPumpMs;
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
    this.#lastFrame = this.#lastTime;
    this.#accumulator = 0;
    this.#rafId = requestAnimationFrame(this.#frame);
    // Half the stall window, so a stall is noticed within one pump rather than
    // after two of them.
    this.#pumpId = setInterval(this.#pump, Math.max(16, this.#stallPumpMs / 2));
  }

  stop(): void {
    this.#running = false;
    cancelAnimationFrame(this.#rafId);
    if (this.#pumpId !== null) clearInterval(this.#pumpId);
    this.#pumpId = null;
  }

  /**
   * Takes whatever steps the clock says are owed. Returns nothing to the caller
   * because both callers want the same thing: the world brought up to now.
   */
  #advance(now: number): void {
    // A single enormous gap - a laptop lid, a breakpoint - is not debt anybody
    // wants paid. It is capped before it is banked rather than after, so the
    // accumulator can never hold more than one pass can plausibly clear.
    const elapsed = Math.min((now - this.#lastTime) / 1000, this.#maxCatchUp);
    this.#lastTime = now;
    this.#accumulator += elapsed;

    // Two budgets, both `maxCatchUpSeconds`: how much simulated time one pass
    // may cover, and how much real time it may spend covering it. The second is
    // what stops the spiral on a machine that genuinely cannot keep up - each
    // step there costs more than it buys, and without it the tab locks solid
    // trying to pay a debt that grows while it is being paid.
    const budgetEndsAt = now + this.#maxCatchUp * 1000;
    let simulated = 0;
    while (this.#accumulator >= this.#fixedDt && simulated < this.#maxCatchUp) {
      for (const system of this.#systems) system.fixedUpdate?.(this.#fixedDt, this.#tick);
      this.#accumulator -= this.#fixedDt;
      this.#tick++;
      simulated += this.#fixedDt;
      if (performance.now() >= budgetEndsAt) break;
    }

    // Still owing after the budget is spent: this machine is not keeping up, so
    // the rest is written off rather than carried into the next pass.
    if (this.#accumulator >= this.#fixedDt) this.#accumulator = 0;
  }

  #frame = (now: number): void => {
    if (!this.#running) return;
    this.#rafId = requestAnimationFrame(this.#frame);

    const frameDt = (now - this.#lastFrame) / 1000;
    this.#lastFrame = now;

    this.#advance(now);

    const alpha = this.#accumulator / this.#fixedDt;
    for (const system of this.#systems) system.render?.(Math.min(frameDt, 0.25), alpha);
  };

  /**
   * Keeps the simulation running when frames have stopped arriving. It never
   * draws: there is nothing to draw to in a window nobody is looking at, and
   * the point is only that the host's world does not stand still in it.
   */
  #pump = (): void => {
    if (!this.#running) return;
    const now = performance.now();
    if (now - this.#lastFrame < this.#stallPumpMs) return;
    this.#advance(now);
  };
}
