/**
 * The one bridge between the desktop shell and the game.
 *
 * `sandbox` is left ON in `main.cjs`, so this file has no `fs` and no `path` -
 * which is the point. The profile is read and written by the main process; the
 * renderer is handed two functions and never learns where the file is.
 *
 * CommonJS is not a style choice here: a sandboxed preload cannot be ESM.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('strandedShell', {
  save: {
    /**
     * Synchronous because `Save.load()` is, and `Save.load()` is synchronous
     * because the chosen language lives in the profile and i18n is initialised
     * from it before anything is drawn (docs/ARCHITECTURE.md -> boot sequence).
     * One blocking call, once, on one small file.
     */
    read: () => ipcRenderer.sendSync('save:read'),
    /** Fire and forget: an options slider writes on every change. */
    write: (value) => ipcRenderer.send('save:write', value),
  },
  /**
   * The two things a page cannot do for itself. Fullscreen goes through the
   * window rather than through `requestFullscreen()` because the DOM call needs
   * a user gesture and restoring the setting at boot has none; quitting has no
   * web equivalent at all, which is why the button only exists here.
   */
  window: {
    setFullscreen: (on) => ipcRenderer.send('window:fullscreen', Boolean(on)),
    quit: () => ipcRenderer.send('window:quit'),
  },
});
