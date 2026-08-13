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
import { Lobby, type LobbyTarget } from './game/Lobby';
import { Tutorial } from './game/Tutorial';
import { disposePortraits } from './render/portraits';
import { mountVoiceIndicator } from './ui/hud/voiceIndicator';
import { App, type ChatLine, type Screen, type UiCallbacks, type UiPush, type UiState } from './ui/App';

const bootRoot = document.getElementById('boot-root');
const bootStatus = document.getElementById('boot-status');

function fail(reason: string, error?: unknown): void {
  console.error('[boot]', reason, error);
  bootRoot?.classList.add('boot--error');
  if (bootStatus) bootStatus.textContent = reason;
}

/** Screens where the player is in the session and voice should be running. */
const IN_SESSION: readonly Screen[] = [
  'lobby',
  'lobbyPaused',
  'wardrobe',
  'loading',
  'run',
  'paused',
  'spectate',
  'spectatePaused',
  'scoreboard',
];

/**
 * Screens where a line of text can be typed. Chat spans the session rather than
 * the run for the same reason voice does: the cabin is where a plan gets agreed.
 */
const CAN_CHAT: readonly Screen[] = ['lobby', 'run', 'spectate'];

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
  
    // Calculate UI scale relative to a 720p reference resolution
  function updateUiScale(): void {
    const scale = Math.max(0.65, Math.min(window.innerWidth / 1080, window.innerHeight / 720));
    document.documentElement.style.setProperty('--ui-scale', String(scale));
  }

  // Initial calculation and update on window resize
  updateUiScale();
  addEventListener('resize', () => {
    renderer.resize();
    updateUiScale();
  });

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
    hats: [],
    // Filled in below, once `owned()` exists: a profile naming a hat it does
    // not own - an older build, a hand-edited save, a hat that was repriced -
    // goes back to a bare head rather than wearing something it never paid for.
    hatId: config.player.customisation.defaultHatId,
    previewHatId: config.player.customisation.defaultHatId,
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
    giveUpProgress: 0,
    giveUpKey: input.bindingFor('giveUp'),
    spectate: null,
    spectateNextKey: input.bindingFor('spectateNext'),
    spectatePrevKey: input.bindingFor('spectatePrev'),
    roster: [],
    showRoster: config.ui.hud.teammateList.enabled,
    chat: [],
    chatOpen: false,
    chatKey: input.bindingFor('chat'),
    showChat: config.ui.hud.chat.enabled,
    chatMaxLength: config.ui.hud.chat.maxLength,
    scoreboard: [],
    categories: config.game.scoring.categories,
    optionsOpen: false,
    options: save.options,
    optionRanges: save.ranges,
    buses: config.audio.buses,
    menus: config.ui.menus,
    tutorial: null,
    actions: input.actions(),
    localeToken: 0,
    voice: {
      mode: config.net.voice.enabled ? config.net.voice.defaultMode : 'off',
      modes: config.net.voice.modes,
      speaking: [],
      muted: [],
      selfVolume: 1,
      volumes: {},
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

  /* --- tutorial ------------------------------------------------------------ */

  /**
   * The corner line. It is driven from here rather than from `Game` or `Lobby`
   * because the moments worth teaching come from three places - the cabin's
   * input, the start of a run, and the run itself - and only one of them is
   * inside a world that would otherwise have to know the tutorial exists.
   */
  const tutorial = new Tutorial(config.ui.hud.tutorial, save, input, {
    onTip: (view) => set({ tutorial: view }),
    // It ran out of things to say. The switch is what a player sees for that,
    // so the switch is what moves - through the same path as any other option.
    onRetired: () => set({ options: save.setOptions({ tutorial: false }) }),
  });

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
    onDartThrown: (id, owner, from, velocity, wind) => lobby.dartThrown(id, owner, from, velocity, wind),
    onDartScore: (id, score) => lobby.setDartScore(id, score),
    onCosmetic: (id, cosmetic) => {
      lobby.setRemoteCosmetic(id, cosmetic);
      game.setRemoteCosmetic(id, cosmetic);
    },
    // Broadcast to everyone, read by whoever is allowed to: a player still down
    // there never sees a line from one who is out, by the same rule that keeps
    // spectators off their voice channel.
    onChat: (id, text) => {
      if (game.canHearChatFrom(id)) pushChat(id, text);
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
    onEscaped: () => {
      // The tick on a poster is earned by getting out YOURSELF. A team that
      // escapes without you does not mark your card.
      //
      // The purse is NOT banked here any more. Getting out is what earns the
      // right to it; walking away from the run is when you count it, and it
      // keeps filling while you sit and watch (`bankRun`).
      if (currentRun) save.markCompleted(currentRun.mapId);
      set({ use: null, hands: { left: null, right: null }, giveUpProgress: 0 });
    },
    // Whoever is left to watch, or nobody - and nobody left to watch is the
    // same thing as the run being over for this player.
    onSpectate: (view) => {
      if (view) {
        // Only on the way in. This fires again on every change of who is being
        // watched, and asking for pointer lock we already hold is pure noise.
        const entering = state.screen !== 'spectate' && state.screen !== 'spectatePaused';
        set({ spectate: view, screen: state.screen === 'spectatePaused' ? 'spectatePaused' : 'spectate' });
        if (entering && !state.chatOpen) input.requestPointerLock();
        return;
      }
      input.releasePointerLock();
      set({ spectate: null, screen: 'scoreboard', chatOpen: false });
    },
    onGiveUpProgress: (giveUpProgress) => set({ giveUpProgress }),
    onPlayerCountChange: (count) => set({ players: count }),
    onTutorial: (id) => tutorial.note(id),
    onHealthChange: (health) => set({ health }),
    onRosterChange: (roster) => set({ roster }),
    // Fired again as late tallies arrive, so a column cannot sit at zero
    // because a teammate's last message was still in flight.
    onScoreboard: (rows) => set({ scoreboard: rows }),
    onWiped: () => {
      input.releasePointerLock();
      set({ screen: 'scoreboard', chatOpen: false });
    },
  });

  /* --- lobby -------------------------------------------------------------- */

  /** What the cabin's look-ray is on, so a press can be told what it landed on. */
  let lobbyTarget: LobbyTarget | null = null;

  const lobby: Lobby = new Lobby(config, renderer, input, net, audio, voice, save, {
    onInteractTargetChange: (target) => {
      lobbyTarget = target;
      set({
        promptVerbKey: target?.verbKey ?? null,
        promptItemKey: target?.nameKey ?? null,
        promptHold: false,
      });
    },
    onViewChange: (view) => set({ lobby: view, players: view.players }),
    // The cabin has no item roster, so it hands the HUD locale keys directly
    // rather than item ids for `items.json` to name.
    onHandsChange: (hands) => set({ hands }),
    onUseChange: (use) => set({ use }),
    onWardrobe: (open) => {
      // Opening or closing both land on "showing what you actually wear": the
      // lobby has already put the equipped outfit back on the mannequin.
      set({ screen: open ? 'wardrobe' : 'lobby', previewHatId: state.hatId, ...hatState() });
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
    closeChat();
    lobby.start(slot, enabledMapIds());
    tutorial.enter('lobby');
    set({
      screen: 'lobby',
      optionsOpen: false,
      promptVerbKey: null,
      promptItemKey: null,
      holdProgress: 0,
      hint: null,
      health: 'healthy',
      giveUpProgress: 0,
      spectate: null,
      chat: [],
      use: null,
      hands: { left: null, right: null },
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
    banked = false;
    lobby.end();
    net.setScene('run');
    closeChat();
    game.start(run.mapId, run.seed, slot, run.difficultyId);
    set({
      lobby: null,
      optionsOpen: false,
      scoreboard: [],
      spectate: null,
      giveUpProgress: 0,
      chat: [],
      promptVerbKey: null,
      promptItemKey: null,
      holdProgress: 0,
      hint: null,
      health: 'healthy',
      use: null,
      // Whatever was in your hands in the cabin was a dart, and darts do not
      // come on the expedition.
      hands: { left: null, right: null },
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
    // Here rather than in `beginRun`: the first thing anybody should be told is
    // what they are in the map for, and behind the loading card nobody reads it.
    tutorial.enter('run');
    tutorial.note('exit');
  }

  /**
   * The cabin's tutorial triggers, read straight off the input.
   *
   * They are not reported by `Lobby` because there would be nothing for it to
   * add: every one of them is "the player pressed the key the tip is about",
   * and routing that through the cabin would only be relaying it. Sprinting
   * needs the movement too, exactly as `stepPlayer` does - holding the key
   * standing still is not sprinting and should not tick the tip off.
   *
   * Called before `lobby.update`, so `lobbyTarget` is last tick's ray. That is
   * what the prompt on screen was showing when the key went down, which is the
   * thing the press was answering.
   */
  function noteCabinInput(): void {
    const moving = input.axis('moveBack', 'moveForward') !== 0 || input.axis('moveLeft', 'moveRight') !== 0;
    const crouching = input.isDown('crouch');

    if (moving) tutorial.note('move');
    if (crouching) tutorial.note('crouch');
    if (moving && !crouching && input.isDown('sprint')) tutorial.note('sprint');
    if (lobbyTarget?.kind === 'poster' && input.justPressed('interact')) tutorial.note('pick');
  }

  /** No host, no session: there is no migration, by design. */
  function hostLost(): void {
    if (state.screen === 'menu') return;
    leaveSession();
    set({ error: t('lobby.hostLeft') });
  }

  /**
   * What this player takes home, counted at the moment they actually walk away
   * from the run rather than at the moment they stepped through the door.
   *
   * That is the whole of the spectator's bargain: the purse is shared, it keeps
   * filling while teammates are still down there banking theirs, and everybody
   * who got out takes a copy of it as it stands when they stop watching. Leave
   * the moment you are through the door and you get what was in it then; stay
   * to the end and you get all of it. Only somebody who got out counts it -
   * gold on a body on a cellar floor was never anybody's.
   */
  let banked = false;

  function bankRun(): void {
    if (banked || !game.escaped) return;
    banked = true;
    save.addCoins(state.coins);
    set({ bankedCoins: save.profile.coins });
  }

  /** Out of a run and back to the cabin, which is where the next one is chosen. */
  function leaveRun(): void {
    bankRun();
    if (net.role === 'host') net.endRun();
    enterLobby(net.slot);
  }

  /** Out of the session entirely. The code stays claimed; the peers do not. */
  function leaveSession(): void {
    // Before the run is torn down: escaping and then losing the host should not
    // cost somebody the purse they had already earned the right to.
    bankRun();
    game.end();
    lobby.end();
    tutorial.enter(null);
    currentRun = null;
    net.leave();
    renderer.applyGraphics(config.graphics);
    input.releasePointerLock();
    closeChat();
    set({
      screen: 'menu',
      lobby: null,
      players: 1,
      optionsOpen: false,
      scoreboard: [],
      spectate: null,
      giveUpProgress: 0,
      chat: [],
      promptVerbKey: null,
      hint: null,
      health: 'healthy',
      use: null,
      hands: { left: null, right: null },
      coins: 0,
    });
  }

  /* --- chat --------------------------------------------------------------- */

  /**
   * Lines go quiet on a timer rather than being faded by CSS, so a HUD with
   * nothing recent to say has no chat element in it at all. They are NOT thrown
   * away when that timer fires - `fresh` goes false and the line stays in the
   * backlog, so opening the box again asks "what did I miss" instead of
   * starting from a blank panel. `chatConfig.maxMessages` is what bounds it.
   *
   * `chatSeq` is local and never crosses the wire; it exists only to key the
   * list and to find the line again when its timer comes round.
   */
  const chatConfig = config.ui.hud.chat;
  let chatSeq = 0;

  function pushChat(fromId: string, raw: string): void {
    // Trusted no further than any other message: capped, stripped of control
    // characters, and rendered as text by Preact rather than as markup.
    const text = raw.replace(/[ -]/gu, ' ').trim().slice(0, chatConfig.maxLength);
    if (!text) return;

    const line: ChatLine = {
      id: ++chatSeq,
      from: game.playerNumber(fromId),
      self: fromId === net.selfId,
      text,
      fresh: true,
    };
    set({ chat: [...state.chat, line].slice(-chatConfig.maxMessages) });

    setTimeout(() => {
      set({ chat: state.chat.map((entry) => (entry.id === line.id ? { ...entry, fresh: false } : entry)) });
    }, chatConfig.messageSeconds * 1000);
  }

  /**
   * Opening the box hands the keyboard to it and gives the mouse back, which is
   * deliberate: typing with pointer lock held and the movement keys live is how
   * you walk into a corridor mid-sentence. It is not a pause - the run carries
   * on around you, and that is the cost of stopping to type.
   */
  function openChat(): void {
    if (!chatConfig.enabled || state.chatOpen || !CAN_CHAT.includes(state.screen)) return;
    input.setTextCapture(true);
    input.releasePointerLock();
    set({ chatOpen: true });
  }

  function closeChat(): void {
    if (!state.chatOpen) return;
    input.setTextCapture(false);
    set({ chatOpen: false });
    if (CAN_CHAT.includes(state.screen)) input.requestPointerLock();
  }

  /* --- escape ------------------------------------------------------------- */

  /** The escape menus, and the screen each one goes back to. */
  const RESUMES: Partial<Record<Screen, Screen>> = {
    paused: 'run',
    spectatePaused: 'spectate',
    lobbyPaused: 'lobby',
  };

  function resume(): void {
    const screen = RESUMES[state.screen];
    if (!screen) return;
    set({ screen });
    input.requestPointerLock();
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
    onResume: resume,
    onLeave: leaveRun,
    onChatSend: (text) => {
      const line = text.trim();
      if (line) {
        net.broadcast({ t: 'chat', id: net.selfId, text: line.slice(0, chatConfig.maxLength) });
        // Shown to the sender directly: the host relays to everyone else, and
        // nothing comes back round to the peer that sent it.
        pushChat(net.selfId, line);
      }
      closeChat();
    },
    onChatClose: closeChat,
    onLeaveLobby: leaveSession,
    onCloseWardrobe: () => lobby.closeWardrobe(),
    onColour: (id) => {
      lobby.setCosmetic({ colourId: id, hatId: state.hatId });
      set({ colourId: id });
    },
    /**
     * Owning it is what separates wearing from trying on. An owned hat is
     * equipped on the spot; anything else goes on the mannequin alone and the
     * price bar appears under the list.
     */
    onHat: (id) => {
      if (owned(id)) {
        lobby.setCosmetic({ colourId: state.colourId, hatId: id });
        set({ hatId: id, previewHatId: id });
        return;
      }
      lobby.previewCosmetic({ colourId: state.colourId, hatId: id });
      set({ previewHatId: id });
    },
    onBuyHat: (id) => {
      const hat = config.player.customisation.hats.find((entry) => entry.id === id);
      // A refusal is silent: the button is already disabled when the purse is
      // short, so getting here means something else changed underneath.
      if (!hat || !save.buyHat(id, hat.cost)) return;
      audio.play('ui.click');
      lobby.setCosmetic({ colourId: state.colourId, hatId: id });
      set({ hatId: id, previewHatId: id, bankedCoins: save.profile.coins, ...hatState() });
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
    // Session state, like the mode and the mutes, and deliberately not in the
    // save profile: a peer id is a lobby code that means somebody else next
    // week, so a remembered one is worse than no memory at all.
    onVoiceSelfVolume: (volume) => {
      voice.setSelfVolume(volume);
      pushVoice();
    },
    onVoicePeerVolume: (id, volume) => {
      voice.setPeerVolume(id, volume);
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
      // Not in `applyOptions`: switching the tutorial back on is what resets
      // what it has already taught, and boot applies the saved options too.
      tutorial.setEnabled(options.tutorial);
      set({ options });
    },
    onOptionsReset: () => {
      const options = save.resetOptions();
      applyOptions(options);
      tutorial.setEnabled(options.tutorial);
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

  /** Free hats belong to everybody; the rest have to be bought. */
  function owned(hatId: string): boolean {
    const hat = config.player.customisation.hats.find((entry) => entry.id === hatId);
    return hat !== undefined && (hat.cost <= 0 || save.ownsHat(hatId));
  }

  /** The shop list, with ownership folded in. Re-read after every purchase. */
  function hatState(): Partial<UiState> {
    return {
      hats: config.player.customisation.hats.map((hat) => ({
        id: hat.id,
        nameKey: hat.nameKey,
        cost: hat.cost,
        owned: owned(hat.id),
      })),
    };
  }

  /** The bindings the HUD and the Controls tab draw. Re-read after any rebind. */
  function bindingState(): Partial<UiState> {
    return {
      actions: input.actions(),
      interactKey: input.bindingFor('interact'),
      useLeftKey: input.bindingFor('useLeft'),
      useRightKey: input.bindingFor('useRight'),
      giveUpKey: input.bindingFor('giveUp'),
      spectateNextKey: input.bindingFor('spectateNext'),
      spectatePrevKey: input.bindingFor('spectatePrev'),
      chatKey: input.bindingFor('chat'),
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
    const signature = [
      status.mode,
      status.selfMuted,
      status.errorKey,
      status.selfVolume,
      ...status.speaking,
      '|',
      ...status.muted,
      '|',
      ...Object.entries(status.volumes).flat(),
    ].join();
    if (signature === voiceSignature) return;

    voiceSignature = signature;
    set({
      voice: {
        ...state.voice,
        mode: status.mode,
        speaking: status.speaking,
        muted: status.muted,
        selfVolume: status.selfVolume,
        volumes: status.volumes,
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
    // The chat box drops pointer lock on purpose, exactly as the wardrobe does.
    // Typing is not pausing - the run carries on around you while you do it.
    if (state.chatOpen) return;
    if (state.screen === 'run') set({ screen: 'paused' });
    else if (state.screen === 'spectate') set({ screen: 'spectatePaused' });
    else if (state.screen === 'lobby') set({ screen: 'lobbyPaused' });
  };

  /**
   * Escape, as one ordered stack: it closes the innermost thing that is open and
   * nothing else. A panel that closed and immediately handed you the escape menu
   * would make Escape mean two things at once, and there would be no way to back
   * out of anything without also opening something.
   *
   * Only what is on screen *without* pointer lock is here. Escape in a running
   * run is not delivered as a key at all - the browser spends it exiting pointer
   * lock, and `onPointerLockChange` is what turns that into the escape menu. So
   * the first press opens it and the second one, which does reach this, closes
   * it again.
   */
  addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;

    if (state.optionsOpen) {
      event.preventDefault();
      set({ optionsOpen: false });
      return;
    }
    if (state.chatOpen) {
      event.preventDefault();
      closeChat();
      return;
    }
    if (state.screen === 'wardrobe') {
      event.preventDefault();
      lobby.closeWardrobe();
      return;
    }
    if (RESUMES[state.screen]) {
      event.preventDefault();
      resume();
    }
  });

  document.addEventListener('pointerlockerror', () => {
    if (state.chatOpen) return;
    if (state.screen === 'run') {
      console.warn('[input] Pointer lock denied (missing user gesture). Falling back to pause menu.');
      set({ screen: 'paused' });
    } else if (state.screen === 'spectate') {
      set({ screen: 'spectatePaused' });
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

  // Whatever the wardrobe last saved is what everyone else should see us
  // wearing - as long as it is still ours to wear.
  const savedHat = save.profile.hatId;
  if (savedHat && owned(savedHat)) set({ hatId: savedHat, previewHatId: savedHat });
  net.setCosmetic({ colourId: state.colourId, hatId: state.hatId });
  set(hatState());

  /* --- loop --------------------------------------------------------------- */

  // Dev-only inspection handle. Stripped from production builds. `set` is on it
  // so a screen that only exists after a full run - the scoreboard - can be put
  // up and looked at without playing one, and `startRun` so a map can be
  // dropped into without walking the cabin first.
  if (import.meta.env.DEV) {
    Object.assign(window, {
      // `tutorial` is here so a tip can be fired without standing in front of
      // the thing that fires it - `tutorial.note('seen')` beats being chased.
      __stranded: { config, renderer, game, lobby, net, input, audio, voice, save, state, set, startRun, enterLobby, tutorial, THREE },
    });
  }

  const loop = new Loop({ tickRateHz: 60, maxSubStepsPerFrame: 5 });
  loop.add({
    fixedUpdate: (dt) => {
      // Heartbeats, dead-peer detection and the load timeout. It runs in every
      // screen, because a peer can drop while you are staring at a menu.
      net.tick(dt);

      // Read before anything is suppressed, because opening the box is what
      // suppresses it. Closing it again is the box's own business.
      if (input.justPressed('chat')) openChat();

      // A world that is built but still behind the loading card presents but
      // does not run: the hunter must not have a head start on whoever loaded
      // last, and the conversation over the top of it must not stop either.
      //
      // `spectate` counts as controls-enabled: the only input left is the two
      // keys that change whose eyes you are behind.
      if (game.active) {
        game.update(dt, state.screen === 'run' || state.screen === 'spectate', goGiven);
      } else if (lobby.active) {
        // BEFORE the cabin is given the input, not after: a solo player pressing
        // E on a poster starts the run from inside `lobby.update`, so by the
        // time it returns the screen is the loading card and the press has been
        // spent. Reading first is also the more honest question - what the
        // player meant by pressing, rather than what the cabin did about it.
        if (state.screen === 'lobby') noteCabinInput();
        lobby.update(dt, state.screen === 'lobby' || state.screen === 'wardrobe');
      }

      tutorial.update(dt);

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
    disposePortraits();
    voice.dispose();
    void net.close();
  });
}

boot().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error), error));
