import Phaser from "phaser";
import { installUiCamera } from "../render/cameras";
import { TILE, COLORS, BULLET, ENEMY_BULLET } from "../config";
import { getClass, ClassDef, PrimaryDef } from "../game/classes";
import { ENEMY_TIERS, EnemyHost } from "../game/enemies";
import { getBoss } from "../game/bosses";
import { makeWeaponItem } from "../game/items";
import { PLAYER_CUSTOM_KEY, sanitizeCustomization } from "../game/customization";

import Player, { PlayerInput } from "../entities/Player";
import Bullets from "../entities/Bullets";
import TuringCop from "../entities/TuringCop";
import Boss from "../entities/Boss";
import BossBar from "../ui/BossBar";
import Inventory from "../systems/Inventory";
import { loadSave, writeSave } from "../systems/Save";
import NeonPipeline from "../render/NeonPipeline";
import { createTerrainLayer } from "../render/terrainLayer";
import { TILE_VARIANTS } from "../world/district";
import { juiceShake, juiceFlash, juiceKill } from "../systems/juice";
import Synth from "../audio/Synth";
import MusicDirector from "../audio/MusicDirector";
import Particles from "../render/Particles";

const TILE_FLOOR = 11; // grate — reads as a subway platform
const TILE_WALL = 4;
const TILE_TRACK = 6; // water tile, styled as the dark track pit (blocks)
const AW = 34; // tunnel width in tiles
const AH = 18;

interface SubwayData {
  returnTile?: [number, number]; // where to drop the player back in the city
}

/** Escalating enemy waves down in THE UNDERLINE — the new beasts/vermin, then the boss. */
const WAVES: Array<Array<[string, number]>> = [
  [["ratswarm", 4], ["ripperdog", 2]],
  [["thug", 3], ["ripperdog", 3]],
  [["mutant", 2], ["ratswarm", 4]],
];

/**
 * @legacy UNREGISTERED — subway is OnlineScene zone "subway". Do not re-register.
 * Archive only for layout/wave reference.
 */
export default class SubwayScene extends Phaser.Scene implements EnemyHost {
  private classDef!: ClassDef;
  private playerColor!: number;
  private level = 1;
  private returnTile?: [number, number];

  private player!: Player;
  private bullets!: Bullets;
  private enemyBullets!: Bullets;
  private enemies!: Phaser.Physics.Arcade.Group;
  private wallLayer!: Phaser.Tilemaps.TilemapLayer;

  private boss?: Boss;
  private bossBar!: BossBar;
  private bossSpawned = false;

  private waveIndex = 0;
  private waveActive = false;
  private nextWaveAt = 0;
  private ending = false;

  private synth?: Synth;
  private particles!: Particles;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private dashKey!: Phaser.Input.Keyboard.Key;

  private hud!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private objText!: Phaser.GameObjects.Text;

  constructor() {
    super("Subway");
  }

  create(data: SubwayData) {
    const save = loadSave();
    const classId = (this.registry.get("classId") as string | undefined) ?? save?.progress.classId;
    this.classDef = getClass(classId);
    const cust = sanitizeCustomization(this.registry.get("customization") as never, this.classDef.id);
    this.playerColor = cust.color;
    this.level = save?.progress.level ?? 1;
    this.returnTile = data?.returnTile;
    this.synth = this.registry.get("synth") as Synth | undefined;
    MusicDirector.for(this)?.play("subway", this); // transit bed
    this.particles = new Particles(this);
    this.waveIndex = 0;
    this.waveActive = false;
    this.bossSpawned = false;
    this.ending = false;

    this.buildArena();
    this.spawnPlayer(save?.progress.hp ?? -1);
    this.setupProjectiles();
    this.setupEnemies();
    this.bossBar = new BossBar(this);
    this.setupCamera();
    this.setupPostFX();
    this.setupInput();
    this.setupHud();

    this.nextWaveAt = this.time.now + 1100;
    this.cameras.main.fadeIn(400, 2, 2, 8);
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
    // pillars down the platform + a track pit along the top wall
    for (const [x, y] of [[8, 6], [8, 11], [17, 5], [17, 12], [26, 6], [26, 11]] as Array<[number, number]>) grid[y][x] = TILE_WALL;
    for (let x = 2; x < AW - 2; x++) grid[1][x] = TILE_TRACK;

    this.wallLayer = createTerrainLayer(this, grid, { profile: "subway", accent: 0x6b9bff });
    this.wallLayer.setCollision([...TILE_VARIANTS[TILE_WALL], TILE_TRACK]);
    this.physics.world.setBounds(0, 0, AW * TILE, AH * TILE);
    this.cameras.main.setBackgroundColor(0x05060c);
  }

  private spawnPlayer(savedHp: number) {
    this.player = new Player(this, 5 * TILE, (AH - 3) * TILE, this.classDef, {
      textureKey: PLAYER_CUSTOM_KEY,
      color: this.playerColor,
    });
    if (savedHp > 0) this.player.hp = Math.min(savedHp, this.player.maxHp);
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
    this.physics.add.collider(this.bullets.group, this.wallLayer, (b) => this.bullets.kill(b as Phaser.Physics.Arcade.Image));
    this.physics.add.collider(this.enemyBullets.group, this.wallLayer, (b) => this.enemyBullets.kill(b as Phaser.Physics.Arcade.Image));
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
      neon.heat = 0.18;
      neon.tint = [0.6, 0.3, 1]; // violet underground
      neon.tintAmt = 0.22;
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
    this.hpText = this.add
      .text(20, 20, "", { fontFamily: "Courier New, monospace", fontSize: "12px", color: "#39ff88" })
      .setScrollFactor(0)
      .setDepth(1001);
    this.add
      .text(this.scale.width / 2, 16, "▼ THE UNDERLINE", { fontFamily: "Courier New, monospace", fontSize: "13px", color: "#b06bff", align: "center" })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1001);
    this.objText = this.add
      .text(this.scale.width / 2, 36, "", { fontFamily: "Courier New, monospace", fontSize: "11px", color: "#f7ff3c", align: "center" })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1001);
    this.add
      .text(this.scale.width - 16, this.scale.height - 20, "ESC flee", { fontFamily: "Courier New, monospace", fontSize: "10px", color: "#9aa3b2" })
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
    if (this.boss && !this.boss.isDead) {
      this.boss.step(this.player, this);
      this.bossBar.update(this.boss.hp / this.boss.maxHp);
    }

    this.manageWaves(now);
    this.updateHud();
  }

  private manageWaves(now: number) {
    if (this.bossSpawned) return;
    const alive = this.enemies.countActive(true);
    if (this.waveActive && alive === 0) {
      this.waveActive = false;
      this.nextWaveAt = now + 1500;
    }
    if (!this.waveActive && alive === 0 && now >= this.nextWaveAt) {
      if (this.waveIndex < WAVES.length) {
        this.spawnWave(this.waveIndex);
        this.waveIndex++;
        this.waveActive = true;
      } else {
        this.spawnBoss();
      }
    }
  }

  private spawnWave(i: number) {
    for (const [tier, count] of WAVES[i]) {
      for (let n = 0; n < count; n++) {
        const ex = Phaser.Math.Between(AW - 12, AW - 3) * TILE;
        const ey = Phaser.Math.Between(3, AH - 4) * TILE;
        const cop = new TuringCop(this, ex, ey, ENEMY_TIERS[tier]);
        cop.setLevel(this.level + 3, this.level); // the deep runs hot
        this.enemies.add(cop);
      }
    }
    juiceShake(this, 160, 0.004);
  }

  private spawnBoss() {
    this.bossSpawned = true;
    const def = getBoss("underline");
    const hp = Math.round(def.hp * (1 + this.level * 0.05));
    this.boss = new Boss(this, (AW - 6) * TILE, (AH / 2) * TILE, def, hp, (x, y, tier) => this.summonAdd(x, y, tier));
    this.physics.add.collider(this.boss, this.wallLayer);
    this.physics.add.overlap(this.bullets.group, this.boss, (b) => this.onBulletHitsBoss(b as Phaser.Physics.Arcade.Image));
    this.bossBar.show(def.name, def.title, def.hex);
    juiceFlash(this, 300, 60, 0, 80);
    juiceShake(this, 300, 0.01);
  }

  private summonAdd(x: number, y: number, tier: string) {
    const cop = new TuringCop(this, x, y, ENEMY_TIERS[tier] ?? ENEMY_TIERS.ratswarm);
    cop.setLevel(this.level + 3, this.level);
    this.enemies.add(cop);
  }

  // ---- combat (shared shape with DiveScene) ----

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

  private muzzleAt(a: number) {
    return { x: this.player.x + Math.cos(a) * 14, y: this.player.y + Math.sin(a) * 14 };
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
    if (this.boss && !this.boss.isDead && this.pointSegDist(this.boss.x, this.boss.y, px, py, ex, ey) <= prim.halfWidth + 16) {
      this.damageBoss(prim.damage * 1.5);
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
    if (cop.hurt(dmg, shieldMult)) {
      this.spark(cop.x, cop.y, COLORS.enemy, 2.4);
      juiceKill(this);
      this.synth?.kill();
    } else {
      cop.knock(cop.x - this.player.x, cop.y - this.player.y, 140);
      this.synth?.hit();
    }
  }

  private onBulletHitsBoss(bullet: Phaser.Physics.Arcade.Image) {
    if (!this.boss || this.boss.isDead) return;
    const dmg = bullet.getData("dmg") as number;
    this.bullets.kill(bullet);
    this.spark(bullet.x, bullet.y, this.boss.def.tint, 1.6);
    this.damageBoss(dmg);
  }

  private damageBoss(dmg: number) {
    if (!this.boss || this.boss.isDead || this.ending) return;
    if (this.boss.hurt(dmg)) {
      this.bossBar.hide();
      this.finish(true);
    }
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
    const ring = this.add.circle(x, y, radius, 0xff7a3c, 0.12).setStrokeStyle(2, 0xff7a3c, 0.85).setDepth(5);
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

  enemyHeal(x: number, y: number, radius: number, amount: number) {
    this.enemies.getChildren().forEach((go) => {
      const cop = go as TuringCop;
      if (cop.active && !cop.isDead && Phaser.Math.Distance.Between(cop.x, cop.y, x, y) <= radius) cop.heal(amount);
    });
  }

  // ---- fx + hud ----

  private spark(x: number, y: number, color: number, scale: number) {
    this.particles.spark(x, y, color, scale);
  }

  private updateHud() {
    this.hpText.setText(`HP ${Math.ceil(this.player.hp)}/${this.player.maxHp}`);
    this.objText.setText(
      this.bossSpawned
        ? "KILL THE UNDERLINE"
        : `CLEAR THE TUNNELS  ${Math.min(this.waveIndex, WAVES.length)}/${WAVES.length}`,
    );
    const g = this.hud;
    g.clear();
    g.fillStyle(0x07061a, 0.7).fillRect(14, 14, 150, 18);
    g.lineStyle(1, 0xb06bff, 0.8).strokeRect(14, 14, 150, 18);
  }

  private flashTitle() {
    const t = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 30, "THE UNDERLINE", { fontFamily: "Courier New, monospace", fontSize: "30px", color: "#b06bff", fontStyle: "bold" })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2000)
      .setAlpha(0)
      .setShadow(0, 0, "#000000", 6, true, true);
    this.tweens.add({ targets: t, alpha: 1, scale: { from: 1.4, to: 1 }, duration: 500, yoyo: true, hold: 800, onComplete: () => t.destroy() });
  }

  /** Grant the clear rewards (unique weapon first time, else a singular roll) to the save. */
  private grantRewards() {
    const save = loadSave();
    if (!save) return;
    const inv = new Inventory();
    inv.load(save.inventory);
    const hasRail = inv.items.some((it) => it.weaponId === "thirdrail") || Object.values(inv.equipped).some((it) => it?.weaponId === "thirdrail");
    const item = makeWeaponItem(hasRail ? "singularity" : "thirdrail", save.progress.level ?? 1);
    inv.add(item);
    save.inventory = inv.toData();
    save.progress.xp = (save.progress.xp ?? 0) + 200;
    save.progress.metro = (save.progress.metro ?? 0) + 120;
    save.progress.hp = Math.max(1, Math.round(this.player.hp)); // carry your wounds back up
    writeSave(save);
    this.registry.set("subwayCleared", true); // advances the "Into the Underline" city quest
  }

  /** End the run: grant loot on a win, persist HP, and fade back to the City. */
  private finish(success: boolean) {
    if (this.ending) return;
    this.ending = true;

    const save = loadSave();
    if (save) {
      if (success) {
        this.grantRewards();
      } else {
        // fled or fell — keep your wounds (death → respawn at full handled by full reset)
        save.progress.hp = this.player.hp > 0 ? Math.round(this.player.hp) : -1;
        writeSave(save);
      }
    }
    if (success) this.synth?.iceShatter();

    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const msg = this.add
      .text(cx, cy, success ? "THE UNDERLINE FALLS\n◈ THE THIRD RAIL recovered" : "YOU FLEE THE DARK", {
        fontFamily: "Courier New, monospace",
        fontSize: "28px",
        color: success ? "#39ff88" : "#ff3b6b",
        fontStyle: "bold",
        align: "center",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2000)
      .setShadow(0, 0, "#000000", 6, true, true);
    if (success) juiceFlash(this, 300, 40, 200, 160);
    juiceShake(this, 300, 0.008);

    this.time.delayedCall(1300, () => {
      this.cameras.main.fadeOut(350, 2, 2, 8);
      this.cameras.main.once("camerafadeoutcomplete", () => {
        msg.destroy();
        this.scene.start("City", { returnTo: this.returnTile });
      });
    });
  }
}
