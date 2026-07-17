import { stepMove, NET_TICK_MS, PLAYER_HP, PLAYER_FIRE_MS, resolveOpenSpawn, type MoveState } from "./sim";
import { PLAYER } from "../config";
import type { TileGrid } from "../world/district";
import type { ClientMsg, ServerMsg, InputCmd, PlayerLook, Item, EstateFurniture } from "./protocol";
import { PROTOCOL_VERSION } from "./protocol";
import { notifyProtocolMismatch } from "../systems/ClientUpdate";
import { tutorialReadyForPortal, tutorialStepAt } from "./tutorial";
import { walletSessionSecret } from "../economy/wallet";
import { setOnlinePlayer } from "../economy/session";
import { isGodAccount } from "./godAccounts";
import { furnitureHomeBuffs } from "../world/estates";
import { campaignEchoLine } from "../game/campaignEchoes";
import { normalizeFragmentSequence } from "../game/fragments";

/** True when the page is on a public host but the WS URL still points at loopback —
 *  the classic "forgot VITE_SERVER_URL" Pages footgun. */
export function isServerUrlMisconfigured(wsUrl: string): boolean {
  if (typeof location === "undefined") return false;
  const host = location.hostname || "";
  const localHost = host === "localhost" || host === "127.0.0.1" || host === "";
  if (localHost) return false;
  return /\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i.test(wsUrl);
}

/** sessionStorage key for sticky zone instance (survives soft reconnects). */
export function stickyInstKey(zone: string): string {
  return "mp_inst_" + zone;
}

/** Read sticky instance for a logical zone (undefined = let Worker pick). */
export function readStickyInst(zone: string): number | undefined {
  try {
    const raw = sessionStorage.getItem(stickyInstKey(zone));
    if (raw == null || raw === "") return undefined;
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n < 0 || n > 64) return undefined;
    return n;
  } catch {
    return undefined;
  }
}

export function writeStickyInst(zone: string, inst: number): void {
  try {
    sessionStorage.setItem(stickyInstKey(zone), String(Math.max(0, Math.floor(inst))));
  } catch {
    /* private mode */
  }
}

export function clearStickyInst(zone: string): void {
  try {
    sessionStorage.removeItem(stickyInstKey(zone));
  } catch {
    /* ignore */
  }
}

/**
 * Build `/ws?zone=…&inst=…` from the baked VITE_SERVER_URL base.
 * When `rebalance` is true, sticky is cleared so the Worker load-picks a fresh shard.
 */
export function buildZoneWsUrl(
  serverUrl: string,
  zone: string,
  opts?: { inst?: number | null; rebalance?: boolean },
): string {
  const base = serverUrl.includes("?") ? serverUrl : serverUrl;
  const join = base.includes("?") ? "&" : "?";
  let url = `${base}${join}zone=${encodeURIComponent(zone)}`;
  if (opts?.rebalance) {
    clearStickyInst(zone);
  } else {
    const sticky = opts?.inst != null && Number.isFinite(opts.inst) ? Math.floor(opts.inst) : readStickyInst(zone);
    if (sticky != null) url += `&inst=${sticky}`;
  }
  return url;
}

/** Drop a stale shard pin while preserving zone and any future query fields. */
export function withoutStickyInstance(wsUrl: string): string {
  try {
    const base = typeof location !== "undefined" ? location.href : "http://local";
    const u = new URL(wsUrl, base);
    u.searchParams.delete("inst");
    return u.toString().replace(/^http:/, "ws:").replace(/^https:/, "wss:");
  } catch {
    return wsUrl
      .replace(/([?&])inst=[^&]*&?/i, (_m, lead: string) => lead)
      .replace(/[?&]$/, "");
  }
}

/** Guest id form of a callsign (must match server `onLoginInner` sanitization). */
export function guestIdFromCallsign(name: string): string {
  return (name || "").toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

/** Session-only secrets when localStorage is blocked (private mode / ITP). */
const memoryDeviceSecrets = new Map<string, string>();

/**
 * Read this device's stored secret for a callsign, WITHOUT minting one.
 *
 * Sources (first hit wins):
 *  1. localStorage `mp_secret_<id>`
 *  2. sessionStorage (iOS private-mode / ITP wipes localStorage between navigations)
 *  3. LocalRunner profile.deviceSecret (survives partial storage clears)
 *  4. in-memory map (private mode / storage blocked)
 *
 * Callers that must PROVE ownership (retire) need this: a minted secret can never match
 * the one bound server-side, so fabricating one turns "this device has no key" into a
 * guaranteed "device key does not match this runner".
 */
export function readGuestDeviceSecret(name: string): string | undefined {
  const id = guestIdFromCallsign(name);
  if (!id) return undefined;
  const found = lookupDeviceSecret(id);
  return found && found.length >= 8 ? found : undefined;
}

/** Shared lookup for read/ensure. Never mints, never persists. */
function lookupDeviceSecret(id: string): string | undefined {
  const key = "mp_secret_" + id;
  const sessionKey = "mp_secret_sess_" + id;
  let s: string | undefined;
  try {
    s = localStorage.getItem(key) || undefined;
  } catch {
    /* storage blocked */
  }
  if (!s || s.length < 8) {
    try {
      s = sessionStorage.getItem(sessionKey) || sessionStorage.getItem(key) || undefined;
    } catch {
      /* ignore */
    }
  }
  if (!s || s.length < 8) {
    try {
      const raw = localStorage.getItem("metrophage_local_runner_v1");
      if (raw) {
        const prof = JSON.parse(raw) as { callsign?: string; deviceSecret?: string };
        const profId = guestIdFromCallsign(prof?.callsign || "");
        if (profId === id && typeof prof.deviceSecret === "string" && prof.deviceSecret.length >= 8) {
          s = prof.deviceSecret;
        }
      }
    } catch {
      /* ignore corrupt / blocked */
    }
  }
  if (!s || s.length < 8) s = memoryDeviceSecrets.get(id);
  return s && s.length >= 8 ? s : undefined;
}

/**
 * Guest-identity device secret — generated once per callsign on this device and bound
 * server-side on first login. Stops anyone else logging in as your name and selling
 * your house. Wallet sign-ins don't need it (the signature is the proof).
 *
 * Sources (first hit wins, then all are synced):
 *  1. localStorage `mp_secret_<id>`
 *  2. LocalRunner profile.deviceSecret (survives partial storage clears)
 *  3. in-memory map (private mode / storage blocked)
 *  4. freshly minted UUID
 *
 * ALWAYS returns a secret when the callsign is non-empty — server guest login
 * rejects missing secrets and used to brick tutorial entry. Use
 * `readGuestDeviceSecret` when a MISSING key must stay missing (see retire).
 */
export function ensureGuestDeviceSecret(name: string): string | undefined {
  const id = guestIdFromCallsign(name);
  if (!id) return undefined;
  const key = "mp_secret_" + id;
  const sessionKey = "mp_secret_sess_" + id;

  // localStorage → sessionStorage (iOS private-mode / ITP) → LocalRunner profile →
  // memory. Recovering from LocalRunner matters: regenerating a NEW secret locked
  // players out of their own server save.
  let s = lookupDeviceSecret(id);

  if (!s || s.length < 8) {
    s =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `mp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }

  memoryDeviceSecrets.set(id, s);

  // Best-effort persist so CONTINUE + login always present the same proof.
  try {
    localStorage.setItem(key, s);
  } catch {
    /* quota / private mode — memory map still holds it for this tab */
  }
  try {
    sessionStorage.setItem(sessionKey, s);
    sessionStorage.setItem(key, s);
  } catch {
    /* ignore */
  }
  try {
    const raw = localStorage.getItem("metrophage_local_runner_v1");
    if (raw) {
      const prof = JSON.parse(raw) as Record<string, unknown>;
      const profId = guestIdFromCallsign(String(prof.callsign || ""));
      if (profId === id && prof.deviceSecret !== s) {
        prof.deviceSecret = s;
        localStorage.setItem("metrophage_local_runner_v1", JSON.stringify(prof));
      }
    }
  } catch {
    /* ignore */
  }
  return s;
}

/** @deprecated use ensureGuestDeviceSecret */
function deviceSecretFor(name: string): string | undefined {
  return ensureGuestDeviceSecret(name);
}

export interface RemotePlayer {
  id: string;
  x: number; // rendered (interpolated) position
  y: number;
  tx: number; // latest authoritative target
  ty: number;
  hp: number;
  dead: boolean;
  dash?: boolean; // mid-dash this snapshot — render the burst trail
  escort?: boolean; // drones/minions active — render the orbiting companions
  look?: PlayerLook; // appearance, for rendering the remote's customization
}

export interface NetEnemy {
  id: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  hp: number;
  kind: number; // HSS archetype (tints the sprite client-side)
  boss?: boolean; // a named world boss — rendered bigger, with a name + HP bar
  name?: string;
  tint?: number;
  hpMax?: number;
  hvt?: boolean; // today's HIGH-VALUE TARGET — gold label + bounty callout
}

export interface NetShot {
  id: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  team: 0 | 1;
}

export interface NetStats {
  connected: boolean;
  id: string;
  ack: number;
  pending: number;
  serverX: number;
  serverY: number;
  predX: number;
  predY: number;
  error: number; // last reconciliation correction (px)
  reconciles: number;
  players: number;
}

/**
 * Client netcode for the local player. Runs the SAME deterministic sim the server
 * runs (../net/sim), so we can:
 *   - predict: apply local input immediately for zero-latency movement,
 *   - reconcile: when a server snapshot arrives, snap to the authoritative position
 *     and re-apply the inputs the server hasn't acked yet.
 * Remote players are interpolated toward their latest authoritative position.
 */
export default class NetClient {
  id = "";
  connected = false;
  pred: MoveState = { x: 0, y: 0 }; // predicted local position (what we render)
  serverPos: MoveState = { x: 0, y: 0 };
  remotes = new Map<string, RemotePlayer>();
  enemies = new Map<number, NetEnemy>();
  shots = new Map<number, NetShot>();
  hp = PLAYER_HP;
  dead = false;
  /** Server death affordance — CITY START / hub evacuate on death. */
  deathStreak = 0;
  deathExtract = false;
  deathExtractZone: string | null = null;
  deathExtractLabel = "";
  deathNearBoss = false;
  credits = 0;
  cores = 0;
  metro = 0;
  pvpInArena = false;
  pvpEscrow = 0;
  inventory: Item[] = []; // server-authoritative held gear (sent on login + on change)
  stash: Item[] = []; // personal safe storage (TENEMENT lockbox), server-authoritative
  estate:
    | null
    | {
        id: string;
        owner: string | null;
        ownerName: string | null;
        mine: boolean;
        forSale: boolean;
        price: number;
        furniture: EstateFurniture[];
        guests: { n: string; at: number; s: string }[];
      } = null; // current home (est{K})
  estatesDir: { i: number; owner: string | null; name: string | null; forSale: boolean; price: number; furn: number; guests: number }[] = []; // street-wide ownership (THE ESTATES)
  equipped: Item[] = []; // currently equipped items (one per slot), server-authoritative
  maxHp = PLAYER_HP; // derived from equipped +HP mods
  trade: null | {
    with: string;
    youOffer: { credits: number; cores: number };
    theyOffer: { credits: number; cores: number };
    youConfirm: boolean;
    theyConfirm: boolean;
  } = null;
  level = 1;
  xp = 0;
  pickups = new Map<number, { id: number; x: number; y: number; kind: number }>();
  hazards: Array<{ id: number; x: number; y: number; r: number; frac: number; friendly?: 1 }> = []; // AoE telegraphs (boss + called strikes)
  faction = 0;
  nodes = new Map<number, { id: number; x: number; y: number; owner: number; progress: number; by: number }>();
  factions: number[] = [0, 0, 0, 0];
  control = -1;
  roster: Array<{ id: string; faction: number; level: number }> = [];
  /** Zone world-boss status (location + respawn countdown), for the locator UI. */
  boss: { name: string; x: number; y: number; hp: number; hpMax: number; alive: boolean; respawnSec: number } | null = null;
  party: string[] = [];
  chatLog: Array<{
    from: string;
    ch: string;
    text: string;
    faction: number;
    sys: boolean;
    at: number;
    x?: number;
    y?: number;
  }> = [];
  /** Recent emotes/pings relayed by the server (rendered + aged out by the scene). */
  emotes: Array<{ from: string; kind: number; ping: boolean; x: number; y: number; at: number }> = [];
  campaignQuest: string | null = null;
  campaignStage = 0;
  campaignProgress = 0;
  campaignObjective = "";
  /** Completed main-story quest ids (for the quest log). */
  campaignCompleted: string[] = [];
  /** Durable narrative decisions and campaign-only claim flags. */
  campaignFlags: string[] = [];
  tutorialStep = 0;
  tutorialProgress = 0;
  tutorialTotal = 9;
  tutorialMode: "quick" | "full" = "quick";
  tutorialDone = false;
  inTutorial = false;
  /** Operator account from welcome.god — full map + unlocked client systems. */
  godMode = false;
  tutorialPortalOpen = false;
  tutorialTitle = "";
  tutorialTeach = "";
  tutorialHint = "";
  achievements = new Set<string>(); // unlocked achievement ids (hydrated on login, grows live)
  guild: null | {
    id: number;
    name: string;
    tag: string;
    level: number;
    xp: number;
    bankCredits: number;
    bankCores: number;
    rank: string;
    members: Array<{ id: string; rank: string }>;
    goal?: {
      id: string;
      name: string;
      desc: string;
      target: number;
      progress: number;
      claimed: boolean;
      rewardCredits: number;
    };
  } = null;
  onGuildUpdate?: () => void;
  /** Fired for every server sys line (death tax, cell goals, boss share hooks). */
  onSysMessage?: (text: string) => void;
  marketListings: Array<{ id: number; seller: string; sellerName: string; item: Item; price: number; currency: string }> = [];
  onMarket?: () => void;
  contracts: Array<{ id: string; name: string; desc: string; objective: string; count: number; progress: number; done: boolean; rewardCredits: number; rewardRep: number }> = [];
  rep = 0;
  repTier = 0;
  contractsDay = 0;
  onContracts?: () => void;
  cosmeticsOwned: string[] = [];
  cosmeticEquipped: string | null = null;
  onCosmetics?: () => void;
  bounty: { id: string; name: string; desc: string; objective: string; count: number; progress: number } | null = null;
  onBounty?: () => void;
  relationships: Record<string, number> = {};
  districtStanding: number[] = [];
  residentClues: string[] = [];
  residentConfirmed: string[] = [];
  reconstruction: number[] = [];
  socialMemory = { given: 0, received: 0, tier: 0, title: "UNTESTED LINK", line: "" };
  reprints = 0;
  onRelations?: () => void;
  civicMomentum: number[] = [];
  civicAftermath: Record<number, { day: number; operation: string; stage: string; completions: number; line: string; eventDurationPct: number }> = {};
  onCivic?: () => void;
  chronicle: { week: number; headline: string; lines: string[]; civic: number[]; territory: Array<{ district: number; controller: number; flips: number }> } | null = null;
  onChronicle?: () => void;
  discovered: string[] = []; // zones seen on the map (fog of war)
  unlocked: string[] = []; // zones reached organically — fast travel allowed
  /** How this connection arrived — sent on login. */
  arrival: "organic" | "fast" = "organic";
  /** Prior zone — trail-gate spawn for wilderness corridors. */
  travelFrom?: string;
  onDiscovered?: () => void;
  story: {
    quest: string;
    stage: string;
    title: string;
    text: string;
    journal: string;
    objective: string;
    done: boolean;
    /** Personal meltdown victory (campaign climax) — not a server wipe. */
    meltdown?: boolean;
    choices?: Array<{ id: "spare" | "expose"; label: string }>;
    at: number;
  } | null = null;
  lastError = 0;
  reconciles = 0;
  lastAck = 0;
  playersOnline = 0;
  onWelcome?: (x: number, y: number) => void;
  onInventory?: () => void; // fired when the server pushes an inventory update
  onStash?: () => void; // fired when the server pushes a stash update
  onEstate?: () => void; // fired when the server pushes an estate ownership/furniture update
  onEstatesDir?: () => void; // fired when the server pushes the street-wide ownership directory
  onCampaign?: () => void; // fired when the active campaign quest changes (story allies re-react)
  /** Fired when a `story` beat arrives (FIXER dialogue / quest stage). */
  onStory?: () => void;
  /**
   * Server-directed zone handoff (tutorial graduate, extract, instance rebalance).
   * `rebalance` → drop sticky inst and re-enter zone so Worker picks a less-loaded shard.
   */
  onRedirect?: (zone: string, opts?: { inst?: number; rebalance?: boolean }) => void;
  /** Horizontal shard index for this socket (from welcome); sticky on reconnect. */
  inst = 0;
  /** Logical zone this client connected for (parsed from WS URL). */
  zone = "";
  /** Memory fragments this player has recovered (dive rewards; welcome + live updates). */
  fragments: string[] = [];
  onFragment?: (id: string, isNew: boolean) => void;
  /** The district's live world event (null when idle). */
  worldEvent: { id: string; name: string; tagline: string; condition: string; hex: string; phase: "telegraph" | "active"; untilAt: number } | null = null;
  onWorldEvent?: (phase: "telegraph" | "active" | "end", name: string) => void;
  /** Class id sent at login — selects the server-side signature ability. */
  classId = "metrophage";
  // class kit — local prediction + cooldown UI (the server enforces the real timers)
  predDashUntil = 0;
  predDashX = 0;
  predDashY = 0;
  dashCdUntil = 0;
  abilityCdUntil = 0;
  ability2CdUntil = 0;
  /** HEAT 0–100 (server-authoritative; snapshotted for the local player). */
  heat = 0;
  /** Own escort (drones/minions) active this snapshot — drives the companion visuals. */
  escortActive = false;
  /** connecting | connected | reconnecting | offline */
  onConnectionState?: (state: "connecting" | "connected" | "reconnecting" | "offline") => void;
  /**
   * Fired when wallet 4001 needs recovery.
   * - "silent": re-assert device session only (no wallet UI)
   * - "prompt": allow one personal_sign
   */
  onAuthRequired?: (mode: "silent" | "prompt") => void;
  /** Fired when a GUEST login is rejected outright (4001 with no wallet in play) —
   *  callsign bound to another device, missing device key, or reserved name. */
  onGuestAuthFailed?: (reason: string) => void;
  private lastSysText = "";

  private ws?: WebSocket;
  private manualClose = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingGraduate = false;
  private pendingSkip = false;
  private intent = { mx: 0, my: 0 };
  private seq = 0;
  private pending: InputCmd[] = [];
  private acc = 0;
  /** Cap unacked prediction cmds so a stalled ack stream cannot grow forever. */
  /** Unacked prediction window — ~3.2s at 20 Hz (was 2.4s) for Paid-tier lag spikes. */
  private static readonly PENDING_CAP = 64;
  private lastFireSentAt = 0;
  /** When set, protocol mismatch hard-stopped the client (no more reconnect loops). */
  protocolBlocked = false;
  /** pagehide/beforeunload flush wired once per NetClient instance. */
  private unloadHooked = false;
  /** Socket generation — ignore events from superseded sockets. */
  private socketGen = 0;
  /** Wall time when the current socket was opened (debounce supersede). */
  private socketOpenedAt = 0;
  /** Last server traffic. Mobile browsers can leave a dead radio socket OPEN. */
  private lastServerMessageAt = 0;
  /** Periodic zombie-link detector, installed once with the lifecycle hooks. */
  private linkWatchdog: ReturnType<typeof setInterval> | null = null;
  /** Removes the window/document lifecycle listeners installed by hookUnloadFlush. */
  private unhookLifecycle: (() => void) | null = null;
  /** Timer: OPEN but no welcome → re-login / reopen. */
  private welcomeTimer: ReturnType<typeof setTimeout> | null = null;
  /** Min ms a CONNECTING/OPEN socket is protected from spam-retry supersede. */
  private static readonly SOCKET_GRACE_MS = 4500;
  /** If no welcome after open, force re-login. */
  private static readonly WELCOME_TIMEOUT_MS = 9000;
  /** No snapshots/messages for this long while visible means the OPEN socket is dead. */
  private static readonly STALE_LINK_MS = 12_000;

  constructor(
    private grid: TileGrid,
    private name: string,
    private url: string,
    private loginFaction = 0,
    private look?: PlayerLook,
  ) {
    // Capture logical zone + sticky inst from the connect URL for reconnect rebuilds.
    try {
      const u = new URL(url, typeof location !== "undefined" ? location.href : "http://local");
      this.zone = u.searchParams.get("zone") || "";
      const i = u.searchParams.get("inst");
      if (i != null && i !== "") {
        const n = Math.floor(Number(i));
        if (Number.isFinite(n) && n >= 0) this.inst = n;
      }
    } catch {
      /* relative / opaque URL — OnlineScene always passes absolute-ish ws URL */
    }
    // Loud fail on the Pages + localhost-WS footgun — never silent empty city.
    if (isServerUrlMisconfigured(url)) {
      console.error(
        "[METROPHAGE] VITE_SERVER_URL points at localhost while this page is on a public host. Rebuild with VITE_SERVER_URL=wss://…/ws",
      );
      this.pushChat({
        from: "",
        ch: "sys",
        text: "⚠ BUILD MISCONFIGURED — this client targets localhost. Hard refresh won't fix it: rebuild with VITE_SERVER_URL set to the live Worker.",
        faction: -1,
        sys: true,
      });
    }
    this.hookUnloadFlush();
  }

  /**
   * Best-effort durable flush on real unload — NOT on mobile tab/app switch.
   * iOS/Android fire pagehide when backgrounding (wallet apps, notifications);
   * leaving there killed the live link and left players stuck "retrying forever".
   * Server heartbeat still persists; soft background only flags for resume.
   */
  private hookUnloadFlush() {
    if (this.unloadHooked || typeof window === "undefined") return;
    this.unloadHooked = true;
    const flush = () => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.send(JSON.stringify({ t: "leave" } satisfies ClientMsg));
      } catch {
        try {
          ws.close(1000, "unload");
        } catch {
          /* ignore */
        }
      }
    };
    // Hard navigation / tab close only. Do NOT leave on pagehide — iOS/Android fire
    // pagehide on wallet app-switch and notifications; leave → bye → stuck offline
    // was the dominant "never connect on mobile" loop. Server heartbeat + DO
    // eviction still persist x/y/inventory; visibility resume reopens a dead socket.
    // Resume after phone sleep / wallet app — reconnect if the socket died.
    /**
     * @param fromResume true for an explicit resume signal (tab visible again, network
     *   back). Only those may jump an already-scheduled backoff; the periodic tick may
     *   not — see the `dead` branch below.
     */
    const recoverIfStale = (fromResume: boolean) => {
      if (this.protocolBlocked || this.manualClose) return;
      const ws = this.ws;
      const dead = !ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING;
      const stale =
        !!ws &&
        ws.readyState === WebSocket.OPEN &&
        this.lastServerMessageAt > 0 &&
        Date.now() - this.lastServerMessageAt > NetClient.STALE_LINK_MS;
      const stalled =
        !!ws &&
        !this.connected &&
        Date.now() - this.socketOpenedAt > NetClient.WELCOME_TIMEOUT_MS * 2;
      // Zombie link: the socket claims OPEN/CONNECTING but nothing is coming back.
      // onclose will never fire for these, so the watchdog is the only way out.
      if (stale || stalled) {
        this.retryConnect(false, true);
        return;
      }
      // A genuinely closed socket already has onclose's backoff ladder scheduled.
      // Letting the 4s tick reopen it here reset `reconnectAttempts` to 0 every tick,
      // which abolished backoff during an outage (~100 attempts/min/client against a
      // cold DO) and meant the ladder never reached the "offline" notice at 20.
      if (dead && fromResume) this.retryConnect(false);
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      recoverIfStale(true);
    };
    const onOnline = () => recoverIfStale(true);
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    // Kept so disconnect() can unhook them. The scene builds a fresh NetClient per zone
    // hop, and anonymous listeners pinned every dead client (plus its grid and entity
    // maps) for the page's life, re-running recovery across all of them on each refocus.
    this.unhookLifecycle = () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
    // iOS often reports an OPEN WebSocket after sleep even though the TCP path is
    // gone. Server snapshots arrive many times per second, so 12s of silence while
    // visible is a safe, conservative reconnect signal.
    this.linkWatchdog = setInterval(() => {
      if (document.visibilityState === "visible") recoverIfStale(false);
    }, 4_000);
  }

  private clearWelcomeTimer() {
    if (this.welcomeTimer) {
      clearTimeout(this.welcomeTimer);
      this.welcomeTimer = null;
    }
  }

  /** True after one re-login on an OPEN socket that never welcomed. */
  private reloginAttempted = false;

  private armWelcomeTimeout(gen: number) {
    this.clearWelcomeTimer();
    this.welcomeTimer = setTimeout(() => {
      this.welcomeTimer = null;
      if (this.socketGen !== gen || this.manualClose || this.protocolBlocked) return;
      if (this.connected) return;
      const ws = this.ws;
      // Prefer re-sending login on a live OPEN socket before killing a slow D1 path.
      if (ws && ws.readyState === WebSocket.OPEN && !this.reloginAttempted) {
        this.reloginAttempted = true;
        try {
          this.sendLogin(ws);
          this.armWelcomeTimeout(gen);
          return;
        } catch {
          /* fall through to reopen */
        }
      }
      this.reloginAttempted = false;
      this.pushChat({
        from: "",
        ch: "sys",
        text: "link stalled — reopening socket…",
        faction: -1,
        sys: true,
      });
      this.openSocket(true);
    }, NetClient.WELCOME_TIMEOUT_MS);
  }

  private sendLogin(ws: WebSocket) {
    const auth = this.auth;
    const session = auth?.wallet ? walletSessionSecret(auth.wallet) : undefined;
    const freshSig =
      !!auth?.sig &&
      Number.isFinite(auth.ts) &&
      Math.abs(Date.now() - (auth.ts as number)) < 90_000;
    const authFields =
      auth?.wallet
        ? {
            wallet: auth.wallet,
            ...(freshSig ? { sig: auth.sig, ts: auth.ts } : {}),
          }
        : {};
    const travelFrom = this.travelFrom;
    ws.send(
      JSON.stringify({
        t: "login",
        name: this.name,
        faction: this.loginFaction,
        look: this.look,
        arrival: this.arrival,
        classId: this.classId,
        secret: deviceSecretFor(this.name),
        ...(session ? { session } : {}),
        ...(travelFrom ? { from: travelFrom } : {}),
        ...authFields,
      } satisfies ClientMsg),
    );
  }

  /** Optional signed wallet proof; when set, login is a durable wallet identity.
   *  sig/ts optional when a bound device session is enough for zone travel. */
  private auth?: { wallet: string; sig?: string; ts?: number };
  /** How many wallet 4001 recoveries we've burned this socket generation. */
  private walletAuthFailures = 0;
  setAuth(proof?: { wallet: string; sig?: string; ts?: number }) {
    this.auth = proof;
    // Fresh personal_sign clears the recovery budget; session-only must not.
    if (proof?.sig) {
      this.walletAuthFailures = 0;
    }
  }

  equip(itemId: string) {
    this.ws?.send(JSON.stringify({ t: "equip", itemId } satisfies ClientMsg));
  }
  unequip(slot: string) {
    this.ws?.send(JSON.stringify({ t: "unequip", slot } satisfies ClientMsg));
  }
  moveInv(from: number, to: number) {
    this.ws?.send(JSON.stringify({ t: "inv_move", from, to } satisfies ClientMsg));
  }
  buy(sku: string) {
    this.ws?.send(JSON.stringify({ t: "buy", sku } satisfies ClientMsg));
  }
  /** Gear forge — server validates + deducts credits/cores, then pushes inv + loadout. */
  craft(action: "upgrade" | "reforge" | "salvage" | "fuse", itemId: string, itemId2?: string) {
    this.ws?.send(JSON.stringify({ t: "craft", action, itemId, itemId2 } satisfies ClientMsg));
  }

  connect() {
    this.manualClose = false;
    this.openSocket(true);
  }

  /**
   * @param force when false, keep an in-flight socket that is still within the grace
   * window (spam-tapping LINK used to kill every attempt before welcome arrived).
   */
  private openSocket(force = false) {
    // Idempotent: re-arms the lifecycle hooks that disconnect() tore down, so a LINK tap
    // after a manual close still gets phone-sleep resume and zombie-link detection.
    this.hookUnloadFlush();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const prev = this.ws;
    if (prev) {
      const age = Date.now() - this.socketOpenedAt;
      const stillTrying =
        (prev.readyState === WebSocket.CONNECTING || prev.readyState === WebSocket.OPEN) &&
        !this.connected &&
        age < NetClient.SOCKET_GRACE_MS;
      if (!force && stillTrying) {
        // Leave the in-flight attempt alone; re-arm welcome timeout.
        this.onConnectionState?.(this.reconnectAttempts > 0 ? "reconnecting" : "connecting");
        this.armWelcomeTimeout(this.socketGen);
        return;
      }
      try {
        prev.onopen = null;
        prev.onmessage = null;
        prev.onclose = null;
        prev.onerror = null;
        prev.close();
      } catch {
        /* already closed */
      }
      this.ws = undefined;
    }
    this.onConnectionState?.(this.reconnectAttempts > 0 ? "reconnecting" : "connecting");
    const gen = ++this.socketGen;
    this.socketOpenedAt = Date.now();
    this.clearWelcomeTimer();
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      // Invalid URL / browser block — schedule retry instead of silent death.
      this.scheduleReconnect(600);
      return;
    }
    this.ws = ws;
    this.lastServerMessageAt = 0;
    this.armWelcomeTimeout(gen);
    ws.onopen = () => {
      if (this.ws !== ws || this.socketGen !== gen) return;
      try {
        this.sendLogin(ws);
      } catch {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        this.scheduleReconnect(100);
      }
    };
    ws.onmessage = (e) => {
      if (this.ws !== ws || this.socketGen !== gen) return;
      this.lastServerMessageAt = Date.now();
      this.onMessage(e.data);
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws && this.ws !== undefined) return; // a newer socket owns the client
      if (this.socketGen !== gen && this.ws !== undefined) return;
      this.clearWelcomeTimer();
      this.connected = false;
      setOnlinePlayer(null); // a fresh welcome re-publishes it on reconnect
      // 4001 = wallet auth rejected.
      // Allow at most ONE silent session re-assert, then ONE sign-prompt recovery.
      // Never infinite-loop: walletAuthFailures hard-caps silent+prompt recoveries.
      if (ev.code === 4001 && this.auth?.wallet) {
        this.walletAuthFailures++;
        if (this.walletAuthFailures === 1) {
          // First failure: silent session re-assert (zone travel / cold DO).
          this.onAuthRequired?.("silent");
          return;
        }
        if (this.walletAuthFailures === 2) {
          // Second failure: force a fresh personal_sign once.
          this.onAuthRequired?.("prompt");
          return;
        }
        // Third+: stop. User must return to title / explicit LINK (or press R once).
        this.manualClose = true;
        this.onConnectionState?.("offline");
        this.pushChat({
          from: "",
          ch: "sys",
          text: "⚠ wallet session expired — press R / LINK once, or CONNECT WALLET on the title screen",
          faction: -1,
          sys: true,
        });
        this.onGuestAuthFailed?.(
          this.lastSysText || "wallet session expired — sign in once from the title screen, or play as guest",
        );
        return;
      }
      // 4001 without a wallet = GUEST login rejected (callsign saved on another
      // device / no device key / reserved name). Reconnecting would be rejected
      // identically forever — stop and surface the reason instead.
      if (ev.code === 4001 && !this.auth?.wallet) {
        this.manualClose = true;
        this.onConnectionState?.("offline");
        this.onGuestAuthFailed?.(this.lastSysText || "sign-in rejected");
        return;
      }
      // 4002 = another tab took this same zone — re-link after a brief settle.
      // 4003 = session moved to a DIFFERENT zone (travel handoff) — do NOT reopen
      // this URL or we fight the new zone and thrash session_zone.
      if (ev.code === 4003) {
        this.manualClose = true;
        this.onConnectionState?.("offline");
        this.pushChat({
          from: "",
          ch: "sys",
          text: "session moved to another zone — follow the handoff (or tap LINK if stuck)",
          faction: -1,
          sys: true,
        });
        return;
      }
      if (ev.code === 4002) {
        this.pushChat({
          from: "",
          ch: "sys",
          text: "session replaced — another tab took control; re-linking…",
          faction: -1,
          sys: true,
        });
        if (!this.manualClose) this.scheduleReconnect(900);
        return;
      }
      if (!this.manualClose) this.scheduleReconnect();
    };
    ws.onerror = () => {
      if (this.ws !== ws || this.socketGen !== gen) return;
      this.connected = false;
      // onclose will schedule reconnect; don't dual-open here.
    };
  }

  /** Current reconnect attempt (0 = first connect / connected). */
  get reconnectTry(): number {
    return this.reconnectAttempts;
  }

  private scheduleReconnect(minDelayMs = 0) {
    if (this.manualClose || this.protocolBlocked) return;
    // Already waiting on a reconnect timer — don't stack opens.
    if (this.reconnectTimer) return;
    // After many failures, surface "offline" but keep a slow heartbeat so players
    // don't need to mash R — Durable Object cold starts can exceed 15s.
    if (this.reconnectAttempts >= 20) {
      this.onConnectionState?.("offline");
      if (this.reconnectAttempts === 20) {
        this.pushChat({
          from: "",
          ch: "sys",
          text: "link slow — auto-retrying · tap LINK / press R to force",
          faction: -1,
          sys: true,
        });
      }
      this.reconnectAttempts++;
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        if (!this.manualClose) {
          // Soft-reset backoff so we don't wait forever between tries.
          this.reconnectAttempts = Math.min(this.reconnectAttempts, 8);
          this.openSocket();
        }
      }, 2500);
      return;
    }
    // First failures: almost immediate (80–200ms). Then gentle backoff, cap 4s.
    const n = this.reconnectAttempts;
    const base = n === 0 ? 80 : n === 1 ? 200 : Math.min(4_000, Math.round(280 * Math.pow(1.4, n)));
    const delay = Math.max(minDelayMs, base);
    this.reconnectAttempts++;
    this.onConnectionState?.("reconnecting");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.manualClose) this.openSocket();
    }, delay);
  }

  disconnect() {
    this.manualClose = true;
    this.clearWelcomeTimer();
    this.unhookLifecycle?.();
    this.unhookLifecycle = null;
    this.unloadHooked = false;
    if (this.linkWatchdog) {
      clearInterval(this.linkWatchdog);
      this.linkWatchdog = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.ws?.close();
    } catch {
      /* already closed */
    }
    this.connected = false;
  }

  /**
   * Zone travel handoff: ask the server to flush (`leave` → `bye`), then close.
   * The next zone DO must not claim session_zone until this finishes.
   */
  disconnectAwait(timeoutMs = 2500): Promise<void> {
    this.manualClose = true;
    this.unhookLifecycle?.();
    this.unhookLifecycle = null;
    this.unloadHooked = false;
    if (this.linkWatchdog) {
      clearInterval(this.linkWatchdog);
      this.linkWatchdog = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const ws = this.ws;
    if (!ws || ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) {
      this.connected = false;
      this.ws = undefined;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        this.connected = false;
        if (this.ws === ws) this.ws = undefined;
        resolve();
      };
      const timer = setTimeout(() => {
        try {
          ws.close(1000, "travel-timeout");
        } catch {
          /* ignore */
        }
        finish();
      }, timeoutMs);
      const prevClose = ws.onclose;
      const prevMsg = ws.onmessage;
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(typeof e.data === "string" ? e.data : "{}") as { t?: string };
          if (m.t === "bye") {
            clearTimeout(timer);
            try {
              ws.close(1000, "travel");
            } catch {
              /* ignore */
            }
            finish();
            return;
          }
        } catch {
          /* ignore */
        }
        if (typeof prevMsg === "function") prevMsg.call(ws, e);
      };
      ws.onclose = (ev) => {
        clearTimeout(timer);
        if (typeof prevClose === "function") {
          try {
            prevClose.call(ws, ev);
          } catch {
            /* ignore */
          }
        }
        finish();
      };
      // Prefer leave+flush while the socket is still open; fall back to hard close.
      try {
        ws.send(JSON.stringify({ t: "leave" } satisfies ClientMsg));
      } catch {
        try {
          ws.close(1000, "travel");
        } catch {
          clearTimeout(timer);
          finish();
        }
      }
    });
  }

  /**
   * Open a fresh socket now.
   * @param userInitiated when true (LINK/R), reset the wallet 4001 recovery budget
   *   so the user gets another silent+prompt cycle. Silent auth recovery must pass false.
   */
  retryConnect(userInitiated = false, forceStale = false) {
    if (this.protocolBlocked) return;
    this.manualClose = false;
    if (userInitiated) {
      this.walletAuthFailures = 0;
      this.reconnectAttempts = 0;
      // LINK must escape a bad shard. Previously every tap reused `?inst=N`, so
      // a stale/unreachable instance was retried forever even though other slices
      // were healthy.
      if (this.zone) clearStickyInst(this.zone);
      this.url = withoutStickyInstance(this.url);
      // User tap: force a fresh socket even if one is mid-handshake (but only after
      // grace has elapsed — openSocket enforces that unless force=true after grace).
      const age = Date.now() - this.socketOpenedAt;
      const force = age >= NetClient.SOCKET_GRACE_MS || !this.ws || this.ws.readyState === WebSocket.CLOSED;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.openSocket(force);
      return;
    }
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.openSocket(forceStale);
  }

  /** Set the local movement intent (called every render frame by the scene). */
  setIntent(mx: number, my: number) {
    this.intent.mx = mx;
    this.intent.my = my;
  }

  /** Drive fixed-rate net ticks from the (variable-rate) render loop. */
  update(dtMs: number) {
    if (!this.connected) return;
    this.acc = Math.min(this.acc + dtMs, NET_TICK_MS * 5); // cap to avoid spiral of death
    while (this.acc >= NET_TICK_MS) {
      this.acc -= NET_TICK_MS;
      this.netTick();
    }
    // Smooth remotes / enemies / shots toward their latest authoritative target with a
    // FRAME-RATE-INDEPENDENT exponential ease: a = 1 - e^(-k·dt). A fixed per-frame factor
    // makes remotes crawl at low FPS (0.3/frame is 3× slower in wall-clock at 20 FPS than
    // 60) — the #1 cause of rubber-banding on weaker machines. k tuned so a≈0.3 (units) /
    // 0.6 (shots) at 60 FPS, but now correct at any frame rate.
    const dtSec = Math.min(dtMs, 100) / 1000; // clamp a stalled frame so nothing teleports
    const aUnit = 1 - Math.exp(-21 * dtSec);
    const aShot = 1 - Math.exp(-55 * dtSec);
    for (const r of this.remotes.values()) {
      r.x += (r.tx - r.x) * aUnit;
      r.y += (r.ty - r.y) * aUnit;
    }
    for (const e of this.enemies.values()) {
      e.x += (e.tx - e.x) * aUnit;
      e.y += (e.ty - e.y) * aUnit;
    }
    for (const s of this.shots.values()) {
      s.x += (s.tx - s.x) * aShot; // shots move fast — track closely
      s.y += (s.ty - s.y) * aShot;
    }
  }

  /** Walk speed including own-home furniture buffs (matches server step). */
  private walkSpeed(): number {
    if (this.estate?.mine && this.estate.furniture?.length) {
      const b = furnitureHomeBuffs(this.estate.furniture);
      return PLAYER.speed * (1 + (b.movePct || 0));
    }
    return PLAYER.speed;
  }

  private netTick() {
    this.seq++;
    const dashing = performance.now() < this.predDashUntil;
    const cmd: InputCmd = {
      seq: this.seq,
      mx: this.intent.mx,
      my: this.intent.my,
      ...(dashing ? { dashX: this.predDashX, dashY: this.predDashY } : {}),
    };
    // predict immediately — mid-dash the burst vector overrides intent, like the server
    if (dashing) stepMove(this.pred, { mx: this.predDashX, my: this.predDashY }, this.grid, NET_TICK_MS, PLAYER.dashSpeed);
    else stepMove(this.pred, cmd, this.grid, NET_TICK_MS, this.walkSpeed());
    this.pending.push(cmd);
    if (this.pending.length > NetClient.PENDING_CAP) {
      this.pending.splice(0, this.pending.length - NetClient.PENDING_CAP);
    }
    try {
      this.ws?.send(JSON.stringify({ t: "input", seq: cmd.seq, mx: cmd.mx, my: cmd.my } satisfies ClientMsg));
    } catch {
      /* socket hiccup; reconciliation will correct */
    }
  }

  /** Dash — sends the server-validated burst and predicts it locally (client + server
   *  run the same dash sim, so reconciliation stays quiet). Returns false on cooldown. */
  dash(dx: number, dy: number): boolean {
    const now = performance.now();
    if (now < this.dashCdUntil || this.dead || !this.connected) return false;
    const len = Math.hypot(dx, dy) || 1;
    this.predDashX = dx / len;
    this.predDashY = dy / len;
    this.predDashUntil = now + PLAYER.dashDurationMs;
    this.dashCdUntil = now + PLAYER.dashCooldownMs;
    try {
      this.ws?.send(JSON.stringify({ t: "dash", seq: this.seq, dx: this.predDashX, dy: this.predDashY } satisfies ClientMsg));
    } catch {
      // Offline — don't lock the player out of a full CD with no server resolution.
      this.dashCdUntil = 0;
      this.predDashUntil = 0;
      return false;
    }
    return true;
  }

  /** Class signature (Q) — the server resolves the effect; we track the cooldown for UI. */
  ability(aim: number, cooldownMs: number): boolean {
    const now = performance.now();
    if (now < this.abilityCdUntil || this.dead || !this.connected) return false;
    this.abilityCdUntil = now + cooldownMs;
    try {
      this.ws?.send(JSON.stringify({ t: "ability", seq: this.seq, aim } satisfies ClientMsg));
    } catch {
      this.abilityCdUntil = 0;
      return false;
    }
    return true;
  }

  /** Class ultimate (R) — no cooldown: HEAT is the cost, and the server holds the meter.
   *  `threshold` mirrors the server gate (kit-mod chips can lower it); server enforces. */
  ult(aim: number, threshold = 50): boolean {
    if (this.dead || this.heat < threshold || !this.connected) return false;
    try {
      this.ws?.send(JSON.stringify({ t: "ult", seq: this.seq, aim } satisfies ClientMsg));
    } catch {
      return false;
    }
    return true;
  }

  /** Class secondary (E) — same contract as the signature. */
  ability2(aim: number, cooldownMs: number): boolean {
    const now = performance.now();
    if (now < this.ability2CdUntil || this.dead || !this.connected) return false;
    this.ability2CdUntil = now + cooldownMs;
    try {
      this.ws?.send(JSON.stringify({ t: "ability2", seq: this.seq, aim } satisfies ClientMsg));
    } catch {
      this.ability2CdUntil = 0;
      return false;
    }
    return true;
  }

  private onMessage(data: unknown) {
    let msg: ServerMsg;
    try {
      msg = JSON.parse(typeof data === "string" ? data : "{}") as ServerMsg;
    } catch {
      return;
    }
    if (msg.t === "welcome") {
      this.clearWelcomeTimer();
      // Hard gate: mismatched protocol half-breaks panels — stop reconnect loops
      // and force a cache-busting reload so the player is not stranded offline.
      if (typeof msg.protocol === "number" && msg.protocol !== PROTOCOL_VERSION) {
        this.protocolBlocked = true;
        this.manualClose = true;
        this.connected = false;
        this.pushChat({
          from: "",
          ch: "sys",
          text: `⚠ CLIENT OUTDATED — reloading live client (server protocol ${msg.protocol}, client ${PROTOCOL_VERSION}).`,
          faction: -1,
          sys: true,
        });
        this.onConnectionState?.("offline");
        try {
          this.ws?.close(4000, "protocol");
        } catch {
          /* ignore */
        }
        notifyProtocolMismatch(msg.protocol, PROTOCOL_VERSION);
        return;
      }
      this.id = msg.id;
      if (typeof msg.inst === "number" && Number.isFinite(msg.inst) && msg.inst >= 0) {
        this.inst = Math.floor(msg.inst);
        if (this.zone) writeStickyInst(this.zone, this.inst);
        // Keep reconnect URL sticky so DO hibernation resume lands on the same shard.
        try {
          const u = new URL(this.url, typeof location !== "undefined" ? location.href : "http://local");
          u.searchParams.set("inst", String(this.inst));
          if (msg.zone) {
            this.zone = msg.zone;
            u.searchParams.set("zone", msg.zone);
          }
          this.url = u.toString().replace(/^http/, "ws");
        } catch {
          /* leave url as constructed */
        }
      }
      // Publish the authoritative player id so the (DOM) $METRO panel can talk to the
      // server bridge. Without this the bridge never learns who is logged in.
      setOnlinePlayer(msg.id);
      this.faction = msg.faction;
      this.connected = true;
      this.reloginAttempted = false;
      this.reconnectAttempts = 0;
      this.protocolBlocked = false;
      this.walletAuthFailures = 0;
      // Travel handoff consumed — further reconnects must NOT re-send `from`
      // (that was forcing door-mat respawn every blip).
      this.travelFrom = undefined;
      this.arrival = "organic";
      // Drop one-shot wallet sig after a successful login; session secret is enough.
      if (this.auth?.wallet && this.auth.sig) {
        this.auth = { wallet: this.auth.wallet };
      }
      this.onConnectionState?.("connected");
      // Never start a session inside geometry — snap even if the welcome coords were
      // a stale D1 point inside a wall / building roof / sealed pocket.
      const safe = resolveOpenSpawn(this.grid, { x: msg.x, y: msg.y });
      this.pred = { x: safe.x, y: safe.y };
      this.serverPos = { x: safe.x, y: safe.y };
      // Fresh authority — drop stale prediction history from a prior socket/session.
      this.pending = [];
      this.seq = 0;
      this.lastAck = 0;
      this.fragments = normalizeFragmentSequence(msg.fragments ?? []);
      // Server flag OR local allowlist on player id (covers older servers / missed field).
      this.godMode = !!msg.god || isGodAccount(msg.id);
      if (this.godMode) {
        this.tutorialDone = true;
        // Client-side map unlock immediately (server also sends discovered).
        const allZones = [
          "safe",
          "clinic",
          "shop",
          "bar",
          "den",
          "subway",
          "estates",
          ...Array.from({ length: 8 }, (_, i) => "d" + i),
          ...Array.from({ length: 7 }, (_, i) => "w" + i),
          ...Array.from({ length: 8 }, (_, i) => "v" + i),
        ];
        this.discovered = Array.from(new Set([...this.discovered, ...allZones]));
        this.unlocked = Array.from(new Set([...this.unlocked, ...allZones]));
        this.onDiscovered?.();
        this.pushChat({
          from: "",
          ch: "sys",
          text: `◆ GOD MODE active — invulnerable · full map · id ${msg.id}${msg.god ? "" : " (client allowlist)"}`,
          faction: -1,
          sys: true,
        });
      }
      this.onWelcome?.(msg.x, msg.y);
      if (this.pendingSkip) {
        this.pendingSkip = false;
        this.tutorialSkip();
      } else if (this.pendingGraduate) {
        this.pendingGraduate = false;
        this.tutorialGraduate();
      }
    } else if (msg.t === "state") {
      this.playersOnline = msg.players.length;
      const live = new Set<string>();
      for (const sp of msg.players) {
        live.add(sp.id);
        if (sp.id === this.id) {
          this.reconcile(sp.x, sp.y, sp.ack);
          this.hp = sp.hp;
          const wasDead = this.dead;
          this.dead = sp.dead;
          if (!sp.dead && wasDead) {
            // Local reprint completed — clear extract UI until the next death.
            this.deathExtract = false;
            this.deathExtractZone = null;
            this.deathExtractLabel = "";
            this.deathNearBoss = false;
          }
          this.credits = sp.credits;
          this.cores = sp.cores;
          this.metro = sp.metro ?? 0;
          this.pvpInArena = !!sp.pvpInArena;
          this.pvpEscrow = sp.pvpEscrow ?? 0;
          this.heat = sp.heat ?? this.heat;
          this.escortActive = !!sp.escort;
          this.xp = sp.xp;
          this.level = sp.level;
          if (sp.campaignQuest !== this.campaignQuest) {
            this.campaignQuest = sp.campaignQuest;
            this.onCampaign?.();
          }
          this.campaignStage = sp.campaignStage;
          this.campaignProgress = sp.campaignProgress;
          this.campaignObjective = sp.campaignObjective;
          // Snapshots can advance the drill without a dedicated tutorial message —
          // keep title/teach/hint aligned with the local step table so the UI never
          // stays stuck on the previous lesson's copy.
          if (sp.tutorialStep !== this.tutorialStep || sp.tutorialProgress !== this.tutorialProgress) {
            this.tutorialStep = sp.tutorialStep;
            this.tutorialProgress = sp.tutorialProgress;
            const def = tutorialStepAt(this.tutorialStep, this.tutorialMode);
            if (def) {
              this.tutorialTitle = def.title;
              this.tutorialTeach = def.teach;
              this.tutorialHint = def.hint;
            }
            // Derive portal gate from step table when only a snapshot arrives
            // (welcome/tutorial msgs set it explicitly; snapshots used to leave it stale).
            this.tutorialPortalOpen = tutorialReadyForPortal(this.tutorialStep, this.tutorialMode);
          } else {
            this.tutorialStep = sp.tutorialStep;
            this.tutorialProgress = sp.tutorialProgress;
          }
          this.tutorialDone = sp.tutorialDone;
          this.inTutorial = sp.inTutorial;
        } else {
          const r = this.remotes.get(sp.id) ?? {
            id: sp.id,
            x: sp.x,
            y: sp.y,
            tx: sp.x,
            ty: sp.y,
            hp: sp.hp,
            dead: sp.dead,
          };
          r.tx = sp.x;
          r.ty = sp.y;
          r.hp = sp.hp;
          r.dead = sp.dead;
          r.dash = !!sp.dash;
          r.escort = !!sp.escort;
          if (sp.look) r.look = sp.look;
          this.remotes.set(sp.id, r);
        }
      }
      for (const id of [...this.remotes.keys()]) if (!live.has(id)) this.remotes.delete(id);

      const liveE = new Set<number>();
      for (const e of msg.enemies) {
        liveE.add(e.id);
        const ne = this.enemies.get(e.id) ?? { id: e.id, x: e.x, y: e.y, tx: e.x, ty: e.y, hp: e.hp, kind: e.kind };
        ne.tx = e.x;
        ne.ty = e.y;
        ne.hp = e.hp;
        ne.kind = e.kind;
        ne.boss = e.boss;
        ne.name = e.name;
        ne.tint = e.tint;
        ne.hpMax = e.hpMax;
        ne.hvt = e.hvt;
        this.enemies.set(e.id, ne);
      }
      for (const id of [...this.enemies.keys()]) if (!liveE.has(id)) this.enemies.delete(id);

      const liveS = new Set<number>();
      for (const sh of msg.shots) {
        liveS.add(sh.id);
        const ns = this.shots.get(sh.id) ?? { id: sh.id, x: sh.x, y: sh.y, tx: sh.x, ty: sh.y, team: sh.team };
        ns.tx = sh.x;
        ns.ty = sh.y;
        this.shots.set(sh.id, ns);
      }
      for (const id of [...this.shots.keys()]) if (!liveS.has(id)) this.shots.delete(id);

      const liveP = new Set<number>();
      for (const pu of msg.pickups) {
        liveP.add(pu.id);
        this.pickups.set(pu.id, pu);
      }
      for (const id of [...this.pickups.keys()]) if (!liveP.has(id)) this.pickups.delete(id);

      this.hazards = msg.hazards ?? [];

      const liveN = new Set<number>();
      for (const n of msg.nodes) {
        liveN.add(n.id);
        this.nodes.set(n.id, n);
      }
      for (const id of [...this.nodes.keys()]) if (!liveN.has(id)) this.nodes.delete(id);

      this.factions = msg.factions;
      this.control = msg.control;
      // Roster is throttled server-side (~1 Hz) — keep last list when omitted/empty.
      if (Array.isArray(msg.roster) && msg.roster.length > 0) this.roster = msg.roster;
      this.boss = msg.boss ?? null;
    } else if (msg.t === "chat") {
      this.pushChat({
        from: msg.from,
        ch: msg.ch,
        text: msg.text,
        faction: msg.faction,
        sys: false,
        x: msg.x,
        y: msg.y,
      });
    } else if (msg.t === "sys") {
      this.lastSysText = msg.text; // a 4001 close right after carries this as its reason
      this.pushChat({ from: "", ch: "sys", text: msg.text, faction: -1, sys: true });
      try {
        this.onSysMessage?.(msg.text);
      } catch {
        /* UI hooks must never break the net loop */
      }
    } else if (msg.t === "death") {
      this.dead = true;
      this.deathStreak = msg.streak ?? 0;
      this.deathExtract = !!(msg.extract || msg.worldStart);
      this.deathExtractZone = msg.extractZone ?? null;
      this.deathExtractLabel =
        msg.extractLabel ??
        (msg.extract || msg.worldStart ? "RESPAWN AT CITY START" : "");
      this.deathNearBoss = !!msg.nearBoss;
      this.reprints = Math.max(this.reprints, Math.max(0, Math.floor(msg.reprints ?? 0)));
    } else if (msg.t === "kit_ack") {
      // Roll back optimistic CDs when the server rejected the cast.
      if (!msg.ok) {
        if (msg.slot === "dash") {
          this.dashCdUntil = 0;
          this.predDashUntil = 0;
        } else if (msg.slot === "q") this.abilityCdUntil = 0;
        else if (msg.slot === "e") this.ability2CdUntil = 0;
      } else if (typeof msg.cdMs === "number" && msg.cdMs > 0) {
        const until = performance.now() + msg.cdMs;
        if (msg.slot === "dash") this.dashCdUntil = until;
        else if (msg.slot === "q") this.abilityCdUntil = until;
        else if (msg.slot === "e") this.ability2CdUntil = until;
      }
    } else if (msg.t === "bye") {
      // Server finished durable flush — close settles disconnectAwait.
      this.manualClose = true;
      this.connected = false;
      try {
        this.ws?.close(1000, "bye");
      } catch {
        /* ignore */
      }
    } else if (msg.t === "emote") {
      this.emotes.push({ from: msg.from, kind: msg.kind, ping: msg.ping, x: msg.x, y: msg.y, at: performance.now() });
      if (this.emotes.length > 30) this.emotes.shift();
    } else if (msg.t === "party") {
      this.party = msg.members;
    } else if (msg.t === "tutorial") {
      this.tutorialStep = msg.step;
      this.tutorialProgress = msg.progress;
      this.tutorialTotal = msg.total;
      this.tutorialMode = msg.mode;
      this.tutorialPortalOpen = msg.portalOpen;
      this.tutorialTitle = msg.title;
      this.tutorialTeach = msg.teach;
      this.tutorialHint = msg.hint;
    } else if (msg.t === "redirect") {
      // Stop auto-reconnect to the OLD zone (tutorial graduate / skip was racing
      // scheduleReconnect and dropping people back into the drill yard).
      this.manualClose = true;
      this.connected = false;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      if (msg.rebalance && this.zone) clearStickyInst(this.zone);
      if (msg.rebalance && msg.zone) clearStickyInst(msg.zone);
      if (typeof msg.inst === "number" && Number.isFinite(msg.inst) && msg.zone && !msg.rebalance) {
        writeStickyInst(msg.zone, Math.floor(msg.inst));
      }
      this.pushChat({ from: "", ch: "sys", text: msg.text, faction: -1, sys: true });
      this.onRedirect?.(msg.zone, {
        inst: typeof msg.inst === "number" ? Math.floor(msg.inst) : undefined,
        rebalance: !!msg.rebalance,
      });
    } else if (msg.t === "campaign") {
      this.campaignQuest = msg.activeId;
      this.campaignStage = msg.stage;
      this.campaignProgress = msg.progress;
      this.campaignObjective = msg.objective ?? "";
      this.campaignCompleted = Array.isArray(msg.completed) ? msg.completed : [];
      this.campaignFlags = Array.isArray(msg.flags) ? msg.flags : [];
      this.onCampaign?.();
    } else if (msg.t === "story") {
      this.story = {
        quest: msg.quest,
        stage: msg.stage,
        title: msg.title,
        text: msg.text,
        journal: msg.journal,
        objective: msg.objective,
        done: msg.done,
        meltdown: !!msg.meltdown || msg.stage === "meltdown",
        choices: Array.isArray(msg.choices) ? msg.choices : undefined,
        at: performance.now(),
      };
      this.pushChat({
        from: "",
        ch: "sys",
        text: this.story.meltdown
          ? `◈ MELTDOWN — ${msg.title} · personal victory · CITY START`
          : `${msg.quest} — ${msg.title}`,
        faction: -1,
        sys: true,
      });
      this.onStory?.();
    } else if (msg.t === "fragment") {
      // a memory recovered at a dive core — surface it through the story panel
      if (msg.isNew && !this.fragments.includes(msg.id)) this.fragments.push(msg.id);
      const synthesis = (msg.interpretations ?? []).map((i) => `${i.title} · ${i.line}`).join("\n\n");
      this.story = {
        quest: "MEMORY RECOVERED",
        stage: msg.id,
        title: msg.title,
        text: [msg.lines.join("\n"), synthesis ? `MEMORY SYNTHESIS\n${synthesis}` : "", campaignEchoLine("fragment", this.campaignCompleted, this.campaignFlags)]
          .filter(Boolean)
          .join("\n\nANNOTATION · "),
        journal: "",
        objective: "",
        done: false,
        at: performance.now(),
      };
      this.onFragment?.(msg.id, msg.isNew);
      this.onStory?.();
    } else if (msg.t === "event") {
      this.worldEvent =
        msg.phase === "end"
          ? null
          : { id: msg.id, name: msg.name, tagline: msg.tagline, condition: msg.condition, hex: msg.hex, phase: msg.phase, untilAt: performance.now() + msg.seconds * 1000 };
      // Always mirror events into sys chat so they aren't missable without the banner.
      const phaseLabel = msg.phase === "telegraph" ? "incoming" : msg.phase === "active" ? "LIVE" : "ended";
      this.pushChat({
        from: "",
        ch: "sys",
        text: `◆ WORLD EVENT · ${msg.name} ${phaseLabel}${msg.phase !== "end" ? ` — ${msg.tagline}` : ""}`,
        faction: -1,
        sys: true,
      });
      this.onWorldEvent?.(msg.phase, msg.name);
    } else if (msg.t === "inv") {
      this.inventory = msg.items;
      this.onInventory?.();
    } else if (msg.t === "stashv") {
      this.stash = msg.items;
      this.onStash?.();
    } else if (msg.t === "estate") {
      this.estate = { id: msg.id, owner: msg.owner, ownerName: msg.ownerName, mine: msg.mine, forSale: msg.forSale, price: msg.price, furniture: msg.furniture, guests: msg.guests ?? [] };
      this.onEstate?.();
    } else if (msg.t === "estates_dir") {
      this.estatesDir = msg.list;
      this.onEstatesDir?.();
    } else if (msg.t === "equipped") {
      this.equipped = msg.items;
      this.maxHp = msg.maxHp;
      this.onInventory?.(); // refresh the bag (equipped marks) + HUD
    } else if (msg.t === "contracts") {
      this.contracts = msg.list;
      this.rep = msg.rep;
      this.repTier = msg.repTier;
      this.contractsDay = msg.day;
      this.onContracts?.();
    } else if (msg.t === "bounty") {
      this.bounty = msg.active;
      this.onBounty?.();
    } else if (msg.t === "relations") {
      this.relationships = msg.trust ?? {};
      this.districtStanding = Array.isArray(msg.districts) ? msg.districts : [];
      this.residentClues = Array.isArray(msg.clues) ? msg.clues : [];
      this.residentConfirmed = Array.isArray(msg.confirmed) ? msg.confirmed : [];
      this.reconstruction = Array.isArray(msg.reconstruction) ? msg.reconstruction : [];
      if (msg.social) this.socialMemory = msg.social;
      this.reprints = Math.max(0, Math.floor(msg.reprints ?? this.reprints));
      this.onRelations?.();
    } else if (msg.t === "civic") {
      this.civicMomentum[msg.district] = msg.completions;
      this.civicAftermath[msg.district] = {
        day: msg.day,
        operation: msg.operation,
        stage: msg.stage,
        completions: msg.completions,
        line: msg.line,
        eventDurationPct: msg.eventDurationPct,
      };
      this.onCivic?.();
    } else if (msg.t === "chronicle") {
      this.chronicle = { week: msg.week, headline: msg.headline, lines: msg.lines, civic: msg.civic, territory: msg.territory };
      this.onChronicle?.();
    } else if (msg.t === "discovered") {
      this.discovered = msg.zones;
      this.unlocked = msg.unlocked ?? msg.zones;
      this.onDiscovered?.();
    } else if (msg.t === "cosmetics") {
      this.cosmeticsOwned = msg.owned;
      this.cosmeticEquipped = msg.equipped;
      this.onCosmetics?.();
    } else if (msg.t === "market") {
      this.marketListings = msg.listings;
      this.onMarket?.();
    } else if (msg.t === "guild") {
      this.guild = msg.state === "info" ? msg.guild ?? null : null;
      this.onGuildUpdate?.();
    } else if (msg.t === "achv") {
      this.achievements = new Set(msg.ids);
    } else if (msg.t === "ach") {
      this.achievements.add(msg.id);
      this.pushChat({ from: "", ch: "sys", text: `★ ACHIEVEMENT — ${msg.name} (+₵${msg.reward})`, faction: -1, sys: true });
    } else if (msg.t === "trade") {
      if (msg.state === "done" || msg.state === "cancelled") {
        this.trade = null;
        this.pushChat({ from: "", ch: "sys", text: "trade: " + (msg.text ?? msg.state), faction: -1, sys: true });
      } else {
        this.trade = {
          with: msg.with ?? "",
          youOffer: msg.youOffer ?? { credits: 0, cores: 0 },
          theyOffer: msg.theyOffer ?? { credits: 0, cores: 0 },
          youConfirm: !!msg.youConfirm,
          theyConfirm: !!msg.theyConfirm,
        };
        if (msg.text) this.pushChat({ from: "", ch: "sys", text: "trade: " + msg.text, faction: -1, sys: true });
      }
    }
  }

  questAccept(id?: string) {
    this.sendMsg({ t: "quest", action: "accept", id });
  }
  questTalk() {
    this.sendMsg({ t: "quest", action: "talk" });
  }
  questChoice(choice: "spare" | "expose") {
    this.sendMsg({ t: "quest", action: "choice", choice });
  }
  /** FIXER interact — accept next campaign job, resolve talk beat, or re-brief. */
  questEngage() {
    this.sendMsg({ t: "quest", action: "engage" });
  }
  /** TENEMENT lockbox — server validates the venue, caps, and item ownership. */
  stashAction(action: "deposit" | "withdraw", itemId: string) {
    this.sendMsg({ t: "stash", action, itemId });
  }

  estateBuy() {
    this.sendMsg({ t: "estate", action: "buy" });
  }
  estateList(price: number) {
    this.sendMsg({ t: "estate", action: "list", price });
  }
  estateUnlist() {
    this.sendMsg({ t: "estate", action: "unlist" });
  }
  estateFurnish(furniture: EstateFurniture[]) {
    this.sendMsg({ t: "estate", action: "furnish", furniture });
  }
  estateSign() {
    this.sendMsg({ t: "estate", action: "sign" });
  }
  tutorialSkip() {
    if (!this.connected) {
      this.pendingSkip = true;
      return;
    }
    this.pendingSkip = false;
    this.sendMsg({ t: "tutorial", action: "skip" });
  }
  tutorialGraduate() {
    if (!this.connected) {
      this.pendingGraduate = true;
      return;
    }
    this.sendMsg({ t: "tutorial", action: "graduate" });
  }
  setTutorialMode(mode: "quick" | "full") {
    this.tutorialMode = mode;
    if (this.connected) this.sendMsg({ t: "tutorial", action: "mode", mode });
  }
  /**
   * Report drill progress. `n` lets instructor talk clear multi-count lessons
   * (e.g. fire needs 3) in a single E press without spam-swinging.
   */
  reportTutorial(kind: string, n = 1) {
    if (!this.connected) return; // server owns progress — silent no-op while offline
    this.sendMsg({ t: "tutorial", action: "progress", kind, n: Math.max(1, Math.min(8, n | 0)) });
  }

  /** City NPC service (heal / meal / rumor / train / fence…). Server owns prices + cooldowns. */
  npcService(npcId: string, service: string) {
    if (!this.connected) return;
    this.sendMsg({ t: "npc", action: "service", npcId: (npcId || "").slice(0, 48), service: (service || "").slice(0, 32) });
  }

  tradeRequest(to: string) {
    this.sendMsg({ t: "trade", action: "request", to });
  }
  tradeAccept() {
    this.sendMsg({ t: "trade", action: "accept" });
  }
  tradeOffer(credits: number, cores: number) {
    this.sendMsg({ t: "trade", action: "offer", credits, cores });
  }
  tradeConfirm() {
    this.sendMsg({ t: "trade", action: "confirm" });
  }
  tradeCancel() {
    this.sendMsg({ t: "trade", action: "cancel" });
  }

  private pushChat(line: {
    from: string;
    ch: string;
    text: string;
    faction: number;
    sys: boolean;
    x?: number;
    y?: number;
  }) {
    this.chatLog.push({ ...line, at: performance.now() });
    if (this.chatLog.length > 40) this.chatLog.shift();
  }

  sendChat(ch: "zone" | "party" | "whisper" | "guild", to: string | undefined, text: string) {
    this.sendMsg({ t: "chat", ch, to, text });
  }
  sendParty(action: "invite" | "accept" | "leave" | "revive", to?: string) {
    this.sendMsg({ t: "party", action, to });
  }
  /** Auction house — server escrows the item + settles atomically (cross-zone, D1). */
  marketBrowse() {
    this.sendMsg({ t: "market", action: "browse" });
  }
  marketList(itemId: string, price: number, currency: "credits" | "metro" = "credits") {
    this.sendMsg({ t: "market", action: "list", itemId, price, currency });
  }
  marketCancel(id: number) {
    this.sendMsg({ t: "market", action: "cancel", id });
  }
  marketBuy(id: number) {
    this.sendMsg({ t: "market", action: "buy", id });
  }
  /** Cosmetics / transmog — server owns ownership + the equipped override (zero power). */
  cosmeticAction(action: "buy" | "equip" | "unequip" | "list", id?: string) {
    this.sendMsg({ t: "cosmetic", action, id });
  }
  /** Accept an authored NPC bounty (server validates one-at-a-time + grants on completion). */
  bountyAccept(id: string) {
    this.sendMsg({ t: "bounty", action: "accept", id });
  }
  /** Persist that this contact has been met. Social state only; no reward attached. */
  npcTalk(npcId: string) {
    this.sendMsg({ t: "npc", action: "talk", npcId });
  }
  /** Guild ("Cell") action — server validates rank/balance + owns the shared bank (D1). */
  guildAction(
    action:
      | "create"
      | "invite"
      | "accept"
      | "leave"
      | "promote"
      | "demote"
      | "kick"
      | "deposit"
      | "withdraw"
      | "info"
      | "claim_goal",
    extra: { name?: string; tag?: string; to?: string; credits?: number; cores?: number } = {},
  ) {
    this.sendMsg({ t: "guild", action, ...extra });
  }
  sendMute(to: string) {
    this.sendMsg({ t: "mute", to });
  }

  /** Instant local reprint at last standing position (while dead). */
  respawnLocal() {
    if (!this.connected || !this.dead) return;
    this.sendMsg({ t: "respawn", mode: "local" });
  }

  /**
   * Respawn at world start (METRO CITY hub pad — same pad new runners use).
   * Always available when the death payload offered it (outside the drill yard).
   * `extract` is a legacy alias accepted by the server.
   */
  respawnExtract() {
    if (!this.connected || !this.dead || !this.deathExtract) return;
    this.sendMsg({ t: "respawn", mode: "start" });
  }

  /** Alias for respawnExtract — world-start pad. */
  respawnWorldStart() {
    this.respawnExtract();
  }
  /** Send an emote (anchored to you) or a world ping (carries the aim point). */
  sendEmote(kind: number, ping: boolean, x: number, y: number) {
    this.sendMsg({ t: "emote", kind, ping, x, y });
  }
  private sendMsg(m: ClientMsg) {
    try {
      this.ws?.send(JSON.stringify(m));
    } catch {
      /* socket hiccup */
    }
  }

  /**
   * Send a fire intent (aim in radians).
   * Client-throttled just under the weapon cadence so hold-F always lands a shot
   * without flooding the socket (server still enforces the real rate limit).
   */
  fire(aim: number, fireRateMs?: number) {
    if (!this.connected || this.dead) return;
    const now = performance.now();
    // Match equipped weapon cadence (defaults to PLAYER_FIRE_MS). Stay slightly under
    // server spacing so hold-F never soft-drops a legitimate attack.
    const cadence = fireRateMs ?? PLAYER_FIRE_MS;
    const gap = Math.max(40, cadence * 0.88);
    if (now - this.lastFireSentAt < gap) return;
    this.lastFireSentAt = now;
    try {
      this.ws?.send(JSON.stringify({ t: "fire", seq: this.seq, aim } satisfies ClientMsg));
    } catch {
      /* socket hiccup */
    }
  }

  /** Snap to the authoritative position and replay still-unacked inputs. */
  private reconcile(sx: number, sy: number, ack: number) {
    this.serverPos = { x: sx, y: sy };
    this.lastAck = ack;
    this.pending = this.pending.filter((c) => c.seq > ack);
    const prevX = this.pred.x;
    const prevY = this.pred.y;
    this.pred.x = sx;
    this.pred.y = sy;
    const walk = this.walkSpeed();
    for (const c of this.pending) {
      // replay dashes at dash speed — otherwise the burst reads as prediction error
      if (c.dashX !== undefined) stepMove(this.pred, { mx: c.dashX, my: c.dashY ?? 0 }, this.grid, NET_TICK_MS, PLAYER.dashSpeed);
      else stepMove(this.pred, c, this.grid, NET_TICK_MS, walk);
    }
    this.lastError = Math.hypot(this.pred.x - prevX, this.pred.y - prevY);
    if (this.lastError > 0.01) this.reconciles++;
  }

  stats(): NetStats {
    return {
      connected: this.connected,
      id: this.id,
      ack: this.lastAck,
      pending: this.pending.length,
      serverX: this.serverPos.x,
      serverY: this.serverPos.y,
      predX: this.pred.x,
      predY: this.pred.y,
      error: this.lastError,
      reconciles: this.reconciles,
      players: this.playersOnline,
    };
  }
}
