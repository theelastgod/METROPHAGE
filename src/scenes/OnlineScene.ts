import Phaser from "phaser";
import { COLORS, TILE } from "../config";
import { TILESET_KEY, PLAYER_KEY, faceFrame } from "../assets/manifest";
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
  private hud!: Phaser.GameObjects.Text;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private color: number = COLORS.player;
  private callsign = "runner";

  constructor() {
    super("Online");
  }

  create() {
    const cust = this.registry.get("customization") as Customization | undefined;
    this.callsign = (cust?.callsign || "runner").toLowerCase();
    this.color = cust?.color ?? COLORS.player;

    this.cameras.main.setBackgroundColor(COLORS.bgVoid);

    // Real world — same grid + tileset the server simulates against.
    const grid = buildGrid(DISTRICTS[0]);
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

    this.net = new NetClient(grid, this.callsign, SERVER_URL);
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
        "ONLINE (beta) · WASD move · server-authoritative · ESC to exit",
        { fontFamily: "Courier New, monospace", fontSize: "11px", color: "#6b7184" },
      )
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(1000);

    this.input.keyboard!.on("keydown-ESC", () => {
      this.net.disconnect();
      this.scene.start("Select");
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.net?.disconnect());
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

    // remote players (interpolated by NetClient)
    for (const [id, r] of this.net.remotes) {
      let s = this.remoteSprites.get(id);
      if (!s) {
        s = this.add.sprite(r.x, r.y, PLAYER_KEY, 0).setTint(0xff2bd6).setDepth(9);
        this.remoteSprites.set(id, s);
      }
      s.setPosition(r.x, r.y);
    }
    for (const [id, s] of this.remoteSprites) {
      if (!this.net.remotes.has(id)) {
        s.destroy();
        this.remoteSprites.delete(id);
      }
    }

    const st = this.net.stats();
    this.hud.setText([
      st.connected ? `◢ ONLINE  ${this.callsign}  (id=${st.id})` : "connecting to server…",
      `players online : ${st.players}`,
      `predicted      : ${st.predX.toFixed(1)}, ${st.predY.toFixed(1)}`,
      `server (truth) : ${st.serverX.toFixed(1)}, ${st.serverY.toFixed(1)}`,
      `reconcile error: ${st.error.toFixed(2)} px   (corrections: ${st.reconciles})`,
      `input ack      : ${st.ack}   pending: ${st.pending}`,
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
