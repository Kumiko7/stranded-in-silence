/**
 * The corner tutorial line. See docs/systems/UI.md.
 *
 * Deliberately small, and deliberately only the essentials: how to move, that
 * crouching is quiet and sprinting is not, how a run starts, what to look for
 * once it has, and the two moments the hunter changes the situation. Anything a
 * player can work out by trying it is not in here.
 *
 * Two kinds of tip, and they never compete:
 *
 *   task   Offered in order and stays up until the player does the thing. The
 *          cabin's four are all tasks.
 *   flash  Appears when its trigger fires and leaves on a timer. The run's four
 *          are all flashes, because none of them is an instruction to carry out.
 *
 * **Only one is ever on screen.** A tip that arrives while another is up waits
 * its turn rather than replacing it - including the hunter ones, which is a
 * decision worth knowing: a line that shoves another line aside teaches the
 * player to distrust the corner.
 *
 * What a tip does NOT own is when it fires. The id is the seam: `note()` is
 * called with one from wherever the moment actually happens - `main.tsx` for
 * the cabin's input and the start of a run, `Game` for the chest and the
 * hunter - and this decides whether anything is shown for it.
 */
import type { TutorialConfig, TutorialTip } from '@/config/types';
import type { Input } from '@/input/index';
import type { Save } from '@/save/index';

/** Which world is up. `null` is a menu, where nothing is taught. */
export type TutorialScene = 'lobby' | 'run' | null;

/** What the HUD draws. The text is a key, so a language change re-reads it. */
export interface TutorialView {
  id: string;
  textKey: string;
  /** Raw bindings whose caps fill the string's `{key}` gap. May be empty. */
  codes: string[];
}

export interface TutorialHooks {
  /** The line to draw, or null for none. */
  onTip(view: TutorialView | null): void;
  /**
   * There is nothing left to teach. The *switch* in the options menu is what a
   * player sees for this, so it is the thing that has to move - and `main.tsx`
   * owns writing an option through and telling the screen about it, exactly as
   * it does for every other one.
   */
  onRetired(): void;
}

export class Tutorial {
  readonly #config: TutorialConfig;
  readonly #save: Save;
  readonly #input: Input;
  readonly #hooks: TutorialHooks;

  #enabled: boolean;
  #scene: TutorialScene = null;
  #current: TutorialView | null = null;
  /** Seconds the current flash tip has left, or 0 for a task (which waits). */
  #showFor = 0;
  /** Seconds of quiet owed before the next tip may appear. */
  #gap = 0;
  /** Flash tips whose trigger fired while something else was up. */
  #queue: string[] = [];

  constructor(config: TutorialConfig, save: Save, input: Input, hooks: TutorialHooks) {
    this.#config = config;
    this.#save = save;
    this.#input = input;
    this.#hooks = hooks;
    // `ui.json` decides whether the feature exists at all; the profile decides
    // whether this player wants it. Both have to say yes.
    this.#enabled = config.enabled && save.options.tutorial;
  }

  /**
   * The options toggle.
   *
   * Switching it back on **once there is nothing left to teach** is what starts
   * the tips again - it is the only thing a player is left with after the
   * switch turned itself off, so it has to be what asks for them a second time.
   *
   * The restart is decided from the progress rather than from the switch having
   * changed, which matters: the flag here and `options.tutorial` are two copies
   * of one fact, and an edge test quietly does nothing whenever they disagree.
   * Turning it off and on again half way through keeps your place, which is
   * what somebody who did that meant anyway.
   */
  setEnabled(on: boolean): void {
    const enabled = on && this.#config.enabled;
    const restart = enabled && this.#complete();
    if (restart) this.#save.resetTips();
    if (enabled === this.#enabled && !restart) return;

    this.#enabled = enabled;
    this.#clear();
    if (enabled) this.#advance();
  }

  /** Entering a world. The queue does not travel: a cabin tip is a cabin tip. */
  enter(scene: TutorialScene): void {
    if (scene === this.#scene) return;
    this.#scene = scene;
    this.#clear();
    this.#advance();
  }

  /**
   * A trigger fired, or a task was carried out. Both are the same call because
   * they are the same fact: the player has now done this.
   *
   * A task is marked done **whenever it happens**, not only while its own tip
   * is up. Somebody who has already sprinted does not need to be told which key
   * sprints, and telling them anyway is how a tutorial gets turned off.
   */
  note(id: string): void {
    if (!this.#enabled || this.#save.hasSeenTip(id)) return;

    const tip = this.#config.tips.find((candidate) => candidate.id === id);
    if (!tip || tip.scene !== this.#scene) return;

    // Marked here rather than when it is shown: a trigger that fires twice
    // while the first one is still queued must not queue it twice.
    this.#save.markTipSeen(id);
    if (tip.kind === 'flash') this.#queue.push(id);

    if (this.#current?.id === id) {
      this.#current = null;
      this.#showFor = 0;
      this.#gap = this.#config.gapSeconds;
      this.#hooks.onTip(null);
    }

    this.#retire();
    this.#advance();
  }

  /** Ticks the flash timer and the quiet after it. Called from the fixed step. */
  update(dt: number): void {
    if (!this.#enabled) return;

    if (this.#showFor > 0) {
      this.#showFor -= dt;
      if (this.#showFor > 0) return;
      this.#current = null;
      this.#gap = this.#config.gapSeconds;
      this.#hooks.onTip(null);
    }

    if (this.#gap > 0) {
      this.#gap -= dt;
      if (this.#gap > 0) return;
    }

    this.#advance();
  }

  /** Puts the next tip up, if there is one and the slot is free. */
  #advance(): void {
    if (!this.#enabled || this.#current || this.#gap > 0 || !this.#scene) return;

    const queued = this.#queue.shift();
    if (queued) {
      const tip = this.#config.tips.find((candidate) => candidate.id === queued);
      if (tip) this.#show(tip, this.#config.flashSeconds);
      return;
    }

    // Tasks are offered in the order the config lists them, and only ever in
    // their own world.
    const next = this.#config.tips.find(
      (tip) => tip.kind === 'task' && tip.scene === this.#scene && !this.#save.hasSeenTip(tip.id),
    );
    if (next) this.#show(next, 0);
  }

  #show(tip: TutorialTip, seconds: number): void {
    // Read now rather than stored with the tip, so a rebind between one tip and
    // the next is drawn on the cap.
    const codes = (tip.keys ?? []).map((action) => this.#input.bindingFor(action)).filter(Boolean);
    this.#current = { id: tip.id, textKey: `tutorial.${tip.id}`, codes };
    this.#showFor = seconds;
    this.#hooks.onTip(this.#current);
  }

  /** Nothing left to teach: go quiet, and let `main.tsx` move the switch. */
  #retire(): void {
    if (!this.#complete()) return;
    this.#enabled = false;
    this.#clear();
    this.#hooks.onRetired();
  }

  /** Every tip has been through. What retires the tutorial, and what restarts it. */
  #complete(): boolean {
    return this.#config.tips.every((tip) => this.#save.hasSeenTip(tip.id));
  }

  #clear(): void {
    this.#queue = [];
    this.#showFor = 0;
    this.#gap = 0;
    if (!this.#current) return;
    this.#current = null;
    this.#hooks.onTip(null);
  }
}
