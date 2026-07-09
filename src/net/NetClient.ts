import { stepMove, NET_TICK_MS, PLAYER_HP, type MoveState } from "./sim";
import { PLAYER } from "../config";
import type { TileGrid } from "../world/district";
import type { ClientMsg, ServerMsg, InputCmd, PlayerLook, Item } from "./protocol";

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
  credits = 0;
  cores = 0;
  metro = 0;
  pvpInArena = false;
  pvpEscrow = 0;
  inventory: Item[] = []; // server-authoritative held gear (sent on login + on change)
  stash: Item[] = []; // personal safe storage (TENEMENT lockbox), server-authoritative
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
  tutorialStep = 0;
  tutorialProgress = 0;
  tutorialTotal = 9;
  tutorialMode: "quick" | "full" = "quick";
  tutorialDone = false;
  inTutorial = false;
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
  } = null;
  onGuildUpdate?: () => void;
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
    at: number;
  } | null = null;
  lastError = 0;
  reconciles = 0;
  lastAck = 0;
  playersOnline = 0;
  onWelcome?: (x: number, y: number) => void;
  onInventory?: () => void; // fired when the server pushes an inventory update
  onStash?: () => void; // fired when the server pushes a stash update
  onRedirect?: (zone: string) => void;
  /** Memory fragments this player has recovered (dive rewards; welcome + live updates). */
  fragments: string[] = [];
  onFragment?: (id: string, isNew: boolean) => void;
  /** The district's live world event (null when idle). */
  worldEvent: { id: string; name: string; tagline: string; hex: string; phase: "telegraph" | "active"; untilAt: number } | null = null;
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

  private ws?: WebSocket;
  private manualClose = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingGraduate = false;
  private intent = { mx: 0, my: 0 };
  private seq = 0;
  private pending: InputCmd[] = [];
  private acc = 0;

  constructor(
    private grid: TileGrid,
    private name: string,
    private url: string,
    private loginFaction = 0,
    private look?: PlayerLook,
  ) {}

  /** Optional signed wallet proof; when set, login is a durable wallet identity. */
  private auth?: { wallet: string; sig: string; ts: number };
  setAuth(proof?: { wallet: string; sig: string; ts: number }) {
    this.auth = proof;
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
    this.openSocket();
  }

  private openSocket() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.onConnectionState?.(this.reconnectAttempts > 0 ? "reconnecting" : "connecting");
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () =>
      ws.send(
        JSON.stringify({
          t: "login",
          name: this.name,
          faction: this.loginFaction,
          look: this.look,
          arrival: this.arrival,
          classId: this.classId,
          ...(this.travelFrom ? { from: this.travelFrom } : {}),
          ...(this.auth ?? {}),
        } satisfies ClientMsg),
      );
    ws.onmessage = (e) => this.onMessage(e.data);
    ws.onclose = () => {
      this.connected = false;
      if (!this.manualClose) this.scheduleReconnect();
    };
    ws.onerror = () => {
      this.connected = false;
    };
  }

  private scheduleReconnect() {
    if (this.manualClose) return;
    if (this.reconnectAttempts >= 8) {
      this.onConnectionState?.("offline");
      return;
    }
    const delay = Math.min(16000, Math.round(800 * Math.pow(1.6, this.reconnectAttempts)));
    this.reconnectAttempts++;
    this.onConnectionState?.("reconnecting");
    this.reconnectTimer = setTimeout(() => {
      if (!this.manualClose) this.openSocket();
    }, delay);
  }

  disconnect() {
    this.manualClose = true;
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

  retryConnect() {
    this.reconnectAttempts = 0;
    this.manualClose = false;
    this.openSocket();
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
    else stepMove(this.pred, cmd, this.grid, NET_TICK_MS);
    this.pending.push(cmd);
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
    if (now < this.dashCdUntil || this.dead) return false;
    const len = Math.hypot(dx, dy) || 1;
    this.predDashX = dx / len;
    this.predDashY = dy / len;
    this.predDashUntil = now + PLAYER.dashDurationMs;
    this.dashCdUntil = now + PLAYER.dashCooldownMs;
    try {
      this.ws?.send(JSON.stringify({ t: "dash", seq: this.seq, dx: this.predDashX, dy: this.predDashY } satisfies ClientMsg));
    } catch {
      /* offline — prediction still gives the feel; server corrects on reconnect */
    }
    return true;
  }

  /** Class signature (Q) — the server resolves the effect; we track the cooldown for UI. */
  ability(aim: number, cooldownMs: number): boolean {
    const now = performance.now();
    if (now < this.abilityCdUntil || this.dead) return false;
    this.abilityCdUntil = now + cooldownMs;
    try {
      this.ws?.send(JSON.stringify({ t: "ability", seq: this.seq, aim } satisfies ClientMsg));
    } catch {
      /* offline */
    }
    return true;
  }

  /** Class ultimate (R) — no cooldown: HEAT is the cost, and the server holds the meter.
   *  `threshold` mirrors the server gate (kit-mod chips can lower it); server enforces. */
  ult(aim: number, threshold = 50): boolean {
    if (this.dead || this.heat < threshold) return false;
    try {
      this.ws?.send(JSON.stringify({ t: "ult", seq: this.seq, aim } satisfies ClientMsg));
    } catch {
      /* offline */
    }
    return true;
  }

  /** Class secondary (E) — same contract as the signature. */
  ability2(aim: number, cooldownMs: number): boolean {
    const now = performance.now();
    if (now < this.ability2CdUntil || this.dead) return false;
    this.ability2CdUntil = now + cooldownMs;
    try {
      this.ws?.send(JSON.stringify({ t: "ability2", seq: this.seq, aim } satisfies ClientMsg));
    } catch {
      /* offline */
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
      this.id = msg.id;
      this.faction = msg.faction;
      this.connected = true;
      this.reconnectAttempts = 0;
      this.onConnectionState?.("connected");
      this.pred = { x: msg.x, y: msg.y };
      this.serverPos = { x: msg.x, y: msg.y };
      this.fragments = msg.fragments ?? [];
      this.onWelcome?.(msg.x, msg.y);
      if (this.pendingGraduate) {
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
          this.dead = sp.dead;
          this.credits = sp.credits;
          this.cores = sp.cores;
          this.metro = sp.metro ?? 0;
          this.pvpInArena = !!sp.pvpInArena;
          this.pvpEscrow = sp.pvpEscrow ?? 0;
          this.heat = sp.heat ?? this.heat;
          this.escortActive = !!sp.escort;
          this.xp = sp.xp;
          this.level = sp.level;
          this.campaignQuest = sp.campaignQuest;
          this.campaignStage = sp.campaignStage;
          this.campaignProgress = sp.campaignProgress;
          this.campaignObjective = sp.campaignObjective;
          this.tutorialStep = sp.tutorialStep;
          this.tutorialProgress = sp.tutorialProgress;
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
      this.roster = msg.roster;
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
      this.pushChat({ from: "", ch: "sys", text: msg.text, faction: -1, sys: true });
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
      this.connected = false;
      this.pushChat({ from: "", ch: "sys", text: msg.text, faction: -1, sys: true });
      this.onRedirect?.(msg.zone);
    } else if (msg.t === "story") {
      this.story = {
        quest: msg.quest,
        stage: msg.stage,
        title: msg.title,
        text: msg.text,
        journal: msg.journal,
        objective: msg.objective,
        done: msg.done,
        at: performance.now(),
      };
      this.pushChat({ from: "", ch: "sys", text: `${msg.quest} — ${msg.title}`, faction: -1, sys: true });
    } else if (msg.t === "fragment") {
      // a memory recovered at a dive core — surface it through the story panel
      if (msg.isNew && !this.fragments.includes(msg.id)) this.fragments.push(msg.id);
      this.story = {
        quest: "MEMORY RECOVERED",
        stage: msg.id,
        title: msg.title,
        text: msg.lines.join("\n"),
        journal: "",
        objective: "",
        done: false,
        at: performance.now(),
      };
      this.onFragment?.(msg.id, msg.isNew);
    } else if (msg.t === "event") {
      this.worldEvent =
        msg.phase === "end"
          ? null
          : { id: msg.id, name: msg.name, tagline: msg.tagline, hex: msg.hex, phase: msg.phase, untilAt: performance.now() + msg.seconds * 1000 };
      this.onWorldEvent?.(msg.phase, msg.name);
    } else if (msg.t === "inv") {
      this.inventory = msg.items;
      this.onInventory?.();
    } else if (msg.t === "stashv") {
      this.stash = msg.items;
      this.onStash?.();
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
  /** TENEMENT lockbox — server validates the venue, caps, and item ownership. */
  stashAction(action: "deposit" | "withdraw", itemId: string) {
    this.sendMsg({ t: "stash", action, itemId });
  }
  tutorialSkip() {
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
  reportTutorial(kind: string) {
    this.sendMsg({ t: "tutorial", action: "progress", kind });
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
  sendParty(action: "invite" | "accept" | "leave", to?: string) {
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
  /** Guild ("Cell") action — server validates rank/balance + owns the shared bank (D1). */
  guildAction(
    action: "create" | "invite" | "accept" | "leave" | "promote" | "demote" | "kick" | "deposit" | "withdraw" | "info",
    extra: { name?: string; tag?: string; to?: string; credits?: number; cores?: number } = {},
  ) {
    this.sendMsg({ t: "guild", action, ...extra });
  }
  sendMute(to: string) {
    this.sendMsg({ t: "mute", to });
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

  /** Send a fire intent (aim in radians). The server validates rate + resolves hits. */
  fire(aim: number) {
    if (!this.connected || this.dead) return;
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
    for (const c of this.pending) {
      // replay dashes at dash speed — otherwise the burst reads as prediction error
      if (c.dashX !== undefined) stepMove(this.pred, { mx: c.dashX, my: c.dashY ?? 0 }, this.grid, NET_TICK_MS, PLAYER.dashSpeed);
      else stepMove(this.pred, c, this.grid, NET_TICK_MS);
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
