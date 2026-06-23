import Phaser from "phaser";
import { COLORS, TILE } from "../config";
import { TILESET_KEY, PLAYER_KEY, COP_KEY, BULLET_KEY, GLOW_KEY, NODE_KEY, faceFrame } from "../assets/manifest";
import {
  PLAYER_HP,
  SING_MAX,
  PICKUP_CORE,
  xpIntoLevel,
  FACTION_COLORS,
  FACTION_NAMES,
  NEUTRAL,
  factionForColor,
} from "../net/sim";
import { buildGrid } from "../world/district";
import { DISTRICTS } from "../game/districts";
import { WORLD_W, WORLD_H } from "../net/sim";
import NetClient from "../net/NetClient";
import NeonPipeline from "../render/NeonPipeline";
import type { Customization } from "../game/customization";

const SERVER_URL =
  (import.meta.env as Record<string, string | undefined>).VITE_SERVER_URL ??
  "ws://127.0.0.1:8787/ws";

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
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private color: number = COLORS.player;
  private callsign = "runner";
  private zone = "d0";
  private districtIndex = 0;

  constructor() {
    super("Online");
  }

  create(data?: { zone?: string }) {
    const cust = this.registry.get("customization") as Customization | undefined;
    this.callsign = (cust?.callsign || "runner").toLowerCase();
    this.color = cust?.color ?? COLORS.player;

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

    // Local player — positioned from prediction (no Phaser physics here).
    this.me = this.add
      .sprite(WORLD_W / 2, WORLD_H / 2, PLAYER_KEY, 0)
      .setTint(this.color)
      .setDepth(10)
      .setVisible(false);

    const url = SERVER_URL + (SERVER_URL.includes("?") ? "&" : "?") + "zone=" + this.zone;
    this.faction = factionForColor(this.color); // your cell, from your signature colour
    this.nodeG = this.add.graphics().setDepth(5); // node capture rings (world-space)
    this.net = new NetClient(grid, this.callsign, url, this.faction);
    this.net.onWelcome = (x, y) => {
      this.me.setPosition(x, y).setVisible(true);
      this.cameras.main.startFollow(this.me, true, 0.18, 0.18);
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
        `ONLINE (beta) · WASD move · CLICK fire · [1-${DISTRICTS.length}] travel district · ESC exit`,
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

    this.input.keyboard!.on("keydown-ESC", () => {
      this.net.disconnect();
      this.scene.start("Select");
    });
    // Travel between districts — zone handoff (reconnect to another DO).
    this.input.keyboard!.on("keydown", (e: KeyboardEvent) => {
      const k = parseInt(e.key, 10);
      if (k >= 1 && k <= DISTRICTS.length) {
        const z = "d" + (k - 1);
        if (z !== this.zone) {
          this.net.disconnect();
          this.scene.restart({ zone: z });
        }
      }
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.net?.disconnect());
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
    const dn = (key?: Phaser.Input.Keyboard.Key) => (key?.isDown ? 1 : 0);
    const mx = Math.sign(dn(k.D) + dn(k.RIGHT) - dn(k.A) - dn(k.LEFT));
    const my = Math.sign(dn(k.S) + dn(k.DOWN) - dn(k.W) - dn(k.UP));
    this.net.setIntent(mx, my);
    this.net.update(dt);

    if (this.net.connected) {
      this.me.setPosition(this.net.pred.x, this.net.pred.y);
      if (mx !== 0 || my !== 0) this.me.setFrame(faceFrame(mx, my));
    }

    // remote players (interpolated by NetClient) — labelled, faded when dead
    for (const [id, r] of this.net.remotes) {
      let s = this.remoteSprites.get(id);
      if (!s) {
        s = this.add.sprite(r.x, r.y, PLAYER_KEY, 0).setTint(0xff79c6).setDepth(9);
        this.remoteSprites.set(id, s);
        this.remoteLabels.set(
          id,
          this.add
            .text(r.x, r.y - 22, id, {
              fontFamily: "Courier New, monospace",
              fontSize: "9px",
              color: "#ff79c6",
            })
            .setOrigin(0.5)
            .setDepth(9),
        );
      }
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
    if (this.net.connected && !this.net.dead && ptr.isDown) {
      const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
      const aim = Math.atan2(wp.y - this.net.pred.y, wp.x - this.net.pred.x);
      this.net.fire(aim);
      this.me.setFrame(faceFrame(Math.cos(aim), Math.sin(aim)));
    }
    this.me.setVisible(this.net.connected && !this.net.dead);

    // enemies (server-simulated)
    for (const [id, e] of this.net.enemies) {
      let s = this.enemySprites.get(id);
      if (!s) {
        s = this.add.sprite(e.x, e.y, COP_KEY, 0).setTint(COLORS.enemy).setDepth(8);
        this.enemySprites.set(id, s);
      }
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
      `LV ${this.net.level}  XP ${xpIntoLevel(this.net.xp)}/100   ₵ ${this.net.credits}   HP ${Math.round(this.net.hp)}`,
      `SINGULARITY ${this.net.singularity.toFixed(1)} / ${SING_MAX}${this.net.meltdown ? "  ▲ MELTDOWN" : ""}  (shared · ERA ${this.net.season})`,
      `FACTION WAR  ${war}  (server-wide contribution)`,
    ]);
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
