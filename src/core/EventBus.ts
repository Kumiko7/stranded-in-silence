/**
 * Minimal typed pub/sub. The one allowed way for systems to talk to each other
 * without importing each other. Keeps modules swappable.
 *
 * Event names and payloads live in src/shared/events.ts so every subscriber and
 * publisher agrees on the contract.
 */
export type Handler<T> = (payload: T) => void;

export class EventBus<Events extends Record<string, unknown>> {
  #handlers = new Map<keyof Events, Set<Handler<never>>>();

  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
    let set = this.#handlers.get(event);
    if (!set) {
      set = new Set();
      this.#handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(event, handler);
  }

  once<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
    const off = this.on(event, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off<K extends keyof Events>(event: K, handler: Handler<Events[K]>): void {
    this.#handlers.get(event)?.delete(handler as Handler<never>);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.#handlers.get(event);
    if (!set) return;
    // Copy so handlers may unsubscribe during dispatch.
    for (const handler of [...set]) {
      try {
        (handler as Handler<Events[K]>)(payload);
      } catch (err) {
        console.error(`[EventBus] handler for "${String(event)}" threw`, err);
      }
    }
  }

  clear(): void {
    this.#handlers.clear();
  }
}
