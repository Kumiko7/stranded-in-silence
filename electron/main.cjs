/**
 * The desktop shell. See docs/ARCHITECTURE.md -> "The desktop build".
 *
 * It owns three things and deliberately nothing else: a window, a way to serve
 * the built game to it, and the profile file. The game itself is the same
 * bundle the browser runs - there is no desktop-only code path in `src/`, and
 * the only thing it can tell is that `window.strandedShell` exists.
 *
 * CommonJS on purpose. The package is `"type": "module"`, but a preload script
 * must be CommonJS while `sandbox` is on, and having the two halves of the
 * shell written the same way is worth more than the module syntax.
 */
const { app, BrowserWindow, Menu, ipcMain, net, protocol, session } = require('electron');
const { mkdirSync, readFileSync, renameSync, writeFileSync } = require('node:fs');
const { dirname, join, normalize, sep } = require('node:path');
const { pathToFileURL } = require('node:url');

/** What `vite build` produced. Inside the asar archive once packaged. */
const DIST = join(__dirname, '..', 'dist');
/** Vite's default. `STRANDED_DEV_URL` covers the port it falls back to. */
const DEV_URL = process.env.STRANDED_DEV_URL || 'http://localhost:5173';

/**
 * A custom scheme rather than `file://`, for two reasons that both bite.
 *
 * `file://` is not a **secure context** in Chromium, so `getUserMedia` is
 * refused there and the whole voice system - which is the point of the game -
 * would never open a microphone. And an **absolute asset path** (`/ui/menu/…`,
 * which is how everything in `assets/` is addressed) has no meaning under it.
 * A privileged standard scheme fixes both without a local HTTP server.
 */
protocol.registerSchemesAsPrivileged([
  { scheme: 'game', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

/** Where the profile lives: the OS's per-user application data directory. */
function profilePath() {
  return join(app.getPath('userData'), 'profile.json');
}

/** Serves `dist/` at `game://bundle/…`. Nothing outside it is reachable. */
function serveBundle() {
  protocol.handle('game', (request) => {
    const target = join(DIST, normalize(decodeURIComponent(new URL(request.url).pathname)));

    // The handler runs with the main process's file permissions, so a request
    // is only ever allowed to name something inside dist/.
    if (target !== DIST && !target.startsWith(DIST + sep)) {
      return new Response('', { status: 403 });
    }
    return net.fetch(pathToFileURL(target).toString());
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    // The menu's own backdrop, so the frame does not flash white on the way up.
    backgroundColor: '#07080c',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      // The renderer talks to arbitrary peers over WebRTC, so it keeps every
      // default that isolates it: no Node, a context of its own, and the
      // Chromium sandbox left on. `preload.cjs` is written to survive that.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Chromium throttles timers and rAF in a window that is not in front.
      // The host simulates the run for everybody, so a host who alt-tabs must
      // not stop the game for the other three.
      backgroundThrottling: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  /*
   * The browser's own shortcuts, gone.
   *
   * Nearly all of them - Ctrl+W, Ctrl+R, Ctrl+Q, Ctrl+Shift+I, the zoom pair -
   * are accelerators on Electron's default application menu, so removing the
   * menu removes them. That is deliberately how it is done rather than by
   * swallowing key combinations: `before-input-event` stops a key reaching the
   * PAGE as well, and Ctrl+W is what walking forward while crouched looks like.
   *
   * Ctrl+wheel is not a menu accelerator, so pinch zoom is pinned separately.
   */
  win.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});

  // Nothing else can open devtools once the menu is gone, and a desktop build
  // with no way in is its own kind of problem. Dev only, and deliberately NOT
  // F11 - that is the game's fullscreen bind, and swallowing it here would take
  // it off the page.
  if (!app.isPackaged) {
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || input.key !== 'I' || !input.control || !input.shift) return;
      event.preventDefault();
      win.webContents.toggleDevTools();
    });
  }

  // A blank window with no explanation is the worst way to find out that the
  // dev server is not running, which is the usual cause.
  win.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`[shell] could not load ${url} (${code} ${description})`);
  });

  // The game never opens a window or navigates. Anything that tries is not us.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  void win.loadURL(useDist() ? 'game://bundle/index.html' : DEV_URL);
  return win;
}

/** Whether to serve the built bundle. `--dist` tests it without packaging. */
function useDist() {
  return app.isPackaged || process.argv.includes('--dist');
}

/* --- the profile ---------------------------------------------------------- */

/*
 * `src/save/` holds the numbers and knows nothing about where they go; this is
 * the other side of the adapter seam it was written against. The renderer never
 * learns the path - it hands over a string and gets one back.
 */

ipcMain.on('save:read', (event) => {
  try {
    event.returnValue = readFileSync(profilePath(), 'utf8');
  } catch {
    // No file yet is a first run, not a failure. `Save` makes a fresh profile.
    event.returnValue = null;
  }
});

ipcMain.on('save:write', (_event, value) => {
  if (typeof value !== 'string') return;

  const target = profilePath();
  try {
    mkdirSync(dirname(target), { recursive: true });
    // Written beside it and renamed over the top: a rename is atomic, so a
    // crash half way through a write cannot leave a half-profile behind. The
    // game treats an unreadable profile as a fresh one, which is exactly the
    // data loss this avoids.
    writeFileSync(`${target}.tmp`, value, 'utf8');
    renameSync(`${target}.tmp`, target);
  } catch (error) {
    console.error('[shell] could not write the profile', error);
  }
});

/* --- the window ----------------------------------------------------------- */

ipcMain.on('window:fullscreen', (event, on) => {
  BrowserWindow.fromWebContents(event.sender)?.setFullScreen(Boolean(on));
});

// The main menu's Quit. `app.quit()` rather than closing the window, so macOS
// leaves too - a game that vanishes but stays in the dock has not quit.
ipcMain.on('window:quit', () => app.quit());

/* --- lifecycle ------------------------------------------------------------ */

// Deliberately NO single-instance lock: two copies on one machine is how this
// game is tested, and four players is what it is for.

void app.whenReady().then(() => {
  // The microphone is proximity voice, and voice is how the game is played.
  // Everything else a page can ask for, it has no business asking for.
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(permission === 'media' || permission === 'fullscreen' || permission === 'pointerLock');
  });

  // Takes the whole default menu with it, and every accelerator on it. A game
  // has no File menu, and Ctrl+W closing the window mid-run is not a feature.
  Menu.setApplicationMenu(null);

  serveBundle();
  createWindow();

  // macOS keeps the process alive with no windows; clicking the dock re-opens.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
