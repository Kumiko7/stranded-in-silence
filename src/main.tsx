/**
 * Entry point. Owns the boot sequence, the frame loop and the menu <-> run flow.
 *
 * Boot order (docs/ARCHITECTURE.md section 4):
 *   config -> i18n -> render -> input -> ui -> net -> loop
 */
import * as THREE from 'three';
import { render } from 'preact';
import { loadConfig } from './config/index';
import { initI18n, t } from './i18n/index';
import { randomSeed } from './core/rng';
import { Loop } from './core/Loop';
import { Renderer } from './render/Renderer';
import { Input } from './input/index';
import { Net, makeLobbyCode } from './net/index';
import { Game } from './game/Game';
import { App, type UiCallbacks, type UiPush, type UiState } from './ui/App';

const bootRoot = document.getElementById('boot-root');
const bootStatus = document.getElementById('boot-status');

function fail(reason: string, error?: unknown): void {
  console.error('[boot]', reason, error);
  bootRoot?.classList.add('boot--error');
  if (bootStatus) bootStatus.textContent = reason;
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  const screenRoot = document.getElementById('screen-root');
  if (!canvas || !screenRoot) throw new Error('missing #game-canvas or #screen-root');

  // Probe on a throwaway canvas: the first getContext call fixes the context
  // attributes for the life of a canvas, so probing the real one would silently
  // discard the renderer's antialias setting.
  if (!document.createElement('canvas').getContext('webgl2')) {
    fail('This browser cannot run WebGL 2. Try a recent Chrome, Edge or Firefox.');
    return;
  }

  const config = loadConfig();
  initI18n();

  const renderer = new Renderer(canvas, config.graphics, config.player);
  const input = new Input(config.input, canvas);
  const detachInput = input.attach();
  addEventListener('resize', () => renderer.resize());

  bootRoot?.remove();

  /* --- ui state ----------------------------------------------------------- */

  let push: UiPush = () => {};
  const state: UiState = {
    screen: 'menu',
    code: '------',
    netStatus: 'connecting',
    error: null,
    players: 1,
    promptVerbKey: null,
    promptHold: false,
    exitProgress: 0,
    interactKey: input.labelFor('interact'),
  };

  const set = (patch: Partial<UiState>): void => {
    Object.assign(state, patch);
    push(patch);
  };

  /* --- net ---------------------------------------------------------------- */

  const net = new Net({
    onRunStart: (mapId, seed, slot) => enterRun(mapId, seed, slot),
    onPeerJoin: (id) => game.addRemote(id),
    onPeerLeave: (id) => game.removeRemote(id),
    onPeerMove: (id, transform) => game.moveRemote(id, transform),
    onDoor: (doorId, open) => game.setDoor(doorId, open),
    onStatus: (status) => console.info('[net]', status),
  });

  /* --- game --------------------------------------------------------------- */

  const game = new Game(config, renderer, input, net, {
    onInteractTargetChange: (target) =>
      set({ promptVerbKey: target?.verbKey ?? null, promptHold: target?.hold ?? false }),
    onExitProgress: (progress) => set({ exitProgress: progress }),
    onEscaped: () => {
      input.releasePointerLock();
      set({ screen: 'escaped' });
    },
    onPlayerCountChange: (count) => set({ players: count }),
  });

  function enterRun(mapId: string, seed: number, slot = 0): void {
    game.start(mapId, seed, slot);
    set({ screen: 'run', promptVerbKey: null, exitProgress: 0 });
    input.requestPointerLock();
  }

  function leaveRun(): void {
    game.end();
    input.releasePointerLock();
    set({ screen: 'menu', promptVerbKey: null, exitProgress: 0, players: 1 });
  }

  /* --- screens ------------------------------------------------------------ */

  const callbacks: UiCallbacks = {
    onStart: () => {
      // A client must never start its own run - it would end up alone in a
      // different map. It enters when the host does.
      if (net.role === 'client') return;

      const mapId = config.maps.defaultMapId;
      const seed = randomSeed();
      net.hostRun(mapId, seed);
      enterRun(mapId, seed, 0);
    },
    onJoin: (code) => {
      set({ netStatus: 'connecting', error: null });
      net
        .join(code)
        .then(() => set({ netStatus: 'ready' }))
        .catch((error: unknown) => {
          console.warn('[net] join failed', error);
          set({ netStatus: 'error', error: t('join.notFound') });
        });
    },
    onResume: () => {
      set({ screen: 'run' });
      input.requestPointerLock();
    },
    onLeave: leaveRun,
  };

  render(
    <App initial={state} callbacks={callbacks} bind={(fn) => { push = fn; }} />,
    screenRoot,
  );

  // Escape drops pointer lock, which is our cue to pause.
  input.onPointerLockChange = (locked) => {
    if (!locked && state.screen === 'run') set({ screen: 'paused' });
  };
  
  document.addEventListener('pointerlockerror', () => {
    if (state.screen === 'run') {
      console.warn('[input] Pointer lock denied (missing user gesture). Falling back to pause menu.');
      set({ screen: 'paused' });
    }
  });

  /* --- connect ------------------------------------------------------------ */

  const code = makeLobbyCode(config.game.session.lobbyCodeAlphabet, config.game.session.lobbyCodeLength);
  net
    .open(code)
    .then(() => set({ code, netStatus: 'ready' }))
    .catch((error: unknown) => {
      console.warn('[net] signalling unavailable', error);
      set({ netStatus: 'error', error: t('error.connectionLost') });
    });

  /* --- loop --------------------------------------------------------------- */

  // Dev-only inspection handle. Stripped from production builds.
  if (import.meta.env.DEV) {
    Object.assign(window, { __stranded: { config, renderer, game, net, input, state, THREE } });
  }

  const loop = new Loop({ tickRateHz: 60, maxSubStepsPerFrame: 5 });
  loop.add({
    fixedUpdate: (dt) => {
      if (game.active) game.update(dt, state.screen === 'run');
    },
    render: () => {
      renderer.render();
      input.endFrame();
    },
  });
  loop.start();

  addEventListener('beforeunload', () => {
    detachInput();
    void net.close();
  });
}

boot().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error), error));
