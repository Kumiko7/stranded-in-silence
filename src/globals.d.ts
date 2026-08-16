/** Things that exist outside the module graph. */

/**
 * The desktop shell's bridge (`electron/preload.cjs`), or `undefined` in a
 * browser. Its presence is the ONLY thing the game can tell about being
 * packaged, and it is deliberately the only thing it needs to.
 */
interface StrandedShell {
  save: {
    read(): string | null;
    write(value: string): void;
  };
  /** The things a page cannot do for itself - here, or at all. */
  window: {
    setFullscreen(on: boolean): void;
    quit(): void;
    /**
     * Asks for the mouse back with the shell vouching that it was a gesture.
     * Escape does not grant transient activation, so after Escape has let the
     * pointer go the page cannot ask for it back - which is why Escape can
     * open the pause menu in a browser but never close it back into the game.
     */
    grabPointer(): void;
  };
  /**
   * Copying the lobby code. A page can normally do this itself, but the shell's
   * permission handler is deliberately narrow and the async clipboard is behind
   * one of the permissions it refuses.
   */
  clipboard: {
    write(text: string): void;
  };
}

interface Window {
  strandedShell?: StrandedShell;
}
