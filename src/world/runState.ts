/**
 * Who is still in the run, and whether it is over.
 *
 * Win and lose are stated once, here, from docs/GAMEPLAY.md section 6:
 *   win  - every remaining player has escaped (partial escapes still count)
 *   lose - everybody is downed, dead or disconnected
 *
 * Only the host evaluates this; the outcome is replicated like any other event.
 */
import type { HealthState } from '@/config/types';

export type RunOutcome = 'running' | 'escaped' | 'wiped';

export interface RunPlayer {
  id: string;
  health: HealthState;
  escaped: boolean;
  /**
   * Gone: a closed tab, a dead connection, or somebody who walked out of the
   * run. They keep their place here rather than being deleted, because they
   * still count against the wipe condition and their scoreboard column is still
   * a record of the run everyone else is finishing.
   */
  disconnected: boolean;
}

export class RunState {
  #players = new Map<string, RunPlayer>();

  add(id: string): RunPlayer {
    let player = this.#players.get(id);
    if (!player) {
      player = { id, health: 'healthy', escaped: false, disconnected: false };
      this.#players.set(id, player);
    }
    return player;
  }

  remove(id: string): void {
    this.#players.delete(id);
  }

  clear(): void {
    this.#players.clear();
  }

  setHealth(id: string, health: HealthState): void {
    this.add(id).health = health;
  }

  setEscaped(id: string): void {
    this.add(id).escaped = true;
  }

  setDisconnected(id: string): void {
    const player = this.#players.get(id);
    if (player) player.disconnected = true;
  }

  isDisconnected(id: string): boolean {
    return this.#players.get(id)?.disconnected === true;
  }

  get players(): readonly RunPlayer[] {
    return [...this.#players.values()];
  }

  get(id: string): RunPlayer | undefined {
    return this.#players.get(id);
  }

  /** Out of the run, one way or the other: the spectator side of voice chat. */
  isSpectator(id: string): boolean {
    const player = this.#players.get(id);
    return !!player && (player.escaped || player.health === 'dead');
  }

  /**
   * Still down there somewhere: they have not got out, not given up and not
   * dropped. A downed player counts - they are lying on a floor a spectator can
   * watch, and somebody may yet come back for them.
   */
  isInMap(id: string): boolean {
    const player = this.#players.get(id);
    if (!player || player.disconnected) return false;
    return !player.escaped && player.health !== 'dead';
  }

  /** A player still able to act: not escaped, not on the floor, still here. */
  isActive(id: string): boolean {
    const player = this.#players.get(id);
    if (!player || player.disconnected) return false;
    return !player.escaped && player.health !== 'downed' && player.health !== 'dead';
  }

  evaluate(): RunOutcome {
    const players = this.players;
    if (!players.length) return 'running';
    if (players.some((player) => this.isActive(player.id))) return 'running';
    return players.some((player) => player.escaped) ? 'escaped' : 'wiped';
  }
}
