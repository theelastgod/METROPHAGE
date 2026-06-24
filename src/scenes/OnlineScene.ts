import Phaser from "phaser";
import { COLORS, TILE } from "../config";
import { TILESET_KEY, PLAYER_KEY, COP_KEY, BULLET_KEY, GLOW_KEY, NODE_KEY } from "../assets/manifest";
import { driveChar } from "../assets/anim";
import {
  PLAYER_HP,
  SING_MAX,
  PICKUP_CORE,
  xpIntoLevel,
  FACTION_COLORS,
  FACTION_NAMES,
  NEUTRAL,
  factionForColor,
  PVP_ZONES,
  inPvpZone,
} from "../net/sim";
import { buildGrid } from "../world/district";
import { DISTRICTS } from "../game/districts";
import { ENEMY_BARKS } from "../game/enemies";
import { WORLD_W, WORLD_H } from "../net/sim";
import NetClient from "../net/NetClient";
import NeonPipeline from "../render/NeonPipeline";
import { QUESTLINE } from "../net/quest";
import { setOnlinePlayer } from "../economy/session";
import {
  sanitizeCustomization,
  customizationToLook,
  bakeCustomPlayer,
  bakeRemoteLook,
  lookKey,
  PLAYER_CUSTOM_KEY,
  type Customization,
} from "../game/customization";

const SERVER_URL =
  (import.meta.env as Record<string, string | undefined>).VITE_SERVER_URL ??
  "ws://127.0.0.1:8787/ws";

/** HSS archetype tints (index = enemy kind), matching the singleplayer reads. */
const ENEMY_KIND_TINT = [0xff3b6b, 0x39ffd0, 0xffe06a, 0xff5ad0];

/** Emote wheel — first four float over your avatar; the rest drop a world ping marker. */
const EMOTES: Array<{ text: string; ping: boolean }> = [
  { text: "GG", ping: false },
  { text: "NICE", ping: false },
  { text: "HELP!", ping: false },
  { text: "?!", ping: false },
  { text: "▶ RALLY", ping: true },
  { text: "ON ME", ping: true },
  { text: "FALL BACK", ping: true },
  { text: "ENEMY", ping: true },
];

/**
 * Step 2 — the online game client. Renders the real district + player, but the
 * local player's movement is SERVER-AUTHORITATIVE: the client predicts with the
 * shared sim (zero-latency feel) and reconciles against the server's snapshots.
 * Walls, speed and bounds are enforced server-side. A net-debug HUD makes the
 * prediction/reconciliation observable.
 *
 * Combat / loot / currency / progression / Singularity authority layer onto this
 * same client-predicts / server-decides pattern in the next Step-2 commits.
 */
export default class OnlineScene extends Phaser.Scene {
  private net!: NetClient;
  private me!: Phaser.GameObjects.Sprite;
  private remoteSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private remoteLabels = new Map<string, Phaser.GameObjects.Text>();
  private enemySprites = new Map<number, Phaser.GameObjects.Sprite>();
  private shotSprites = new Map<number, Phaser.GameObjects.Image>();
  private pickupSprites = new Map<number, Phaser.GameObjects.Image>();
  private nodeSprites = new Map<number, Phaser.GameObjects.Sprite>();
  private nodeG!: Phaser.GameObjects.Graphics;
  private faction = 0;
  private hud!: Phaser.GameObjects.Text;
  private hpBar!: Phaser.GameObjects.Graphics;
  private deadText!: Phaser.GameObjects.Text;
  private meltdownFx!: Phaser.GameObjects.Rectangle;
  private meltdownText!: Phaser.GameObjects.Text;
  private lastSeason = -1;
  private chatLogText!: Phaser.GameObjects.Text;
  private chatInput!: Phaser.GameObjects.Text;
  private rosterText!: Phaser.GameObjects.Text;
  private tradeText!: Phaser.GameObjects.Text;
  private questText!: Phaser.GameObjects.Text;
  private storyPanel!: Phaser.GameObjects.Text;
  private chatOpen = false;
  private chatBuffer = "";
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private color: number = COLORS.player;
  private callsign = "runner";
  private zone = "d0";
  private districtIndex = 0;
  private meDir = new Phaser.Math.Vector2(0, 1); // last facing for the local avatar
  private nextEnemyBarkAt = 0; // throttle for online HSS barks
  private emoteWheelOpen = false;
  private wheelObjs: Phaser.GameObjects.GameObject[] = [];
  private lastEmoteShownAt = 0; // newest relayed emote already rendered
  private wasInPvp = false; // last-frame PvP-arena state (for enter/exit warnings)
  private pvpWarn!: Phaser.GameObjects.Text;
  private pvpTag!: Phaser.GameObjects.Text;

  constructor() {
    super("Online");
  }

  create(data?: { zone?: string }) {
    const rawCust = this.registry.get("customization") as Customization | undefined;
    const cust = sanitizeCustomization(rawCust, this.registry.get("classId") as string | undefined);
    this.callsign = (rawCust?.callsign || "runner").toLowerCase();
    this.color = cust.color;
    this.emoteWheelOpen = false; // reset transient UI across scene.restart (travel)
    this.wheelObjs = [];
    this.lastEmoteShownAt = 0;

    // Zone = which district this client is in. Travel hands off to another DO.
    this.districtIndex = this.parseZone(data?.zone);
    this.zone = "d" + this.districtIndex;
    const def = DISTRICTS[this.districtIndex];

    this.cameras.main.setBackgroundColor(COLORS.bgVoid);

    // Real world — same grid + tileset the server simulates against.
    const grid = buildGrid(def);
    const map = this.make.tilemap({ data: grid, tileWidth: TILE, tileHeight: TILE });
    const tileset = map.addTilesetImage(TILESET_KEY, TILESET_KEY, TILE, TILE)!;
    map.createLayer(0, tileset, 0, 0)!;
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.applyNeon();
    this.drawPvpZones(); // mark the free-for-all arenas (server enforces the damage)

    // Local player — your full customization (build/head/visor/shoulders/decal/cloak/
    // accessories), baked and tinted by your signature colour, the same as singleplayer.
    bakeCustomPlayer(this, cust);
    this.me = this.add
      .sprite(WORLD_W / 2, WORLD_H / 2, PLAYER_CUSTOM_KEY, 0)
      .setTint(0xffffff) // baked in final colours — render untinted
      .setDepth(10)
      .setVisible(false);

    const url = SERVER_URL + (SERVER_URL.includes("?") ? "&" : "?") + "zone=" + this.zone;
    this.faction = factionForColor(this.color); // your cell, from your signature colour
    this.nodeG = this.add.graphics().setDepth(5); // node capture rings (world-space)
    // Send your look so every other player renders your customization (not a generic body).
    this.net = new NetClient(grid, this.callsign, url, this.faction, customizationToLook(cust));
    this.net.onWelcome = (x, y) => {
      this.me.setPosition(x, y).setVisible(true);
      this.cameras.main.startFollow(this.me, true, 0.18, 0.18);
      setOnlinePlayer(this.net.id); // let the $METRO bridge panel address this player
    };
    this.net.connect();

    this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT") as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;

    this.hud = this.add
      .text(12, 12, "connecting…", {
        fontFamily: "Courier New, monospace",
        fontSize: "11px",
        color: "#39ff88",
        lineSpacing: 3,
      })
      .setScrollFactor(0)
      .setDepth(1000);
    this.add
      .text(
        this.scale.width / 2,
        this.scale.height - 12,
        `WASD · CLICK fire · V emote · ENTER chat (/w /party /trade <name> /offer /confirm) · [1-${DISTRICTS.length}] travel · ESC`,
        { fontFamily: "Courier New, monospace", fontSize: "11px", color: "#6b7184" },
      )
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(1000);

    // server-wide meltdown FX (everyone sees it together)
    this.meltdownFx = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0xff2b3b, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(1002);
    this.meltdownText = this.add
      .text(this.scale.width / 2, 74, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "20px",
        color: "#ff3b6b",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1003)
      .setVisible(false);

    this.hpBar = this.add.graphics().setScrollFactor(0).setDepth(1000);
    this.deadText = this.add
      .text(this.scale.width / 2, this.scale.height / 2, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "20px",
        color: "#ff3b6b",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1001)
      .setVisible(false);

    // PvP arena warning (center) + a persistent tag while you're inside one
    this.pvpWarn = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 110, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "16px",
        color: "#ff3b6b",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1004)
      .setAlpha(0);
    this.pvpTag = this.add
      .text(12, this.scale.height - 80, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "12px",
        color: "#ff5a6b",
        fontStyle: "bold",
      })
      .setScrollFactor(0)
      .setDepth(1001)
      .setVisible(false);

    // chat log (bottom-left), input line, roster panel (top-right)
    this.chatLogText = this.add
      .text(12, this.scale.height - 70, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "11px",
        color: "#cdd6e6",
        lineSpacing: 2,
      })
      .setOrigin(0, 1)
      .setScrollFactor(0)
      .setDepth(1000);
    this.chatInput = this.add
      .text(12, this.scale.height - 38, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "12px",
        color: "#f7ff3c",
      })
      .setScrollFactor(0)
      .setDepth(1001)
      .setVisible(false);
    this.rosterText = this.add
      .text(this.scale.width - 12, 98, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "10px",
        color: "#9aa3b2",
        align: "right",
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1000);
    this.tradeText = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 70, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "13px",
        color: "#f7ff3c",
        align: "center",
        backgroundColor: "#0b0716cc",
        padding: { x: 14, y: 10 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1005)
      .setVisible(false);
    this.questText = this.add
      .text(this.scale.width / 2, 8, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "12px",
        color: "#b06bff",
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1000);
    this.storyPanel = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 40, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "13px",
        color: "#eafdff",
        align: "center",
        backgroundColor: "#0b0716ee",
        padding: { x: 18, y: 14 },
        wordWrap: { width: 540 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1006)
      .setVisible(false);

    // Unified keyboard: chat mode captures text; game mode moves / travels / exits.
    this.input.keyboard!.on("keydown", (e: KeyboardEvent) => {
      if (this.chatOpen) {
        if (e.key === "Enter") {
          this.submitChat();
          this.closeChat();
        } else if (e.key === "Escape") {
          this.closeChat();
        } else if (e.key === "Backspace") {
          this.chatBuffer = this.chatBuffer.slice(0, -1);
          this.renderChatInput();
        } else if (e.key.length === 1 && this.chatBuffer.length < 200) {
          this.chatBuffer += e.key;
          this.renderChatInput();
        }
        return;
      }
      if (this.emoteWheelOpen) {
        if (e.key === "Escape" || e.key === "v" || e.key === "V") this.closeWheel();
        return;
      }
      if (e.key === "v" || e.key === "V") {
        this.openWheel();
        return;
      }
      if (e.key === "Enter" || e.key === "t" || e.key === "T") {
        this.openChat();
      } else if (e.key === "Escape") {
        this.net.disconnect();
        this.scene.start("Select");
      } else {
        const k = parseInt(e.key, 10);
        if (k >= 1 && k <= DISTRICTS.length) {
          const z = "d" + (k - 1);
          if (z !== this.zone) {
            this.net.disconnect();
            this.scene.restart({ zone: z });
          }
        }
      }
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.net?.disconnect();
      setOnlinePlayer(null);
    });
  }

  private openChat() {
    this.chatOpen = true;
    this.chatBuffer = "";
    this.chatInput.setVisible(true);
    this.renderChatInput();
  }
  private closeChat() {
    this.chatOpen = false;
    this.chatInput.setVisible(false);
  }
  private renderChatInput() {
    this.chatInput.setText("> " + this.chatBuffer + "_");
  }
  /** Parse a chat line — plain text is zone chat; /commands drive whisper/party/mute. */
  private submitChat() {
    const s = this.chatBuffer.trim();
    if (!s) return;
    if (s.startsWith("/w ")) {
      const r = s.slice(3);
      const i = r.indexOf(" ");
      if (i > 0) this.net.sendChat("whisper", r.slice(0, i), r.slice(i + 1));
    } else if (s.startsWith("/p ")) this.net.sendChat("party", undefined, s.slice(3));
    else if (s.startsWith("/party ")) this.net.sendParty("invite", s.slice(7).trim());
    else if (s === "/join") this.net.sendParty("accept");
    else if (s === "/leave") this.net.sendParty("leave");
    else if (s.startsWith("/mute ")) this.net.sendMute(s.slice(6).trim());
    else if (s.startsWith("/trade ")) this.net.tradeRequest(s.slice(7).trim());
    else if (s === "/taccept") this.net.tradeAccept();
    else if (s.startsWith("/offer ")) {
      const parts = s.slice(7).trim().split(/\s+/);
      this.net.tradeOffer(parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0);
    } else if (s === "/confirm") this.net.tradeConfirm();
    else if (s === "/tcancel") this.net.tradeCancel();
    else this.net.sendChat("zone", undefined, s);
  }

  /** Brief "new era" banner when a meltdown resets the world into the next season. */
  private flashEra(season: number) {
    const t = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 40, `◢ NEW ERA — SEASON ${season} ◣`, {
        fontFamily: "Courier New, monospace",
        fontSize: "26px",
        color: "#39ff88",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1004);
    this.tweens.add({ targets: t, alpha: 0, scale: 1.4, duration: 2400, onComplete: () => t.destroy() });
  }

  private parseZone(z?: string): number {
    const m = z ? /^d(\d+)$/.exec(z) : null;
    const n = m ? parseInt(m[1], 10) : 0;
    return n >= 0 && n < DISTRICTS.length ? n : 0;
  }

  update(_t: number, dt: number) {
    if (!this.net) return;
    const k = this.keys;
    const dn = (key?: Phaser.Input.Keyboard.Key) => (!this.chatOpen && key?.isDown ? 1 : 0);
    const mx = Math.sign(dn(k.D) + dn(k.RIGHT) - dn(k.A) - dn(k.LEFT));
    const my = Math.sign(dn(k.S) + dn(k.DOWN) - dn(k.W) - dn(k.UP));
    this.net.setIntent(mx, my);
    this.net.update(dt);
    this.processEmotes();

    if (this.net.connected) {
      this.me.setPosition(this.net.pred.x, this.net.pred.y);
      const moving = mx !== 0 || my !== 0;
      if (moving) this.meDir.set(mx, my);
      driveChar(this.me, this.meDir.x, this.meDir.y, moving);
    }

    // remote players (interpolated by NetClient) — each rendered with ITS OWN
    // customization (baked from the look the server relays; colour as a tint).
    for (const [id, r] of this.net.remotes) {
      let s = this.remoteSprites.get(id);
      if (!s) {
        s = this.add.sprite(r.x, r.y, PLAYER_KEY, 0).setDepth(9);
        this.remoteSprites.set(id, s);
        this.remoteLabels.set(
          id,
          this.add
            .text(r.x, r.y - 22, id, { fontFamily: "Courier New, monospace", fontSize: "9px", color: "#ff79c6" })
            .setOrigin(0.5)
            .setDepth(9),
        );
      }
      // swap to the remote's baked look-texture when it first arrives / changes (cached by shape)
      const key = r.look ? lookKey(r.look) : PLAYER_KEY;
      if (s.getData("lk") !== key) {
        if (r.look) bakeRemoteLook(this, key, r.look);
        s.setTexture(key, 0);
        s.setData("lk", key);
        const col = r.look ? r.look.color : 0xff79c6;
        this.remoteLabels.get(id)?.setColor("#" + (col & 0xffffff).toString(16).padStart(6, "0"));
      }
      s.setTint(r.look ? 0xffffff : 0xff79c6); // look is baked in colour; only the fallback tints
      const rdx = r.tx - r.x;
      const rdy = r.ty - r.y;
      driveChar(s, rdx, rdy, rdx * rdx + rdy * rdy > 0.4); // walk from their heading
      s.setPosition(r.x, r.y).setVisible(!r.dead).setAlpha(r.dead ? 0.25 : 1);
      this.remoteLabels.get(id)?.setPosition(r.x, r.y - 22).setVisible(!r.dead);
    }
    for (const [id, s] of this.remoteSprites) {
      if (!this.net.remotes.has(id)) {
        s.destroy();
        this.remoteSprites.delete(id);
        this.remoteLabels.get(id)?.destroy();
        this.remoteLabels.delete(id);
      }
    }

    // FIRE — send aim intent while the mouse is held; the SERVER validates rate
    // and resolves the hit. We only render.
    const ptr = this.input.activePointer;
    if (this.net.connected && !this.net.dead && !this.chatOpen && !this.emoteWheelOpen && ptr.isDown) {
      const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
      const aim = Math.atan2(wp.y - this.net.pred.y, wp.x - this.net.pred.x);
      this.net.fire(aim);
      // Aim steers the facing only when standing still, so it doesn't stop the walk.
      if (mx === 0 && my === 0) {
        this.meDir.set(Math.cos(aim), Math.sin(aim));
        driveChar(this.me, this.meDir.x, this.meDir.y, false);
      }
    }
    this.me.setVisible(this.net.connected && !this.net.dead);

    // PvP arena state — warn on enter/exit; the SERVER enforces the actual damage.
    const inPvp = this.net.connected && inPvpZone(this.net.pred.x, this.net.pred.y);
    if (inPvp !== this.wasInPvp) {
      this.wasInPvp = inPvp;
      this.pvpWarn
        .setText(inPvp ? "⚔ ENTERING PVP ARENA — players can kill you here" : "✓ leaving the arena — safe")
        .setColor(inPvp ? "#ff3b6b" : "#39ff88")
        .setAlpha(1);
      this.tweens.killTweensOf(this.pvpWarn);
      this.tweens.add({ targets: this.pvpWarn, alpha: 0, delay: 1600, duration: 800 });
    }
    this.pvpTag.setVisible(inPvp).setText("⚔ PVP — free-for-all");

    // enemies (server-simulated) — tinted by HSS archetype (matches singleplayer reads)
    for (const [id, e] of this.net.enemies) {
      let s = this.enemySprites.get(id);
      if (!s) {
        s = this.add.sprite(e.x, e.y, COP_KEY, 0).setDepth(8);
        this.enemySprites.set(id, s);
        this.maybeEnemyBark(e.x, e.y, e.kind); // deploy bark on first appearance
      }
      if (s.getData("kind") !== e.kind) {
        s.setTint(ENEMY_KIND_TINT[e.kind] ?? COLORS.enemy);
        s.setData("kind", e.kind);
      }
      const edx = e.tx - e.x;
      const edy = e.ty - e.y;
      driveChar(s, edx, edy, edx * edx + edy * edy > 0.4); // walk from their heading
      s.setPosition(e.x, e.y);
    }
    for (const [id, s] of this.enemySprites)
      if (!this.net.enemies.has(id)) {
        s.destroy();
        this.enemySprites.delete(id);
      }

    // projectiles (server-simulated)
    for (const [id, sh] of this.net.shots) {
      let s = this.shotSprites.get(id);
      if (!s) {
        s = this.add
          .image(sh.x, sh.y, BULLET_KEY)
          .setDepth(9)
          .setTint(sh.team === 0 ? COLORS.bullet : COLORS.enemy);
        this.shotSprites.set(id, s);
      }
      s.setPosition(sh.x, sh.y);
    }
    for (const [id, s] of this.shotSprites)
      if (!this.net.shots.has(id)) {
        s.destroy();
        this.shotSprites.delete(id);
      }

    // pickups (server-spawned loot — glow, pulsing)
    for (const [id, pu] of this.net.pickups) {
      let s = this.pickupSprites.get(id);
      if (!s) {
        const col = pu.kind === PICKUP_CORE ? COLORS.neonCyan : COLORS.neonYellow;
        s = this.add
          .image(pu.x, pu.y, GLOW_KEY)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(col)
          .setDepth(7);
        this.pickupSprites.set(id, s);
      }
      s.setScale(0.5 + 0.08 * Math.sin(this.time.now * 0.006 + id));
    }
    for (const [id, s] of this.pickupSprites)
      if (!this.net.pickups.has(id)) {
        s.destroy();
        this.pickupSprites.delete(id);
      }

    // territory nodes (server-owned) — tinted by controlling faction, capture ring
    this.nodeG.clear();
    for (const [id, n] of this.net.nodes) {
      let s = this.nodeSprites.get(id);
      if (!s) {
        s = this.add.sprite(n.x, n.y, NODE_KEY).setDepth(6);
        this.nodeSprites.set(id, s);
      }
      const ownerCol = n.owner === NEUTRAL ? 0x8a8f9c : FACTION_COLORS[n.owner];
      s.setTint(ownerCol).setPosition(n.x, n.y);
      if (n.progress > 0.01) {
        const col = n.by === NEUTRAL ? ownerCol : FACTION_COLORS[n.by];
        this.nodeG.lineStyle(3, col, 0.95);
        this.nodeG.beginPath();
        this.nodeG.arc(n.x, n.y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Phaser.Math.Clamp(n.progress, 0, 1));
        this.nodeG.strokePath();
      }
    }
    for (const [id, s] of this.nodeSprites)
      if (!this.net.nodes.has(id)) {
        s.destroy();
        this.nodeSprites.delete(id);
      }

    // HP bar + death overlay
    this.hpBar.clear();
    if (this.net.connected) {
      const bw = 180;
      const bx = 12;
      const by = this.scale.height - 60;
      this.hpBar.fillStyle(0x140a1e, 0.9).fillRect(bx, by, bw, 12);
      const hpN = Phaser.Math.Clamp(this.net.hp / PLAYER_HP, 0, 1);
      this.hpBar.fillStyle(hpN > 0.3 ? COLORS.hp : COLORS.hpLow, 1).fillRect(bx + 1, by + 1, (bw - 2) * hpN, 10);
    }
    this.deadText.setVisible(this.net.dead).setText("✖ ELIMINATED — respawning…");

    // seasonal meltdown — a server-wide event everyone experiences together
    if (this.net.meltdown) {
      this.meltdownFx.setFillStyle(0xff2b3b, 0.16 + 0.12 * Math.abs(Math.sin(this.time.now * 0.012)));
      this.meltdownText.setVisible(true).setText(`▲ SINGULARITY MELTDOWN · SEASON ${this.net.season} ▲`);
    } else {
      this.meltdownFx.setFillStyle(0xff2b3b, 0);
      this.meltdownText.setVisible(false);
    }
    if (this.net.connected) {
      if (this.lastSeason < 0) this.lastSeason = this.net.season;
      else if (this.net.season > this.lastSeason) {
        this.flashEra(this.net.season);
        this.lastSeason = this.net.season;
      }
    }

    const st = this.net.stats();
    const ctrl = this.net.control === NEUTRAL ? "—" : FACTION_NAMES[this.net.control];
    const war = FACTION_NAMES.map((nm, i) => `${nm[0]}:${this.net.factions[i]}`).join("  ");
    this.hud.setText([
      st.connected
        ? `◢ ONLINE  ${this.callsign}  ·  ${this.zone.toUpperCase()} ${DISTRICTS[this.districtIndex].name}`
        : "connecting to server…",
      `CELL ${FACTION_NAMES[this.net.faction]}   ·   DISTRICT CONTROL: ${ctrl}`,
      `players: ${st.players}   enemies: ${this.net.enemies.size}   nodes: ${this.net.nodes.size}`,
      `LV ${this.net.level}  XP ${xpIntoLevel(this.net.xp)}/100   ₵ ${this.net.credits}  ◈ ${this.net.cores}   HP ${Math.round(this.net.hp)}`,
      `SINGULARITY ${this.net.singularity.toFixed(1)} / ${SING_MAX}${this.net.meltdown ? "  ▲ MELTDOWN" : ""}  (shared · ERA ${this.net.season})`,
      `FACTION WAR  ${war}  (server-wide contribution)`,
    ]);

    // chat log (recent) + presence roster
    this.chatLogText.setText(
      this.net.chatLog.slice(-7).map((c) => {
        if (c.sys) return "» " + c.text;
        const tag = c.ch === "whisper" ? "[w] " : c.ch === "party" ? "[p] " : "";
        return `${tag}${c.from}: ${c.text}`;
      }),
    );
    this.rosterText.setText([
      `◢ ONLINE (${this.net.roster.length})`,
      ...this.net.roster
        .slice(0, 12)
        .map((r) => `${this.net.party.includes(r.id) ? "◆" : "·"} ${r.id} L${r.level}`),
    ]);

    // secure trade panel
    const tr = this.net.trade;
    if (tr) {
      this.tradeText.setVisible(true).setText([
        `◢ SECURE TRADE — ${tr.with}`,
        `you offer:  ₵${tr.youOffer.credits}  ◈${tr.youOffer.cores}   ${tr.youConfirm ? "✓ CONFIRMED" : ""}`,
        `they offer: ₵${tr.theyOffer.credits}  ◈${tr.theyOffer.cores}   ${tr.theyConfirm ? "✓ CONFIRMED" : ""}`,
        `/offer <credits> <cores>  ·  /confirm  ·  /tcancel`,
      ]);
    } else {
      this.tradeText.setVisible(false);
    }

    // questline (The Blank) — tracker + phased story beat
    const qs = QUESTLINE[this.net.questStep];
    this.questText.setText(
      qs
        ? `◈ ${qs.act} — ${qs.title}   [${this.net.questProgress}/${qs.count}]`
        : "◈ THE BLANK — the cycle is yours",
    );
    const story = this.net.story;
    if (story && performance.now() - story.at < 8000) {
      this.storyPanel.setVisible(true).setText(`◢ ${story.act} — ${story.title} ◣\n\n${story.text}`);
    } else {
      this.storyPanel.setVisible(false);
    }
  }

  /** Floating HSS deploy bark above a newly-seen online enemy (throttled), tinted to
   *  its archetype — matches the singleplayer feel. */
  private maybeEnemyBark(x: number, y: number, kind: number) {
    const now = this.time.now;
    if (now < this.nextEnemyBarkAt || Math.random() > 0.4) return;
    const ids = ["patrol", "wasp", "lancer", "hound"];
    const pool = ENEMY_BARKS[ids[kind] ?? "patrol"];
    if (!pool?.length) return;
    this.nextEnemyBarkAt = now + 2200;
    const tint = ENEMY_KIND_TINT[kind] ?? COLORS.enemy;
    const hex = "#" + (tint & 0xffffff).toString(16).padStart(6, "0");
    const t = this.add
      .text(x, y - 20, pool[Math.floor(Math.random() * pool.length)], {
        fontFamily: "Courier New, monospace",
        fontSize: "10px",
        color: hex,
      })
      .setOrigin(0.5)
      .setDepth(11);
    this.tweens.add({ targets: t, y: y - 42, alpha: 0, duration: 1200, onComplete: () => t.destroy() });
  }

  // ── emote / ping wheel ──────────────────────────────────────────────
  private openWheel() {
    if (this.emoteWheelOpen) return;
    this.emoteWheelOpen = true;
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const bg = this.add
      .circle(cx, cy, 94, 0x0b0716, 0.62)
      .setStrokeStyle(2, 0x29e7ff, 0.5)
      .setScrollFactor(0)
      .setDepth(1500);
    this.wheelObjs.push(bg);
    this.wheelObjs.push(
      this.add
        .text(cx, cy, "EMOTE\nV / ESC", { fontFamily: "Courier New, monospace", fontSize: "9px", color: "#6b7184", align: "center" })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(1501),
    );
    EMOTES.forEach((em, i) => {
      const a = (i / EMOTES.length) * Math.PI * 2 - Math.PI / 2;
      const t = this.add
        .text(cx + Math.cos(a) * 72, cy + Math.sin(a) * 72, em.text, {
          fontFamily: "Courier New, monospace",
          fontSize: "12px",
          color: em.ping ? "#f7ff3c" : "#9af0ff",
          fontStyle: "bold",
          align: "center",
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(1501)
        .setInteractive({ useHandCursor: true });
      t.on("pointerover", () => t.setScale(1.25));
      t.on("pointerout", () => t.setScale(1));
      t.on("pointerdown", () => this.pickEmote(i));
      this.wheelObjs.push(t);
    });
  }

  private closeWheel() {
    this.emoteWheelOpen = false;
    this.wheelObjs.forEach((o) => o.destroy());
    this.wheelObjs = [];
  }

  private pickEmote(i: number) {
    const em = EMOTES[i];
    if (this.net.connected) this.net.sendEmote(i, em.ping, this.net.pred.x, this.net.pred.y);
    this.closeWheel();
  }

  /** Render newly-relayed emotes/pings — floats over the sender, or a world ping marker. */
  private processEmotes() {
    let newest = this.lastEmoteShownAt;
    for (const e of this.net.emotes) {
      if (e.at <= this.lastEmoteShownAt) continue;
      this.spawnEmoteVisual(e.kind, e.ping, e.x, e.y);
      if (e.at > newest) newest = e.at;
    }
    this.lastEmoteShownAt = newest;
  }

  private spawnEmoteVisual(kind: number, ping: boolean, x: number, y: number) {
    const def = EMOTES[kind] ?? EMOTES[0];
    if (ping) {
      const ring = this.add.circle(x, y, 16, 0xf7ff3c, 0.12).setStrokeStyle(2, 0xf7ff3c, 0.9).setDepth(7);
      this.tweens.add({ targets: ring, scale: { from: 0.4, to: 1.5 }, alpha: { from: 0.9, to: 0 }, duration: 850, repeat: 3 });
      const txt = this.add
        .text(x, y - 26, def.text, { fontFamily: "Courier New, monospace", fontSize: "12px", color: "#f7ff3c", fontStyle: "bold" })
        .setOrigin(0.5)
        .setDepth(1002);
      txt.setShadow(0, 0, "#0a0e1a", 4, true, true);
      this.tweens.add({ targets: txt, alpha: 0, delay: 3200, duration: 800, onComplete: () => { txt.destroy(); ring.destroy(); } });
    } else {
      const txt = this.add
        .text(x, y - 22, def.text, { fontFamily: "Courier New, monospace", fontSize: "13px", color: "#9af0ff", fontStyle: "bold" })
        .setOrigin(0.5)
        .setDepth(1002);
      txt.setShadow(0, 0, "#0a0e1a", 4, true, true);
      this.tweens.add({ targets: txt, y: y - 50, alpha: { from: 1, to: 0 }, duration: 1700, onComplete: () => txt.destroy() });
    }
  }

  /** Paint the PvP arenas onto the world: a faint red fill, a border, hazard-stripe
   *  corners and a banner — so the free-for-all zones are obvious before you walk in. */
  private drawPvpZones() {
    const g = this.add.graphics().setDepth(4);
    for (const z of PVP_ZONES) {
      g.fillStyle(0xff2b3b, 0.05).fillRect(z.x, z.y, z.w, z.h);
      g.lineStyle(2, 0xff3b6b, 0.55).strokeRect(z.x, z.y, z.w, z.h);
      g.lineStyle(3, 0xff3b6b, 0.85);
      const c = 28;
      const corner = (cx: number, cy: number, dx: number, dy: number) => {
        g.beginPath();
        g.moveTo(cx, cy + dy * c);
        g.lineTo(cx, cy);
        g.lineTo(cx + dx * c, cy);
        g.strokePath();
      };
      corner(z.x, z.y, 1, 1);
      corner(z.x + z.w, z.y, -1, 1);
      corner(z.x, z.y + z.h, 1, -1);
      corner(z.x + z.w, z.y + z.h, -1, -1);
      this.add
        .text(z.x + z.w / 2, z.y + 12, `⚔ ${z.name} · PVP ARENA`, {
          fontFamily: "Courier New, monospace",
          fontSize: "13px",
          color: "#ff5a6b",
          fontStyle: "bold",
        })
        .setOrigin(0.5, 0)
        .setDepth(4)
        .setShadow(0, 0, "#000000", 4, true, true);
    }
  }

  private applyNeon() {
    if (this.renderer.type !== Phaser.WEBGL) return;
    const cam = this.cameras.main;
    cam.setPostPipeline("Neon");
    const p = cam.getPostPipeline("Neon");
    const neon = (Array.isArray(p) ? p[0] : p) as NeonPipeline | undefined;
    if (neon) {
      neon.heat = 0.12;
      neon.tint = [0, 0.9, 1];
      neon.tintAmt = 0.18;
    }
  }
}
