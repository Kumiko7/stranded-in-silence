/**
 * Entry point. Owns the boot sequence, the frame loop and the
 * menu <-> lobby <-> run flow.
 *
 * Boot order (docs/ARCHITECTURE.md section 4):
 *   config -> i18n -> save -> render -> input -> audio -> ui -> net -> loop
 */
import * as THREE from 'three';
import { render } from 'preact';
import { enabledMapIds, loadConfig, lobbyGraphics } from './config/index';
import { initI18n, t } from './i18n/index';
import { Loop } from './core/Loop';
import { Renderer } from './render/Renderer';
import { Input } from './input/index';
import { Audio } from './audio/index';
import { attachUiSounds } from './audio/uiSounds';
import { Net, makeLobbyCode, type RunStart } from './net/index';
import { Save } from './save/index';
import { VoiceChat } from './voice/index';
import { Game } from './game/Game';
import { Lobby } from './game/Lobby';
import { mountVoiceIndicator } from './ui/hud/voiceIndicator';
import { App, type Screen, type UiCallbacks, type UiPush, type UiState } from './ui/App';

const bootRoot = document.getElementById('boot-root');
const bootStatus = document.getElementById('boot-status');

function fail(reason: string, error?: unknown): void {
  console.error('[boot]', reason, error);
  bootRoot?.classList.add('boot--error');
  if (bootStatus) bootStatus.textContent = reason;
}

/** Screens where the player is in the session and voice should be running. */
const IN_SESSION: readonly Screen[] = ['lobby', 'lobbyPaused', 'wardrobe', 'loading', 'run', 'paused', 'escaped', 'wiped'];

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

  const save = new Save();
  save.load();

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
    maxPlayers: config.game.session.maxPlayers,
    lobby: null,
    colours: config.player.customisation.colours,
    colourId: save.profile.colourId ?? config.player.customisation.defaultColourId,
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

  /** Which map the local player is currently in, so escaping can be recorded. */
  let currentRun: RunStart | null = null;

  /* --- net ---------------------------------------------------------------- */

  // Annotated because the callbacks below reference `lobby`, which is built
  // from `net` - inference would go round in a circle.
  const net: Net = new Net({
    onRunStart: (run, slot) => startRun(run, slot),
    onLobbyJoined: (slot) => enterLobby(slot),
    onLobbyState: (lobbyState) => lobby.applyState(lobbyState),
    onPick: (id, mapId) => lobby.applyPick(id, mapId),
    onDifficulty: (difficultyId) => lobby.applyDifficulty(difficultyId),
    onLobbyMove: (id, x, z, yaw) => lobby.moveRemote(id, x, z, yaw),
    onCosmetic: (id, colourId) => {
      lobby.setRemoteColour(id, colourId);
      game.setRemoteColour(id, colourId);
    },
    // Both scenes keep their own bodies; only the live one has anything to add.
    onPeerJoin: (id) => (lobby.active ? lobby.addRemote(id) : game.addRemote(id)),
    onPeerLeave: (id) => {
      lobby.removeRemote(id);
      game.removeRemote(id);
    },
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
      // The tick on a poster is earned by getting out YOURSELF. A team that
      // escapes without you does not mark your card.
      if (currentRun) save.markCompleted(currentRun.mapId);
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

  /* --- lobby -------------------------------------------------------------- */

  const lobby: Lobby = new Lobby(config, renderer, input, net, audio, voice, save, {
    onInteractTargetChange: (target) =>
      set({
        promptVerbKey: target?.verbKey ?? null,
        promptItemKey: target?.nameKey ?? null,
        promptHold: false,
      }),
    onViewChange: (view) => set({ lobby: view, players: view.players }),
    onWardrobe: (open) => {
      set({ screen: open ? 'wardrobe' : 'lobby' });
      if (open) input.releasePointerLock();
      else input.requestPointerLock();
    },
    onStartRun: (run) => startRun(run, net.slot),
  });

  /* --- flow --------------------------------------------------------------- */

  function enterLobby(slot = 0): void {
    currentRun = null;
    game.end();
    renderer.applyGraphics(lobbyGraphics());
    net.setScene('lobby');
    lobby.start(slot, enabledMapIds());
    set({
      screen: 'lobby',
      promptVerbKey: null,
      promptItemKey: null,
      holdProgress: 0,
      hint: null,
      health: 'healthy',
    });
    input.requestPointerLock();
  }

  /**
   * Leaves the cabin standing for one paint so the loading card is on screen
   * before the map generator blocks the thread. Voice is untouched throughout -
   * that is the whole point of it following the session rather than the run.
   */
  function startRun(run: RunStart, slot = net.slot): void {
    if (state.screen === 'loading' || state.screen === 'run') return;
    set({ screen: 'loading' });
    requestAnimationFrame(() => beginRun(run, slot));
  }

  function beginRun(run: RunStart, slot: number): void {
    currentRun = run;
    lobby.end();
    net.setScene('run');
    game.start(run.mapId, run.seed, slot);
    set({
      screen: 'run',
      lobby: null,
      promptVerbKey: null,
      promptItemKey: null,
      holdProgress: 0,
      hint: null,
      health: 'healthy',
    });
    input.requestPointerLock();
  }

  /** Out of a run and back to the cabin, which is where the next one is chosen. */
  function leaveRun(): void {
    if (net.role === 'host') net.endRun();
    enterLobby(net.slot);
  }

  /** Out of the session entirely. The code stays claimed; the peers do not. */
  function leaveSession(): void {
    game.end();
    lobby.end();
    currentRun = null;
    net.leave();
    renderer.applyGraphics(config.graphics);
    input.releasePointerLock();
    set({ screen: 'menu', lobby: null, players: 1, promptVerbKey: null, hint: null, health: 'healthy' });
  }

  /* --- screens ------------------------------------------------------------ */

  const callbacks: UiCallbacks = {
    onStart: () => {
      // A client must never open its own lobby - it would leave the one it is
      // already in. It follows the host.
      if (net.role === 'client') return;
      net.hostLobby(config.difficulty.default);
      enterLobby(0);
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
      const screen = state.screen === 'lobbyPaused' ? 'lobby' : 'run';
      set({ screen });
      input.requestPointerLock();
    },
    onLeave: leaveRun,
    onLeaveLobby: leaveSession,
    onCloseWardrobe: () => lobby.closeWardrobe(),
    onColour: (id) => {
      lobby.setColour(id);
      set({ colourId: id });
    },
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

  // Escape drops pointer lock, which is our cue to pause. The wardrobe releases
  // it on purpose, so that one is not a pause.
  input.onPointerLockChange = (locked) => {
    if (locked) return;
    if (state.screen === 'run') set({ screen: 'paused' });
    else if (state.screen === 'lobby') set({ screen: 'lobbyPaused' });
  };

  document.addEventListener('pointerlockerror', () => {
    if (state.screen === 'run') {
      console.warn('[input] Pointer lock denied (missing user gesture). Falling back to pause menu.');
      set({ screen: 'paused' });
    } else if (state.screen === 'lobby') {
      set({ screen: 'lobbyPaused' });
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

  // Whatever the wardrobe last saved is what everyone else should see us wearing.
  net.setCosmetic(state.colourId);

  /* --- loop --------------------------------------------------------------- */

  // Dev-only inspection handle. Stripped from production builds.
  if (import.meta.env.DEV) {
    Object.assign(window, { __stranded: { config, renderer, game, lobby, net, input, audio, voice, save, state, THREE } });
  }

  const loop = new Loop({ tickRateHz: 60, maxSubStepsPerFrame: 5 });
  loop.add({
    fixedUpdate: (dt) => {
      if (game.active) game.update(dt, state.screen === 'run');
      else if (lobby.active) lobby.update(dt, state.screen === 'lobby' || state.screen === 'wardrobe');

      // The microphone follows the SESSION, not the run: it opens when you enter
      // the cabin and stays open through the load into a map, so a conversation
      // is never cut off at the door. `voice.live` still needs somebody to talk
      // to, so a solo player is never asked for a microphone at all.
      voice.setActive(IN_SESSION.includes(state.screen));
    },
    render: () => {
      renderer.render();
      // The pill shows while voice can actually do something. The pause menu
      // counts as showing: you can still be heard while the world stands still.
      const status = voice.status();
      voiceHud.update(status, (game.active || lobby.active) && status.live, state.voice.pushToTalkKey);
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
