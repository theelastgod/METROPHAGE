import { stepMove, NET_TICK_MS, PLAYER_HP, type MoveState } from "./sim";
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
  inventory: Item[] = []; // server-authoritative held gear (sent on login + on change)
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
  singularity = 0;
  meltdown = false;
  season = 1;
  pickups = new Map<number, { id: number; x: number; y: number; kind: number }>();
  hazards: Array<{ id: number; x: number; y: number; r: number; frac: number }> = []; // boss AoE telegraphs
  faction = 0;
  nodes = new Map<number, { id: number; x: number; y: number; owner: number; progress: number; by: number }>();
  factions: number[] = [0, 0, 0, 0];
  control = -1;
  roster: Array<{ id: string; faction: number; level: number }> = [];
  /** Zone world-boss status (location + respawn countdown), for the locator UI. */
  boss: { name: string; x: number; y: number; hp: number; hpMax: number; alive: boolean; respawnSec: number } | null = null;
  party: string[] = [];
  chatLog: Array<{ from: string; ch: string; text: string; faction: number; sys: boolean }> = [];
  /** Recent emotes/pings relayed by the server (rendered + aged out by the scene). */
  emotes: Array<{ from: string; kind: number; ping: boolean; x: number; y: number; at: number }> = [];
  questStep = 0;
  questProgress = 0;
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
  story: { act: string; title: string; text: string; done: boolean; at: number } | null = null;
  lastError = 0;
  reconciles = 0;
  lastAck = 0;
  playersOnline = 0;
  onWelcome?: (x: number, y: number) => void;
  onInventory?: () => void; // fired when the server pushes an inventory update

  private ws?: WebSocket;
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
  buy(sku: string) {
    this.ws?.send(JSON.stringify({ t: "buy", sku } satisfies ClientMsg));
  }
  /** Gear forge — server validates + deducts credits/cores, then pushes inv + loadout. */
  craft(action: "upgrade" | "reforge" | "salvage" | "fuse", itemId: string, itemId2?: string) {
    this.ws?.send(JSON.stringify({ t: "craft", action, itemId, itemId2 } satisfies ClientMsg));
  }

  connect() {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () =>
      ws.send(
        JSON.stringify({
          t: "login",
          name: this.name,
          faction: this.loginFaction,
          look: this.look,
          ...(this.auth ?? {}),
        } satisfies ClientMsg),
      );
    ws.onmessage = (e) => this.onMessage(e.data);
    ws.onclose = () => (this.connected = false);
    ws.onerror = () => (this.connected = false);
  }

  disconnect() {
    try {
      this.ws?.close();
    } catch {
      /* already closed */
    }
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
    // smooth remotes / enemies toward their latest authoritative target
    for (const r of this.remotes.values()) {
      r.x += (r.tx - r.x) * 0.3;
      r.y += (r.ty - r.y) * 0.3;
    }
    for (const e of this.enemies.values()) {
      e.x += (e.tx - e.x) * 0.3;
      e.y += (e.ty - e.y) * 0.3;
    }
    for (const s of this.shots.values()) {
      s.x += (s.tx - s.x) * 0.6; // shots move fast — track closely
      s.y += (s.ty - s.y) * 0.6;
    }
  }

  private netTick() {
    this.seq++;
    const cmd: InputCmd = { seq: this.seq, mx: this.intent.mx, my: this.intent.my };
    stepMove(this.pred, cmd, this.grid, NET_TICK_MS); // predict immediately
    this.pending.push(cmd);
    try {
      this.ws?.send(JSON.stringify({ t: "input", ...cmd } satisfies ClientMsg));
    } catch {
      /* socket hiccup; reconciliation will correct */
    }
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
      this.pred = { x: msg.x, y: msg.y };
      this.serverPos = { x: msg.x, y: msg.y };
      this.onWelcome?.(msg.x, msg.y);
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
          this.xp = sp.xp;
          this.level = sp.level;
          this.questStep = sp.questStep;
          this.questProgress = sp.questProgress;
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

      this.singularity = msg.sing;
      this.meltdown = msg.meltdown;
      this.season = msg.season;
      this.factions = msg.factions;
      this.control = msg.control;
      this.roster = msg.roster;
      this.boss = msg.boss ?? null;
    } else if (msg.t === "chat") {
      this.pushChat({ from: msg.from, ch: msg.ch, text: msg.text, faction: msg.faction, sys: false });
    } else if (msg.t === "sys") {
      this.pushChat({ from: "", ch: "sys", text: msg.text, faction: -1, sys: true });
    } else if (msg.t === "emote") {
      this.emotes.push({ from: msg.from, kind: msg.kind, ping: msg.ping, x: msg.x, y: msg.y, at: performance.now() });
      if (this.emotes.length > 30) this.emotes.shift();
    } else if (msg.t === "party") {
      this.party = msg.members;
    } else if (msg.t === "story") {
      this.story = { act: msg.act, title: msg.title, text: msg.text, done: msg.done, at: performance.now() };
      this.pushChat({ from: "", ch: "sys", text: `${msg.act} — ${msg.title}`, faction: -1, sys: true });
    } else if (msg.t === "inv") {
      this.inventory = msg.items;
      this.onInventory?.();
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

  private pushChat(line: { from: string; ch: string; text: string; faction: number; sys: boolean }) {
    this.chatLog.push(line);
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
    for (const c of this.pending) stepMove(this.pred, c, this.grid, NET_TICK_MS);
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
