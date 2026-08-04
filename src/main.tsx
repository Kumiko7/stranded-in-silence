/**
 * Entry point. Owns the boot sequence, the frame loop and the menu <-> run flow.
 *
 * Boot order (docs/ARCHITECTURE.md section 4):
 *   config -> i18n -> render -> input -> audio -> ui -> net -> loop
 */
import * as THREE from 'three';
import { render } from 'preact';
import { loadConfig } from './config/index';
import { initI18n, t } from './i18n/index';
import { randomSeed } from './core/rng';
import { Loop } from './core/Loop';
import { Renderer } from './render/Renderer';
import { Input } from './input/index';
import { Audio } from './audio/index';
import { attachUiSounds } from './audio/uiSounds';
import { Net, makeLobbyCode } from './net/index';
import { VoiceChat } from './voice/index';
import { Game } from './game/Game';
import { mountVoiceIndicator } from './ui/hud/voiceIndicator';
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
  const hudRoot = document.getElementById('hud-root');
  if (!canvas || !screenRoot || !hudRoot) throw new Error('missing #game-canvas, #screen-root or #hud-root');

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

  // Rendering the Tone.js sound recipes needs no user gesture, so it starts now
  // and finishes long before anything asks to be played.
  const audio = new Audio(config.audio);
  void audio.init().catch((error: unknown) => console.warn('[audio] failed to load', error));
  const detachUiSounds = attachUiSounds(audio, screenRoot);
  audio.music.setScene('menu');

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
    promptItemKey: null,
    promptHold: false,
    holdProgress: 0,
    interactKey: input.labelFor('interact'),
    hands: { left: null, right: null },
    useLeftKey: input.labelFor('useLeft'),
    useRightKey: input.labelFor('useRight'),
    hint: null,
    health: 'healthy',
    roster: [],
    showRoster: config.ui.hud.teammateList.enabled,
    voice: {
      mode: config.net.voice.enabled ? config.net.voice.defaultMode : 'off',
      modes: config.net.voice.modes,
      speaking: [],
      muted: [],
      selfMuted: false,
      errorKey: null,
      pushToTalkKey: input.labelFor('pushToTalk'),
      showInRoster: config.ui.hud.teammateList.showVoiceIndicator,
    },
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
    onDoorUnlocked: (doorId) => game.setDoorUnlocked(doorId),
    onChestOpened: (chestId) => game.openChest(chestId),
    onItemTaken: (id) => game.takeWorldItem(id),
    onItemDropped: (id, itemId, x, y, z) => game.dropWorldItem(id, itemId, x, y, z),
    onNoise: (id, kind, x, z) => game.addNoise(id, kind, x, z),
    onEnemy: (transform) => game.setEnemyTransform(transform),
    onHit: () => game.takeHit(),
    onHealth: (id, health) => game.setRemoteHealth(id, health),
    onRevive: () => game.reviveLocal(),
    onPeerEscaped: (id) => game.markEscaped(id),
    onWiped: () => game.endWiped(),
    onVoiceStream: (id, stream) => voice.addPeer(id, stream),
    onVoiceEnded: (id) => voice.removePeer(id),
    onStatus: (status) => console.info('[net]', status),
  }, config.net.voice);

  /* --- voice -------------------------------------------------------------- */

  const voice = new VoiceChat(config.net.voice, audio, net);
  const voiceHud = mountVoiceIndicator(hudRoot, config.ui.hud.voiceIndicator);

  /* --- game --------------------------------------------------------------- */

  const game = new Game(config, renderer, input, net, audio, voice, {
    onInteractTargetChange: (target) =>
      set({
        promptVerbKey: target?.verbKey ?? null,
        promptItemKey: target?.itemNameKey ?? null,
        promptHold: target?.hold ?? false,
        hint: target?.kind === 'locked' ? 'hud.objective.needKey' : null,
      }),
    onHoldProgress: (progress) => set({ holdProgress: progress }),
    onHandsChange: (hands) =>
      set({
        hands: {
          left: config.items.items[hands.left ?? '']?.nameKey ?? null,
          right: config.items.items[hands.right ?? '']?.nameKey ?? null,
        },
      }),
    onEscaped: () => {
      input.releasePointerLock();
      set({ screen: 'escaped' });
    },
    onPlayerCountChange: (count) => set({ players: count }),
    onHealthChange: (health) => set({ health }),
    onRosterChange: (roster) => set({ roster }),
    onWiped: () => {
      input.releasePointerLock();
      set({ screen: 'wiped' });
    },
  });

  function enterRun(mapId: string, seed: number, slot = 0): void {
    game.start(mapId, seed, slot);
    set({ screen: 'run', promptVerbKey: null, holdProgress: 0, hint: null, health: 'healthy' });
    input.requestPointerLock();
  }

  function leaveRun(): void {
    game.end();
    input.releasePointerLock();
    set({ screen: 'menu', promptVerbKey: null, holdProgress: 0, hint: null, players: 1, health: 'healthy' });
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
    onVoiceMode: (mode) => {
      voice.setMode(mode);
      pushVoice();
    },
    onVoiceSelfMute: () => {
      voice.toggleSelfMute();
      pushVoice();
    },
    onVoiceMutePeer: (id) => {
      voice.toggleMute(id);
      pushVoice();
    },
  };

  /**
   * Voice state reaches the vdom only when it actually changed - who is talking
   * flips a few times a second, and the input level (which moves every frame)
   * goes to the plain-DOM pill instead.
   */
  let voiceSignature = '';

  function pushVoice(): void {
    const status = voice.status();
    const signature = [status.mode, status.selfMuted, status.errorKey, ...status.speaking, '|', ...status.muted].join();
    if (signature === voiceSignature) return;

    voiceSignature = signature;
    set({
      voice: {
        ...state.voice,
        mode: status.mode,
        speaking: status.speaking,
        muted: status.muted,
        selfMuted: status.selfMuted,
        errorKey: status.errorKey,
      },
    });
  }

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
    Object.assign(window, { __stranded: { config, renderer, game, net, input, audio, voice, state, THREE } });
  }

  const loop = new Loop({ tickRateHz: 60, maxSubStepsPerFrame: 5 });
  loop.add({
    fixedUpdate: (dt) => {
      if (game.active) game.update(dt, state.screen === 'run');
    },
    render: () => {
      renderer.render();
      // The pill shows while voice can actually do something - a solo run has
      // nobody to talk to, so it says nothing at all. The pause menu counts as
      // showing: you can still be heard while the world is standing still.
      const status = voice.status();
      voiceHud.update(status, game.active && status.live, state.voice.pushToTalkKey);
      pushVoice();
      input.endFrame();
    },
  });
  loop.start();

  addEventListener('beforeunload', () => {
    detachInput();
    detachUiSounds();
    voiceHud.unmount();
    voice.dispose();
    void net.close();
  });
}

boot().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error), error));
