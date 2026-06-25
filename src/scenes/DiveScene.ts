import Phaser from "phaser";
import { installUiCamera } from "../render/cameras";
import { TILE, COLORS, BULLET, ENEMY_BULLET } from "../config";
import { getClass, ClassDef, PrimaryDef } from "../game/classes";
import { ENEMY_TIERS, EnemyHost } from "../game/enemies";
import { DiveDef, DiveResult } from "../game/dives";
import { PLAYER_CUSTOM_KEY } from "../game/customization";
import { TILESET_KEY, GLOW_KEY } from "../assets/manifest";
import Player, { PlayerInput } from "../entities/Player";
import Bullets from "../entities/Bullets";
import TuringCop from "../entities/TuringCop";
import NeonPipeline from "../render/NeonPipeline";
import { juiceShake, juiceFlash } from "../systems/juice";
import Synth from "../audio/Synth";
import MusicDirector from "../audio/MusicDirector";
import Particles from "../render/Particles";

const TILE_FLOOR = 0;
const TILE_WALL = 4;
const AW = 28; // arena width in tiles
const AH = 18; // arena height in tiles

interface DiveData {
  classId: string;
  level: number;
  dive: DiveDef;
  cycleMult: number;
  color?: number; // player's signature tint (from customization)
}

/**
 * DiveScene — an instanced ICE dive (private to the player). A contained arena:
 * clear escalating enemy waves, then break the ICE core for a payout (and the
 * memory fragment, if the dive carries one). Reuses the Player/Bullets/TuringCop
 * entities with a slim self-contained combat loop — no territory/Heat/abilities.
 * Launched (paused over) GameScene; hands a DiveResult back via the registry.
 */
export default class DiveScene extends Phaser.Scene implements EnemyHost {
  private classDef!: ClassDef;
  private playerColor!: number; // signature tint carried from the district run
  private dive!: DiveDef;
  private cycleMult = 1;

  private player!: Player;
  private bullets!: Bullets;
  private enemyBullets!: Bullets;
  private enemies!: Phaser.Physics.Arcade.Group;
  private wallLayer!: Phaser.Tilemaps.TilemapLayer;
  private core!: Phaser.Physics.Arcade.Image;
  private coreRing!: Phaser.GameObjects.Graphics;
  private coreHp = 260;
  private coreMaxHp = 260;
  private coreUnlocked = false;

  private waveIndex = 0;
  private waveActive = false;
  private nextWaveAt = 0;
  private nextHazardAt = 0;
  private ending = false;

  private synth?: Synth; // shared GameScene synth (from the registry)
  private particles!: Particles; // pooled spark FX
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private dashKey!: Phaser.Input.Keyboard.Key;

  private hud!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private objText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;

  constructor() {
    super("Dive");
  }

  create(data: DiveData) {
    this.classDef = getClass(data.classId);
    this.playerColor = data.color ?? this.classDef.color;
    this.dive = data.dive;
    this.cycleMult = data.cycleMult ?? 1;
    this.synth = this.registry.get("synth") as Synth | undefined;
    MusicDirector.for(this)?.play("dive", this); // cyberspace bed (GameScene re-asserts on return)
    this.particles = new Particles(this);
    this.coreHp = this.coreMaxHp = Math.round(220 + data.level * 12);
    this.coreUnlocked = false;
    this.waveIndex = 0;
    this.waveActive = false;
    this.ending = false;

    this.buildArena();
    this.spawnPlayer();
    this.setupProjectiles();
    this.setupEnemies();
    this.createCore();
    this.setupCamera();
    this.setupPostFX();
    this.setupInput();
    this.setupHud();

    this.nextWaveAt = this.time.now + 900;
    this.nextHazardAt = this.time.now + 4000;
    this.cameras.main.fadeIn(350, 2, 6, 14);
    this.flashTitle();
  }

  private buildArena() {
    const grid: number[][] = [];
    for (let y = 0; y < AH; y++) {
      const row: number[] = [];
      for (let x = 0; x < AW; x++) {
        const border = x === 0 || y === 0 || x === AW - 1 || y === AH - 1;
        row.push(border ? TILE_WALL : TILE_FLOOR);
      }
      grid.push(row);
    }
    // A few cover blocks (kept clear of the spawn lane + core).
    const blocks: Array<[number, number]> = [
      [7, 6],
      [20, 6],
      [7, 11],
      [20, 11],
      [13, 9],
      [14, 9],
    ];
    for (const [x, y] of blocks) grid[y][x] = TILE_WALL;

    const map = this.make.tilemap({ data: grid, tileWidth: TILE, tileHeight: TILE });
    const tileset = map.addTilesetImage(TILESET_KEY, TILESET_KEY, TILE, TILE)!;
    this.wallLayer = map.createLayer(0, tileset, 0, 0)!;
    this.wallLayer.setCollision(TILE_WALL);
    this.physics.world.setBounds(0, 0, AW * TILE, AH * TILE);
    this.cameras.main.setBackgroundColor(COLORS.bgVoid);
  }

  private spawnPlayer() {
    this.player = new Player(this, 14 * TILE, (AH - 3) * TILE, this.classDef, {
      textureKey: PLAYER_CUSTOM_KEY,
      color: this.playerColor,
    });
    this.physics.add.collider(this.player, this.wallLayer);
  }

  private setupProjectiles() {
    const prim = this.classDef.primary;
    const ranged = prim.kind !== "beam" && prim.kind !== "melee";
    this.bullets = new Bullets(this, {
      speed: ranged ? prim.speed : 600,
      lifetimeMs: ranged ? prim.lifetimeMs : 200,
      radius: BULLET.radius,
      maxActive: 96,
      tint: this.playerColor,
      damage: prim.damage,
    });
    this.enemyBullets = new Bullets(this, {
      speed: ENEMY_BULLET.speed,
      lifetimeMs: ENEMY_BULLET.lifetimeMs,
      radius: ENEMY_BULLET.radius,
      maxActive: ENEMY_BULLET.maxActive,
      tint: ENEMY_BULLET.tint,
    });
    this.physics.add.collider(this.bullets.group, this.wallLayer, (b) =>
      this.bullets.kill(b as Phaser.Physics.Arcade.Image),
    );
    this.physics.add.collider(this.enemyBullets.group, this.wallLayer, (b) =>
      this.enemyBullets.kill(b as Phaser.Physics.Arcade.Image),
    );
  }

  private setupEnemies() {
    this.enemies = this.physics.add.group();
    this.physics.add.collider(this.enemies, this.wallLayer);
    this.physics.add.overlap(this.bullets.group, this.enemies, (b, c) =>
      this.onBulletHitsCop(b as Phaser.Physics.Arcade.Image, c as TuringCop),
    );
    this.physics.add.overlap(this.player, this.enemyBullets.group, (_p, b) =>
      this.onEnemyBulletHitsPlayer(b as Phaser.Physics.Arcade.Image),
    );
  }

  private createCore() {
    this.core = this.physics.add
      .image(14 * TILE, 3 * TILE, GLOW_KEY)
      .setTint(0x29e7ff)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(1.6)
      .setDepth(6)
      .setImmovable(true);
    (this.core.body as Phaser.Physics.Arcade.Body).setCircle(20, -4, -4);
    this.coreRing = this.add.graphics().setDepth(7);
    this.tweens.add({
      targets: this.core,
      scale: { from: 1.5, to: 1.85 },
      yoyo: true,
      repeat: -1,
      duration: 800,
      ease: "Sine.inOut",
    });
    this.physics.add.overlap(this.bullets.group, this.core, (b) =>
      this.onBulletHitsCore(b as Phaser.Physics.Arcade.Image),
    );
  }

  private setupCamera() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, AW * TILE, AH * TILE);
    cam.startFollow(this.player, true, 0.12, 0.12);
    installUiCamera(this, 1);
  }

  private setupPostFX() {
    if (this.renderer.type !== Phaser.WEBGL) return;
    const cam = this.cameras.main;
    cam.setPostPipeline("Neon");
    const p = cam.getPostPipeline("Neon") as NeonPipeline;
    const neon = Array.isArray(p) ? p[0] : p;
    if (neon) {
      neon.heat = 0.2; // dives run tense — but keep the readout text legible
      neon.tint = [0.16, 0.9, 1]; // ICE-cyan signature
      neon.tintAmt = 0.25;
    }
  }

  private setupInput() {
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys("W,A,S,D") as typeof this.wasd;
    this.dashKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.input.mouse?.disableContextMenu();
    kb.on("keydown-ESC", () => this.finish(false));
  }

  private setupHud() {
    this.hud = this.add.graphics().setScrollFactor(0).setDepth(1000);
    const mk = (y: number, color: string, size = "12px") =>
      this.add
        .text(20, y, "", { fontFamily: "Courier New, monospace", fontSize: size, color })
        .setScrollFactor(0)
        .setDepth(1001);
    this.hpText = mk(20, "#39ff88");
    this.waveText = this.add
      .text(this.scale.width / 2, 16, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "13px",
        color: "#29e7ff",
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1001);
    this.objText = this.add
      .text(this.scale.width / 2, 36, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "11px",
        color: "#f7ff3c",
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1001);
    this.add
      .text(this.scale.width - 16, this.scale.height - 20, "ESC abort", {
        fontFamily: "Courier New, monospace",
        fontSize: "10px",
        color: "#9aa3b2",
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1001);
  }

  // ---- loop ----

  update() {
    if (this.ending) return;
    const now = this.time.now;

    const input = this.readInput();
    this.player.step(input);
    const angle = this.player.tryFire(input);
    if (angle !== null) this.fireWeapon(angle);

    this.bullets.update(now);
    this.enemyBullets.update(now);

    this.enemies.getChildren().forEach((go) => {
      const cop = go as TuringCop;
      if (cop.active && !cop.isDead) cop.step(this.player, this);
    });

    this.manageWaves(now);
    this.manageHazard(now);
    this.drawCoreRing();
    this.updateHud();
  }

  private manageWaves(now: number) {
    if (this.coreUnlocked) return;
    const alive = this.enemies.countActive(true);
    if (this.waveActive && alive === 0) {
      this.waveActive = false;
      this.nextWaveAt = now + 1400;
    }
    if (!this.waveActive && alive === 0 && now >= this.nextWaveAt) {
      if (this.waveIndex < this.dive.waves.length) {
        this.spawnWave(this.waveIndex);
        this.waveIndex++;
        this.waveActive = true;
      } else {
        this.unlockCore();
      }
    }
  }

  private spawnWave(i: number) {
    const wave = this.dive.waves[i];
    for (let n = 0; n < wave.count; n++) {
      // spawn along the top / sides, away from the player
      const ex = Phaser.Math.Between(2, AW - 3) * TILE;
      const ey = Phaser.Math.Between(2, 5) * TILE;
      const cop = new TuringCop(this, ex, ey, ENEMY_TIERS[wave.tier]);
      if (this.cycleMult > 1) cop.scaleHp(this.cycleMult);
      this.enemies.add(cop);
    }
    juiceShake(this, 160, 0.004);
  }

  private unlockCore() {
    this.coreUnlocked = true;
    this.core.setTint(0xff2bd6);
    juiceFlash(this, 260, 40, 200, 220);
    this.spark(this.core.x, this.core.y, 0x29e7ff, 4);
  }

  private manageHazard(now: number) {
    if (now < this.nextHazardAt) return;
    this.nextHazardAt = now + Phaser.Math.Between(4200, 6200);
    // Neon-storm strike: telegraph then damage if the player is caught inside.
    const x = Phaser.Math.Between(3, AW - 3) * TILE;
    const y = Phaser.Math.Between(3, AH - 3) * TILE;
    const r = 64;
    const ring = this.add
      .circle(x, y, r, 0x8a5cff, 0.12)
      .setStrokeStyle(2, 0x8a5cff, 0.85)
      .setDepth(5);
    this.tweens.add({ targets: ring, alpha: { from: 0.15, to: 0.5 }, yoyo: true, repeat: 3, duration: 180 });
    this.time.delayedCall(900, () => {
      ring.destroy();
      const burst = this.add.circle(x, y, r, 0x8a5cff, 0.5).setDepth(6);
      this.tweens.add({ targets: burst, alpha: 0, scale: 1.3, duration: 300, onComplete: () => burst.destroy() });
      this.spark(x, y, 0x8a5cff, 3);
      if (!this.player.invulnerable && Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y) <= r) {
        if (this.player.applyDamage(18)) this.finish(false);
        juiceShake(this, 120, 0.006);
      }
    });
  }

  // ---- combat ----

  private readInput(): PlayerInput {
    const p = this.input.activePointer;
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    return {
      left: this.cursors.left.isDown || this.wasd.A.isDown,
      right: this.cursors.right.isDown || this.wasd.D.isDown,
      up: this.cursors.up.isDown || this.wasd.W.isDown,
      down: this.cursors.down.isDown || this.wasd.S.isDown,
      dash: Phaser.Input.Keyboard.JustDown(this.dashKey),
      fire: p.isDown,
      aimX: w.x,
      aimY: w.y,
    };
  }

  private muzzleAt(angle: number) {
    return { x: this.player.x + Math.cos(angle) * 14, y: this.player.y + Math.sin(angle) * 14 };
  }

  private fireWeapon(angle: number) {
    this.synth?.shoot();
    const prim = this.classDef.primary;
    switch (prim.kind) {
      case "spread": {
        const half = Phaser.Math.DegToRad(prim.spreadDeg) / 2;
        for (let i = 0; i < prim.pellets; i++) {
          const t = prim.pellets === 1 ? 0.5 : i / (prim.pellets - 1);
          const a = angle - half + t * 2 * half + Phaser.Math.FloatBetween(-0.04, 0.04);
          const m = this.muzzleAt(a);
          this.bullets.fire(m.x, m.y, a);
        }
        break;
      }
      case "burst": {
        const shoot = () => {
          const m = this.muzzleAt(angle);
          this.bullets.fire(m.x, m.y, angle);
        };
        shoot();
        for (let i = 1; i < prim.burstCount; i++) this.time.delayedCall(i * prim.burstGapMs, shoot);
        break;
      }
      case "rapid": {
        const j = Phaser.Math.DegToRad(prim.jitterDeg);
        const a = angle + Phaser.Math.FloatBetween(-j, j);
        const m = this.muzzleAt(a);
        this.bullets.fire(m.x, m.y, a);
        break;
      }
      case "beam":
        this.fireBeam(angle, prim);
        break;
    }
  }

  private fireBeam(angle: number, prim: Extract<PrimaryDef, { kind: "beam" }>) {
    const px = this.player.x;
    const py = this.player.y;
    const ex = px + Math.cos(angle) * prim.range;
    const ey = py + Math.sin(angle) * prim.range;
    this.enemies.getChildren().forEach((go) => {
      const cop = go as TuringCop;
      if (!cop.active || cop.isDead) return;
      if (this.pointSegDist(cop.x, cop.y, px, py, ex, ey) <= prim.halfWidth + 10) {
        this.damageCop(cop, prim.damage * 1.5, 3);
        this.spark(cop.x, cop.y, this.playerColor, 1.2);
      }
    });
    if (this.coreUnlocked && this.pointSegDist(this.core.x, this.core.y, px, py, ex, ey) <= prim.halfWidth + 16) {
      this.damageCore(prim.damage * 1.5);
    }
    const g = this.add.graphics().setDepth(11);
    g.lineStyle(4, this.playerColor, 0.85).lineBetween(px, py, ex, ey);
    g.lineStyle(1.5, 0xffffff, 0.9).lineBetween(px, py, ex, ey);
    this.tweens.add({ targets: g, alpha: 0, duration: 130, onComplete: () => g.destroy() });
  }

  private pointSegDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Phaser.Math.Clamp(t, 0, 1);
    return Phaser.Math.Distance.Between(px, py, ax + t * dx, ay + t * dy);
  }

  private onBulletHitsCop(bullet: Phaser.Physics.Arcade.Image, cop: TuringCop) {
    if (!cop.active || cop.isDead) return;
    const dmg = bullet.getData("dmg") as number;
    this.bullets.kill(bullet);
    this.spark(bullet.x, bullet.y, COLORS.enemyEdge, 1.4);
    this.damageCop(cop, dmg);
  }

  private damageCop(cop: TuringCop, dmg: number, shieldMult = 1) {
    if (!cop.active || cop.isDead) return;
    const killed = cop.hurt(dmg, shieldMult);
    if (killed) {
      this.spark(cop.x, cop.y, COLORS.enemy, 2);
      juiceShake(this, 80, 0.004);
      this.synth?.kill();
    } else {
      cop.knock(cop.x - this.player.x, cop.y - this.player.y, 140);
      this.synth?.hit();
    }
  }

  private onBulletHitsCore(bullet: Phaser.Physics.Arcade.Image) {
    const dmg = bullet.getData("dmg") as number;
    this.bullets.kill(bullet);
    this.spark(bullet.x, bullet.y, 0x29e7ff, 1.4);
    if (this.coreUnlocked) this.damageCore(dmg);
  }

  private damageCore(dmg: number) {
    if (this.ending) return;
    this.coreHp = Math.max(0, this.coreHp - dmg);
    this.core.setScale(1.85);
    if (this.coreHp <= 0) this.finish(true);
  }

  private onEnemyBulletHitsPlayer(bullet: Phaser.Physics.Arcade.Image) {
    const dmg = (bullet.getData("dmg") as number) ?? ENEMY_BULLET.damage;
    this.enemyBullets.kill(bullet);
    if (this.player.invulnerable) return;
    const died = this.player.applyDamage(dmg);
    juiceFlash(this, 110, 90, 0, 10);
    if (died) this.finish(false);
  }

  // ---- EnemyHost ----

  enemyShot(x: number, y: number, angle: number, damage: number) {
    this.enemyBullets.fire(x + Math.cos(angle) * 16, y + Math.sin(angle) * 16, angle, damage);
  }

  enemySlam(x: number, y: number, radius: number, damage: number, windupMs: number) {
    const ring = this.add
      .circle(x, y, radius, 0xff7a3c, 0.12)
      .setStrokeStyle(2, 0xff7a3c, 0.85)
      .setDepth(5);
    this.tweens.add({ targets: ring, alpha: { from: 0.15, to: 0.5 }, yoyo: true, repeat: -1, duration: 150 });
    this.time.delayedCall(windupMs, () => {
      ring.destroy();
      this.spark(x, y, 0xff7a3c, 3);
      juiceShake(this, 160, 0.009);
      if (!this.player.invulnerable && Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y) <= radius) {
        if (this.player.applyDamage(damage)) this.finish(false);
      }
    });
  }

  /** MENDER support pulse: top up dive enemies within range. */
  enemyHeal(x: number, y: number, radius: number, amount: number) {
    this.enemies.getChildren().forEach((go) => {
      const cop = go as TuringCop;
      if (!cop.active || cop.isDead) return;
      if (Phaser.Math.Distance.Between(cop.x, cop.y, x, y) <= radius && cop.heal(amount)) {
        this.spark(cop.x, cop.y, 0x6affa0, 1.2);
      }
    });
    const ring = this.add.circle(x, y, radius, 0x6affa0, 0.1).setStrokeStyle(2, 0x6affa0, 0.6).setDepth(5);
    this.tweens.add({ targets: ring, alpha: 0, scale: 1.2, duration: 360, onComplete: () => ring.destroy() });
  }

  // ---- fx + hud ----

  private spark(x: number, y: number, color: number, scale: number) {
    this.particles.spark(x, y, color, scale);
  }

  private drawCoreRing() {
    const g = this.coreRing;
    g.clear();
    const r = 30;
    if (!this.coreUnlocked) {
      g.lineStyle(3, 0x29e7ff, 0.9).strokeCircle(this.core.x, this.core.y, r);
      g.lineStyle(2, 0x29e7ff, 0.3).strokeCircle(this.core.x, this.core.y, r + 5);
    } else {
      const p = this.coreHp / this.coreMaxHp;
      g.lineStyle(3, 0x2a1740, 0.9).strokeCircle(this.core.x, this.core.y, r);
      g.lineStyle(4, 0xff2bd6, 1);
      g.beginPath();
      g.arc(this.core.x, this.core.y, r, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
      g.strokePath();
    }
  }

  private updateHud() {
    this.hpText.setText(`HP ${Math.ceil(this.player.hp)}/${this.player.maxHp}`);
    this.waveText.setText(`◇ ICE DIVE — ${this.dive.name}`);
    this.objText.setText(
      this.coreUnlocked
        ? `BREAK THE ICE CORE  ${Math.ceil((this.coreHp / this.coreMaxHp) * 100)}%`
        : `CLEAR THE WAVES  ${Math.min(this.waveIndex, this.dive.waves.length)}/${this.dive.waves.length}`,
    );
    const g = this.hud;
    g.clear();
    g.fillStyle(0x07061a, 0.7).fillRect(14, 14, 150, 18);
    g.lineStyle(1, COLORS.neonCyan, 0.8).strokeRect(14, 14, 150, 18);
  }

  private flashTitle() {
    const frag = this.dive.fragmentId ? "  ·  SIGNAL DETECTED" : "";
    const t = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 30, `ICE DIVE${frag}`, {
        fontFamily: "Courier New, monospace",
        fontSize: "30px",
        color: "#29e7ff",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2000)
      .setAlpha(0);
    t.setShadow(0, 0, "#ff2bd6", 6, true, true);
    this.tweens.add({ targets: t, alpha: 1, scale: { from: 1.4, to: 1 }, duration: 500, yoyo: true, hold: 700, onComplete: () => t.destroy() });
  }

  /** End the dive: stash the result + hand control back to the paused GameScene. */
  private finish(success: boolean) {
    if (this.ending) return;
    this.ending = true;
    const result: DiveResult = {
      success,
      reward: this.dive.reward,
      fragmentId: success ? this.dive.fragmentId : undefined,
    };
    this.registry.set("diveResult", result);
    if (success) this.synth?.iceShatter();

    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const msg = this.add
      .text(cx, cy, success ? "ICE BROKEN" : "CONNECTION LOST", {
        fontFamily: "Courier New, monospace",
        fontSize: "40px",
        color: success ? "#39ff88" : "#ff3b6b",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2000);
    msg.setShadow(0, 0, "#00e5ff", 6, true, true);
    if (success) juiceFlash(this, 300, 40, 200, 160);
    juiceShake(this, 300, 0.008);

    this.time.delayedCall(1100, () => {
      this.cameras.main.fadeOut(300, 2, 6, 14);
      this.cameras.main.once("camerafadeoutcomplete", () => {
        this.scene.stop();
        this.scene.resume("Game");
      });
    });
  }
}
