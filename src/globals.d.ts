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
  /** The two things a page cannot do for itself. */
  window: {
    setFullscreen(on: boolean): void;
    quit(): void;
  };
}

interface Window {
  strandedShell?: StrandedShell;
}
