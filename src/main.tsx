/**
 * Entry point. Owns the boot sequence, the frame loop and the
 * menu <-> lobby <-> run flow.
 *
 * Boot order (docs/ARCHITECTURE.md section 4):
 *   config -> save -> i18n -> render -> input -> audio -> ui -> net -> loop
 */
import * as THREE from 'three';
import { render } from 'preact';
import { enabledMapIds, loadConfig, lobbyGraphics } from './config/index';
import { currentLocale, initI18n, setLocale, t } from './i18n/index';
import { initKeys } from './ui/keys';
import { applyTheme } from './ui/theme';
import { Loop } from './core/Loop';
import { Renderer } from './render/Renderer';
import { Input } from './input/index';
import { Audio } from './audio/index';
import { attachUiSounds } from './audio/uiSounds';
import { Net, makeLobbyCode, type RunStart } from './net/index';
import { Save, type Options } from './save/index';
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
const IN_SESSION: readonly Screen[] = ['lobby', 'lobbyPaused', 'wardrobe', 'loading', 'run', 'paused', 'scoreboard'];

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

  // The save profile comes BEFORE i18n, because it is where the chosen language
  // lives. A profile that has never picked one passes undefined and i18n falls
  // back to the browser's.
  const save = new Save(config);
  save.load();
  initI18n(save.options.locale ?? undefined);
  initKeys(config.input);
  applyTheme(config.ui.theme);
  document.documentElement.lang = currentLocale();

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

  /**
   * The one place the saved options become live settings. Called at boot and on
   * every change, so "apply" and "restore on load" are the same code path and
   * cannot drift apart.
   *
   * It lives here rather than in `save/` because these are three different
   * subsystems and `save/` is not allowed to know about any of them - it holds
   * the numbers, this owns the boot order that hands them out.
   */
  function applyOptions(options: Options): void {
    for (const [bus, volume] of Object.entries(options.volumes)) audio.setBusVolume(bus, volume);
    renderer.setFov(options.graphics.fovDegrees);
    renderer.setBrightness(options.graphics.brightness);
    renderer.setShadows(options.graphics.shadows);
    input.setMouse(options.controls);
    input.applyBinds(options.binds);
  }

  applyOptions(save.options);

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
    loadingReady: 0,
    loadingTotal: 1,
    colours: config.player.customisation.colours,
    colourId: save.profile.colourId ?? config.player.customisation.defaultColourId,
    promptVerbKey: null,
    promptItemKey: null,
    promptHold: false,
    holdProgress: 0,
    interactKey: input.bindingFor('interact'),
    hands: { left: null, right: null },
    useLeftKey: input.bindingFor('useLeft'),
    useRightKey: input.bindingFor('useRight'),
    use: null,
    coins: 0,
    bankedCoins: save.profile.coins,
    showCoins: config.ui.hud.coins.enabled,
    showEmptyCoins: config.ui.hud.coins.showWhenEmpty,
    hint: null,
    health: 'healthy',
    roster: [],
    showRoster: config.ui.hud.teammateList.enabled,
    scoreboard: [],
    categories: config.game.scoring.categories,
    optionsOpen: false,
    options: save.options,
    optionRanges: save.ranges,
    buses: config.audio.buses,
    actions: input.actions(),
    localeToken: 0,
    voice: {
      mode: config.net.voice.enabled ? config.net.voice.defaultMode : 'off',
      modes: config.net.voice.modes,
      speaking: [],
      muted: [],
      selfMuted: false,
      errorKey: null,
      pushToTalkKey: input.bindingFor('pushToTalk'),
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
    onLoading: (ready, total) => set({ loadingReady: ready, loadingTotal: total }),
    onRunGo: () => releaseRun(),
    onHostLost: () => hostLost(),
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
    // A peer who walked back to the cabin has left this world, and one who has
    // just arrived in it will be added by their first transform.
    onScene: (id, scene) => {
      if (scene !== 'run') game.removeRemote(id);
      if (scene !== 'lobby') lobby.removeRemote(id);
    },
    onDoor: (doorId, open) => game.setDoor(doorId, open),
    onDoorRequest: (doorId, open) => game.applyDoorRequest(doorId, open),
    onClaim: (kind, id) => game.arbitrate(kind, id),
    onGranted: (kind, id, by, value) => game.applyGrant(kind, id, by, value),
    onDenied: (kind, id) => game.applyDeny(kind, id),
    onItemDropped: (id, itemId, x, y, z) => game.dropWorldItem(id, itemId, x, y, z),
    onItemThrown: (id, itemId, owner, from, velocity) => game.throwItem(id, itemId, owner, from, velocity),
    onBarricade: (doorId, seconds) => game.setDoorBarricade(doorId, seconds),
    onHealed: (toState) => game.healLocal(toState),
    onCoins: (amount) => game.addCoins(amount),
    onNoise: (id, kind, x, z) => game.addNoise(id, kind, x, z),
    onEnemy: (transform) => game.setEnemyTransform(transform),
    onHit: () => game.takeHit(),
    onHealth: (id, health) => game.setRemoteHealth(id, health),
    onRevive: () => game.reviveLocal(),
    onPeerEscaped: (id) => game.markEscaped(id),
    onStats: (id, stats) => game.setStats(id, stats),
    onWiped: () => game.endWiped(),
    onVoiceStream: (id, stream) => voice.addPeer(id, stream),
    onVoiceEnded: (id) => voice.removePeer(id),
    onStatus: (status) => console.info('[net]', status),
  }, config.net);

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
    onUseChange: (use) => set({ use }),
    onCoinsChange: (coins) => set({ coins }),
    onEscaped: (coins) => {
      // The tick on a poster is earned by getting out YOURSELF. A team that
      // escapes without you does not mark your card - and neither does it bank
      // your share of the purse.
      if (currentRun) save.markCompleted(currentRun.mapId);
      save.addCoins(coins);
      input.releasePointerLock();
      set({ screen: 'scoreboard', bankedCoins: save.profile.coins, use: null });
    },
    onPlayerCountChange: (count) => set({ players: count }),
    onHealthChange: (health) => set({ health }),
    onRosterChange: (roster) => set({ roster }),
    // Fired again as late tallies arrive, so a column cannot sit at zero
    // because a teammate's last message was still in flight.
    onScoreboard: (rows) => set({ scoreboard: rows }),
    onWiped: () => {
      input.releasePointerLock();
      set({ screen: 'scoreboard' });
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
      optionsOpen: false,
      promptVerbKey: null,
      promptItemKey: null,
      holdProgress: 0,
      hint: null,
      health: 'healthy',
      use: null,
      coins: 0,
      bankedCoins: save.profile.coins,
      scoreboard: [],
    });
    input.requestPointerLock();
    // The cabin has no loading card to hide behind, but it is one room and its
    // warm-up is quick. Doing it here still beats compiling the fire's shader
    // on the frame you first turn to look at it.
    void renderer.warmUp().catch((error: unknown) => console.warn('[render] shader warm-up failed', error));
  }

  /**
   * The load gate. Everybody generates the same map from the same seed, but not
   * at the same speed, so the world is built behind the loading card and then
   * held there until the host says everyone is in (`src/net/index.ts`). Nothing
   * simulates in the meantime: dropping into a run already underway, alone,
   * with the hunter awake, is the one thing a shared start has to prevent.
   */
  let worldBuilt = false;
  let goGiven = false;

  /**
   * Leaves the cabin standing for one paint so the loading card is on screen
   * before the map generator blocks the thread. Voice is untouched throughout -
   * that is the whole point of it following the session rather than the run.
   */
  function startRun(run: RunStart, slot = net.slot): void {
    if (state.screen === 'loading' || state.screen === 'run') return;
    worldBuilt = false;
    goGiven = false;
    set({ screen: 'loading', loadingReady: 0, loadingTotal: state.players });
    requestAnimationFrame(() => beginRun(run, slot));
  }

  function beginRun(run: RunStart, slot: number): void {
    currentRun = run;
    lobby.end();
    net.setScene('run');
    game.start(run.mapId, run.seed, slot);
    set({
      lobby: null,
      optionsOpen: false,
      scoreboard: [],
      promptVerbKey: null,
      promptItemKey: null,
      holdProgress: 0,
      hint: null,
      health: 'healthy',
      use: null,
      coins: 0,
    });

    // Shaders and shadow maps before anyone reports in. Both are one-off costs
    // three.js otherwise pays on the frame a room first comes into view, and
    // both are long enough to be felt as a freeze - the loading card is exactly
    // the right place for them. A driver that refuses is not worth failing a
    // run over; the old lazy behaviour is the fallback.
    void renderer
      .warmUp()
      .catch((error: unknown) => console.warn('[render] shader warm-up failed', error))
      .then(() => {
        // The player may have given up on the load and walked out in the meantime.
        if (currentRun !== run) return;
        worldBuilt = true;
        // Solo and on the host with nobody else waiting, this comes straight back.
        net.reportReady();
        if (goGiven) releaseRun();
      });
  }

  /** Everyone is in. The card lifts and the run actually starts running. */
  function releaseRun(): void {
    goGiven = true;
    if (!worldBuilt || state.screen !== 'loading') return;
    set({ screen: 'run' });
    input.requestPointerLock();
  }

  /** No host, no session: there is no migration, by design. */
  function hostLost(): void {
    if (state.screen === 'menu') return;
    leaveSession();
    set({ error: t('lobby.hostLeft') });
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
    set({
      screen: 'menu',
      lobby: null,
      players: 1,
      optionsOpen: false,
      scoreboard: [],
      promptVerbKey: null,
      hint: null,
      health: 'healthy',
      use: null,
      coins: 0,
    });
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
    onOpenOptions: () => {
      // Opening options from inside a run drops pointer lock, which is already
      // how the pause menu was reached - so there is nothing to release here.
      set({ optionsOpen: true });
    },
    onCloseOptions: () => set({ optionsOpen: false }),
    onOptionsChange: (patch) => {
      const options = save.setOptions(patch);
      applyOptions(options);
      set({ options });
    },
    onOptionsReset: () => {
      const options = save.resetOptions();
      applyOptions(options);
      setLocale(options.locale ?? navigatorLocale());
      set({ options, ...bindingState(), ...localeState() });
    },
    onLocale: (locale) => {
      setLocale(locale);
      const options = save.setOptions({ locale });
      // Every t() in the tree now returns something else, and none of them are
      // props - the token is what makes the whole thing re-render.
      set({ options, ...localeState() });
    },
    onRebind: (action, code) => {
      if (!input.setBinding(action, code)) return [];
      const options = save.setOptions({ binds: { ...save.options.binds, [action]: code } });
      set({ options, ...bindingState() });
      return input.conflicts(action, code);
    },
    onResetBinds: () => {
      const options = save.setOptions({ binds: {} });
      input.applyBinds({});
      set({ options, ...bindingState() });
    },
  };

  /** The bindings the HUD and the Controls tab draw. Re-read after any rebind. */
  function bindingState(): Partial<UiState> {
    return {
      actions: input.actions(),
      interactKey: input.bindingFor('interact'),
      useLeftKey: input.bindingFor('useLeft'),
      useRightKey: input.bindingFor('useRight'),
      voice: { ...state.voice, pushToTalkKey: input.bindingFor('pushToTalk') },
    };
  }

  function localeState(): Partial<UiState> {
    document.documentElement.lang = currentLocale();
    return { localeToken: state.localeToken + 1 };
  }

  function navigatorLocale(): string {
    return navigator.language.split('-')[0] ?? 'en';
  }

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

  // Every screen must be exitable by keyboard (docs/systems/UI.md). Options is
  // the only one layered over another, so it is the only one that needs its own
  // Escape - the rest ride the pointer-lock cue above.
  addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !state.optionsOpen) return;
    event.preventDefault();
    set({ optionsOpen: false });
  });

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

  // Dev-only inspection handle. Stripped from production builds. `set` is on it
  // so a screen that only exists after a full run - the scoreboard - can be put
  // up and looked at without playing one, and `startRun` so a map can be
  // dropped into without walking the cabin first.
  if (import.meta.env.DEV) {
    Object.assign(window, {
      __stranded: { config, renderer, game, lobby, net, input, audio, voice, save, state, set, startRun, enterLobby, THREE },
    });
  }

  const loop = new Loop({ tickRateHz: 60, maxSubStepsPerFrame: 5 });
  loop.add({
    fixedUpdate: (dt) => {
      // Heartbeats, dead-peer detection and the load timeout. It runs in every
      // screen, because a peer can drop while you are staring at a menu.
      net.tick(dt);

      // A world that is built but still behind the loading card presents but
      // does not run: the hunter must not have a head start on whoever loaded
      // last, and the conversation over the top of it must not stop either.
      if (game.active) game.update(dt, state.screen === 'run', goGiven);
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
