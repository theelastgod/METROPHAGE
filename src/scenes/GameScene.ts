import Phaser from "phaser";
import {
  TILE,
  WORLD_W,
  WORLD_H,
  COLORS,
  BULLET,
  ENEMY_BULLET,
  HEAT,
  OVERDRIVE,
  SINGULARITY,
  AGENT,
  AGENT_TINTS,
} from "../config";
import { getClass, ClassDef, PrimaryDef } from "../game/classes";
import { AbilityHost, AbilityDef } from "../game/ability";
import { buildGrid, spawnPoint, isWall, TILE_WALL, TileGrid } from "../world/district";
import {
  TILESET_KEY,
  PORTRAIT_PLAYER_KEY,
  PORTRAIT_NPC_KEY,
  VO_MELTDOWN_KEY,
  GLOW_KEY,
  SPARK_KEY,
  STREETLIGHT_KEY,
} from "../assets/manifest";
import Player, { PlayerInput } from "../entities/Player";
import Bullets from "../entities/Bullets";
import TuringCop from "../entities/TuringCop";
import InfectionNode from "../entities/InfectionNode";
import Npc from "../entities/Npc";
import Agent from "../entities/Agent";
import Minion from "../entities/Minion";
import Heat from "../systems/Heat";
import Singularity from "../systems/Singularity";
import NeonPipeline from "../render/NeonPipeline";
import Synth from "../audio/Synth";
import Hud from "../ui/Hud";
import DialogueBox, { DialoguePage } from "../ui/DialogueBox";

/**
 * GameScene — Phase 0.
 * Step 1: movable, colliding player. Step 2: mouse-aim, dash, projectile weapon.
 * Step 3: Turing Cops with a patrol->chase->attack FSM that take damage and die.
 */
export default class GameScene extends Phaser.Scene implements AbilityHost {
  private classDef!: ClassDef;
  private player!: Player;
  private bullets!: Bullets; // player weapon
  private enemyBullets!: Bullets; // hostile fire
  private enemies!: Phaser.Physics.Arcade.Group;
  private wallLayer!: Phaser.Tilemaps.TilemapLayer;
  private grid!: TileGrid;
  private spawn = { x: 0, y: 0 };

  private heat = new Heat();
  private singularity = new Singularity();
  private synth = new Synth(); // persists across scene.restart()
  private won = false;
  private hitStopActive = false;
  private nodeWasInfected = false;
  private node!: InfectionNode;
  private npc!: Npc;
  private agents!: Phaser.Physics.Arcade.Group;
  private minions!: Phaser.Physics.Arcade.Group;
  private neon?: NeonPipeline;
  private hud!: Hud;
  private dialogue!: DialogueBox;

  private overdriveActive = false;
  private overdriveUntil = 0;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private dashKey!: Phaser.Input.Keyboard.Key;
  private eKey!: Phaser.Input.Keyboard.Key;
  private abilityKey!: Phaser.Input.Keyboard.Key;
  private ultKey!: Phaser.Input.Keyboard.Key;
  private overdriveKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super("Game");
  }

  create() {
    const boot = document.getElementById("boot");
    if (boot) {
      boot.style.opacity = "0";
      window.setTimeout(() => boot.remove(), 600);
    }

    // Reset run state (scene.restart() reuses the instance; field initializers
    // only run once at construction, so reset explicitly here).
    this.won = false;
    this.hitStopActive = false;
    this.nodeWasInfected = false;
    this.overdriveActive = false;
    this.overdriveUntil = 0;
    this.physics.world.resume();
    this.heat = new Heat();
    this.singularity = new Singularity();
    this.classDef = getClass(this.registry.get("classId") as string | undefined);

    // Audio needs a user gesture; the intro requires a click/key to advance.
    this.input.once("pointerdown", () => this.synth.ensureStarted());
    this.input.keyboard?.once("keydown", () => this.synth.ensureStarted());

    this.buildDistrict();
    this.spawnPlayer();
    this.setupProjectiles();
    this.setupEnemies();
    this.createNode();
    this.createNpc();
    this.createAgents();
    this.minions = this.physics.add.group();
    this.physics.add.collider(this.minions, this.wallLayer);
    this.createDecor();
    this.setupCamera();
    this.setupPostFX();
    this.setupInput();
    this.setupUi();
  }

  private createNpc() {
    // Friendly contact near the plaza spawn so the player meets it early.
    let tx = 16;
    let ty = 16;
    if (this.grid[ty]?.[tx] === undefined || isWall(this.grid[ty][tx])) {
      tx = 17;
      ty = 16;
    }
    this.npc = new Npc(this, tx * TILE + TILE / 2, ty * TILE + TILE / 2);
  }

  private createAgents() {
    this.agents = this.physics.add.group();
    // Candidate anchors spread across the streets/plaza; validated walkable.
    const spots: Array<[number, number]> = [
      [11, 4],
      [26, 10],
      [33, 18],
      [20, 9],
      [7, 20],
      [30, 28],
      [24, 20],
      [10, 16],
    ];
    let placed = 0;
    for (const [tx, ty] of spots) {
      if (placed >= AGENT.count) break;
      if (this.grid[ty]?.[tx] === undefined || isWall(this.grid[ty][tx])) continue;
      const agent = new Agent(
        this,
        tx * TILE + TILE / 2,
        ty * TILE + TILE / 2,
        AGENT_TINTS[placed % AGENT_TINTS.length],
      );
      this.agents.add(agent);
      placed++;
    }
    this.physics.add.collider(this.agents, this.wallLayer);
  }

  private createDecor() {
    // Streetlights — pure ambiance (no collision), anchored at their base.
    const spots: Array<[number, number]> = [
      [14, 11],
      [25, 11],
      [14, 20],
      [25, 20],
      [7, 11],
      [33, 12],
    ];
    for (const [tx, ty] of spots) {
      if (this.grid[ty]?.[tx] === undefined || isWall(this.grid[ty][tx])) continue;
      this.add
        .image(tx * TILE + TILE / 2, ty * TILE + TILE, STREETLIGHT_KEY)
        .setOrigin(0.5, 1)
        .setDepth(6);
    }
  }

  private setupUi() {
    this.hud = new Hud(this);
    this.dialogue = new DialogueBox(this);
    this.dialogue.show(this.introPages());
  }

  private createNode() {
    // A capture target placed on open street, away from the player spawn.
    let tx = 13;
    let ty = 24;
    if (this.grid[ty]?.[tx] === undefined || isWall(this.grid[ty][tx])) {
      // fallback: first walkable tile reasonably far from spawn
      outer: for (let y = 1; y < this.grid.length - 1; y++) {
        for (let x = 1; x < this.grid[0].length - 1; x++) {
          const wx = x * TILE + TILE / 2;
          const wy = y * TILE + TILE / 2;
          if (
            !isWall(this.grid[y][x]) &&
            Phaser.Math.Distance.Between(wx, wy, this.spawn.x, this.spawn.y) > 200
          ) {
            tx = x;
            ty = y;
            break outer;
          }
        }
      }
    }
    this.node = new InfectionNode(this, tx * TILE + TILE / 2, ty * TILE + TILE / 2);
  }

  private setupPostFX() {
    if (this.renderer.type !== Phaser.WEBGL) return;
    const cam = this.cameras.main;
    cam.setPostPipeline("Neon");
    const p = cam.getPostPipeline("Neon");
    this.neon = (Array.isArray(p) ? p[0] : p) as NeonPipeline;
  }

  private buildDistrict() {
    this.grid = buildGrid();
    const map = this.make.tilemap({
      data: this.grid,
      tileWidth: TILE,
      tileHeight: TILE,
    });
    const tileset = map.addTilesetImage(TILESET_KEY, TILESET_KEY, TILE, TILE)!;
    this.wallLayer = map.createLayer(0, tileset, 0, 0)!;
    this.wallLayer.setCollision(TILE_WALL);

    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBackgroundColor(COLORS.bgVoid);
    this.spawn = spawnPoint(this.grid);
  }

  private spawnPlayer() {
    this.player = new Player(this, this.spawn.x, this.spawn.y, this.classDef);
    this.physics.add.collider(this.player, this.wallLayer);
  }

  private setupProjectiles() {
    // The player projectile pool is configured from the chosen class primary.
    const prim = this.classDef.primary;
    if (prim.kind === "beam") {
      this.bullets = new Bullets(this, { tint: this.classDef.color }); // unused by beam
    } else {
      this.bullets = new Bullets(this, {
        speed: prim.speed,
        lifetimeMs: prim.lifetimeMs,
        radius: BULLET.radius,
        maxActive: 96,
        tint: this.classDef.color,
        damage: prim.damage,
      });
    }
    this.enemyBullets = new Bullets(this, {
      speed: ENEMY_BULLET.speed,
      lifetimeMs: ENEMY_BULLET.lifetimeMs,
      radius: ENEMY_BULLET.radius,
      maxActive: ENEMY_BULLET.maxActive,
      tint: ENEMY_BULLET.tint,
    });

    this.physics.add.collider(
      this.bullets.group,
      this.wallLayer,
      (b) => this.onBulletHitWall(this.bullets, b as Phaser.Physics.Arcade.Image),
      undefined,
      this,
    );
    this.physics.add.collider(
      this.enemyBullets.group,
      this.wallLayer,
      (b) =>
        this.onBulletHitWall(this.enemyBullets, b as Phaser.Physics.Arcade.Image),
      undefined,
      this,
    );
  }

  private setupEnemies() {
    this.enemies = this.physics.add.group();
    this.spawnCops();

    this.physics.add.collider(this.enemies, this.wallLayer);
    this.physics.add.overlap(
      this.bullets.group,
      this.enemies,
      (b, c) =>
        this.onBulletHitsCop(
          b as Phaser.Physics.Arcade.Image,
          c as TuringCop,
        ),
      undefined,
      this,
    );
    // NOTE: pass (player, group) so the callback args are unambiguous — Phaser
    // swaps a (group, sprite) overlap to sprite-vs-group internally.
    this.physics.add.overlap(
      this.player,
      this.enemyBullets.group,
      (_p, b) => this.onEnemyBulletHitsPlayer(b as Phaser.Physics.Arcade.Image),
      undefined,
      this,
    );
  }

  private spawnCops() {
    // Hand-picked patrol posts; validated against the grid so none spawn in a wall.
    const posts: Array<[number, number]> = [
      [13, 5],
      [27, 6],
      [34, 11],
      [27, 16],
      [8, 16],
      [20, 27],
      [13, 23],
    ];
    let placed = 0;
    for (const [tx, ty] of posts) {
      if (placed >= 5) break;
      if (this.grid[ty]?.[tx] === undefined || isWall(this.grid[ty][tx])) continue;
      const cop = new TuringCop(
        this,
        tx * TILE + TILE / 2,
        ty * TILE + TILE / 2,
      );
      this.enemies.add(cop);
      placed++;
    }
  }

  private setupCamera() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.startFollow(this.player, true, 0.12, 0.12);
    // Zoom stays at 1: the close feel comes from the small logical resolution
    // (Scale.FIT upscales). Zooming here would displace scroll-fixed HUD/dialogue.
  }

  private setupInput() {
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys("W,A,S,D") as typeof this.wasd;
    this.dashKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.eKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.abilityKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.ultKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.overdriveKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.input.mouse?.disableContextMenu();
  }

  private introPages(): DialoguePage[] {
    const me = { key: PORTRAIT_PLAYER_KEY };
    return [
      {
        speaker: "// SYSTEM",
        portrait: me,
        text: "Cyberian online. You are a process the city cannot account for.",
      },
      {
        speaker: "// SYSTEM",
        portrait: me,
        text: "Burn the Turing cops. Infect the node. Drive the Singularity to 100 and the Human Security System melts down.",
      },
      {
        speaker: "// SYSTEM",
        portrait: me,
        text: "WASD move · MOUSE aim · CLICK fire · SPACE dash · E talk. Heat fuels you — and lights the sky.",
      },
    ];
  }

  private npcPages(): DialoguePage[] {
    const fixer = { key: PORTRAIT_NPC_KEY, frame: 0 };
    return [
      {
        speaker: "FIXER",
        portrait: fixer,
        text: "You actually showed. Most cyberians flatline before they reach the plaza.",
      },
      {
        speaker: "FIXER",
        portrait: fixer,
        text: "That node down the street pipes straight into the city's spine. Channel it and the meltdown does the rest.",
      },
      {
        speaker: "FIXER",
        portrait: fixer,
        text: "Keep your Heat up — the hotter you run, the harder you hit. Just don't let the cops box you in.",
      },
    ];
  }

  // --- combat modifiers: Overdrive overrides Heat tiers while active ---
  private get inOverdrive(): boolean {
    return this.overdriveActive;
  }
  private get dmgMult(): number {
    return this.inOverdrive ? OVERDRIVE.damageMult : this.heat.damageMult;
  }
  private get spdMult(): number {
    return this.inOverdrive ? OVERDRIVE.speedMult : this.heat.speedMult;
  }
  private get abilityRate(): number {
    return this.inOverdrive ? OVERDRIVE.abilityRate : this.heat.abilityRate;
  }

  private updateHud() {
    const now = this.time.now;
    this.hud.update({
      hp: this.player.hp,
      hpMax: this.player.maxHp,
      heat: this.heat.value,
      heatNorm: this.heat.normalized,
      overclock: this.heat.buffActive,
      sing: this.singularity.value,
      singNorm: this.singularity.normalized,
      classColor: this.classDef.color,
      abilityName: this.classDef.ability.name,
      abilityReady: now >= this.player.nextAbilityAt,
      ultName: this.classDef.ultimate.name,
      ultReady: this.heat.canUlt && now >= this.player.nextUltAt,
      overdriveReady: this.heat.canOverdrive,
      overdriveActive: this.inOverdrive,
    });
  }

  update(_time: number, delta: number) {
    if (this.won) return; // meltdown sequence runs on tweens/timers; freeze the sim
    if (this.hitStopActive) return; // brief impact freeze

    const now = this.time.now;

    // OVERDRIVE lifecycle.
    if (this.overdriveActive && now >= this.overdriveUntil) this.endOverdrive();

    this.updateHud();
    if (this.dialogue.isOpen) return; // freeze the sim while a dialogue is up

    // HEAT: pinned during Overdrive, else decay. Drives post-FX + music.
    if (this.inOverdrive) {
      this.heat.value = HEAT.max;
      if (this.neon) this.neon.heat = 1;
      this.synth.setIntensity(1);
    } else {
      this.heat.update(now, delta);
      if (this.neon) this.neon.heat = this.heat.normalized;
      this.synth.setIntensity(this.heat.normalized);
    }
    this.player.speedMult = this.spdMult;

    const input = this.readInput();
    this.player.step(input);

    const angle = this.player.tryFire(input);
    if (angle !== null) this.fireWeapon(angle);

    this.handleAbilities(now);

    this.bullets.update(now);
    this.enemyBullets.update(now);

    this.enemies.getChildren().forEach((go) => {
      const cop = go as TuringCop;
      if (cop.active && !cop.isDead) {
        cop.step(this.player, (x, y, a) =>
          this.enemyBullets.fire(x + Math.cos(a) * 16, y + Math.sin(a) * 16, a),
        );
      }
    });

    this.agents.getChildren().forEach((go) => (go as Agent).step(now));

    const cops = this.enemies.getChildren() as TuringCop[];
    this.minions.getChildren().forEach((go) =>
      (go as Minion).step(now, cops, (cop, dmg) => this.damageCop(cop, dmg, false)),
    );

    // INFECTION + SINGULARITY: channel the node by proximity; infected node ticks
    // the global meter upward.
    const nodeDist = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.node.x,
      this.node.y,
    );
    this.node.update(nodeDist, delta);
    if (this.node.infected) {
      if (!this.nodeWasInfected) {
        this.nodeWasInfected = true;
        this.synth.infect();
        this.cameras.main.shake(220, 0.005);
      }
      this.singularity.add(SINGULARITY.perInfectedSec * (delta / 1000));
    }

    if (this.singularity.isComplete) {
      this.triggerMeltdown();
      return;
    }

    // NPC interaction.
    const npcDist = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.npc.x,
      this.npc.y,
    );
    const inRange = this.npc.update(npcDist);
    if (inRange && Phaser.Input.Keyboard.JustDown(this.eKey)) {
      this.dialogue.show(this.npcPages());
    }
  }

  private triggerMeltdown() {
    this.won = true;
    this.player.setVelocity(0, 0);
    this.synth.meltdown();
    this.synth.setIntensity(1);
    // Optional ElevenLabs VO stinger (build-time generated); sting plays regardless.
    if (this.cache.audio.exists(VO_MELTDOWN_KEY)) {
      this.time.delayedCall(650, () => this.sound.play(VO_MELTDOWN_KEY, { volume: 0.9 }));
    }

    const cam = this.cameras.main;
    cam.shake(800, 0.014);
    cam.flash(450, 180, 0, 220);

    // Ramp the post-FX past its normal ceiling into full glitch overload.
    if (this.neon) {
      this.tweens.add({
        targets: this.neon,
        heat: 1,
        glitch: 1,
        duration: 1500,
        ease: "Quad.in",
      });
    }

    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    const title = this.add
      .text(cx, cy - 8, "MELTDOWN", {
        fontFamily: "Courier New, monospace",
        fontSize: "76px",
        color: "#ff2bd6",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2000)
      .setAlpha(0);
    title.setShadow(0, 0, "#00e5ff", 26, true, true);
    this.tweens.add({
      targets: title,
      alpha: 1,
      scale: { from: 1.6, to: 1 },
      duration: 700,
      delay: 300,
      ease: "Back.out",
    });

    this.time.delayedCall(1900, () => {
      const sub = this.add
        .text(cx, cy + 52, "THE CITY HAS ACCELERATED PAST ESCAPE", {
          fontFamily: "Courier New, monospace",
          fontSize: "16px",
          color: "#00e5ff",
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(2000)
        .setAlpha(0);
      const prompt = this.add
        .text(cx, cy + 92, "▶ CLICK or press R to RESTART", {
          fontFamily: "Courier New, monospace",
          fontSize: "18px",
          color: "#f7ff3c",
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(2000)
        .setAlpha(0);

      this.tweens.add({ targets: [sub, prompt], alpha: 1, duration: 500 });
      this.tweens.add({
        targets: prompt,
        alpha: { from: 1, to: 0.4 },
        duration: 700,
        yoyo: true,
        repeat: -1,
      });
      this.enableRestart();
    });
  }

  private enableRestart() {
    const restart = () => this.scene.restart();
    this.input.once("pointerdown", restart);
    this.input.keyboard?.once("keydown-R", restart);
  }

  private readInput(): PlayerInput {
    const p = this.input.activePointer;
    const world = this.cameras.main.getWorldPoint(p.x, p.y);
    return {
      left: this.cursors.left.isDown || this.wasd.A.isDown,
      right: this.cursors.right.isDown || this.wasd.D.isDown,
      up: this.cursors.up.isDown || this.wasd.W.isDown,
      down: this.cursors.down.isDown || this.wasd.S.isDown,
      dash: Phaser.Input.Keyboard.JustDown(this.dashKey),
      fire: p.isDown,
      aimX: world.x,
      aimY: world.y,
    };
  }

  private fireWeapon(angle: number) {
    const prim = this.classDef.primary;
    switch (prim.kind) {
      case "spread":
        this.fireSpread(angle, prim);
        break;
      case "burst":
        this.fireBurst(angle, prim);
        break;
      case "rapid":
        this.fireRapid(angle, prim);
        break;
      case "beam":
        this.fireBeam(angle, prim);
        break;
    }
    this.cameras.main.shake(40, 0.0018);
    this.synth.shoot();
  }

  private muzzleAt(angle: number): { x: number; y: number } {
    return {
      x: this.player.x + Math.cos(angle) * 14,
      y: this.player.y + Math.sin(angle) * 14,
    };
  }

  private fireSpread(angle: number, prim: Extract<PrimaryDef, { kind: "spread" }>) {
    const half = Phaser.Math.DegToRad(prim.spreadDeg) / 2;
    for (let i = 0; i < prim.pellets; i++) {
      const t = prim.pellets === 1 ? 0.5 : i / (prim.pellets - 1);
      const a = angle - half + t * 2 * half + Phaser.Math.FloatBetween(-0.04, 0.04);
      const m = this.muzzleAt(a);
      this.bullets.fire(m.x, m.y, a);
    }
    const m = this.muzzleAt(angle);
    this.muzzleFlash(m.x, m.y);
  }

  private fireBurst(angle: number, prim: Extract<PrimaryDef, { kind: "burst" }>) {
    const shoot = () => {
      const m = this.muzzleAt(angle);
      this.bullets.fire(m.x, m.y, angle);
      this.muzzleFlash(m.x, m.y);
    };
    shoot();
    for (let i = 1; i < prim.burstCount; i++) {
      this.time.delayedCall(i * prim.burstGapMs, shoot);
    }
  }

  private fireRapid(angle: number, prim: Extract<PrimaryDef, { kind: "rapid" }>) {
    const j = Phaser.Math.DegToRad(prim.jitterDeg);
    const a = angle + Phaser.Math.FloatBetween(-j, j);
    const m = this.muzzleAt(a);
    this.bullets.fire(m.x, m.y, a);
    this.muzzleFlash(m.x, m.y);
  }

  private fireBeam(angle: number, prim: Extract<PrimaryDef, { kind: "beam" }>) {
    const px = this.player.x;
    const py = this.player.y;
    const ex = px + Math.cos(angle) * prim.range;
    const ey = py + Math.sin(angle) * prim.range;
    const dmg = prim.damage * this.dmgMult;

    // Pierce: hit every cop near the beam line.
    this.enemies.getChildren().forEach((go) => {
      const cop = go as TuringCop;
      if (!cop.active || cop.isDead) return;
      if (this.pointSegDist(cop.x, cop.y, px, py, ex, ey) <= prim.halfWidth + 10) {
        this.spark(cop.x, cop.y, this.classDef.color, 1.4);
        this.damageCop(cop, dmg);
      }
    });

    const g = this.add.graphics().setDepth(11);
    g.lineStyle(4, this.classDef.color, 0.85).lineBetween(px, py, ex, ey);
    g.lineStyle(1.5, 0xffffff, 0.9).lineBetween(px, py, ex, ey);
    this.tweens.add({
      targets: g,
      alpha: 0,
      duration: 130,
      onComplete: () => g.destroy(),
    });
  }

  /** Distance from a point to a segment (clamped), for beam hit tests. */
  private pointSegDist(
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
  ): number {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Phaser.Math.Clamp(t, 0, 1);
    return Phaser.Math.Distance.Between(px, py, ax + t * dx, ay + t * dy);
  }

  /**
   * Apply damage to a cop + shared kill/heat/singularity/feedback. `juice` adds
   * hit-stop + shake (player hits); minion/DoT hits pass false to avoid spam.
   */
  damageCop(cop: TuringCop, dmg: number, juice = true) {
    if (!cop.active || cop.isDead) return;
    const killed = cop.hurt(dmg);
    this.heat.add(dmg * HEAT.perDamage, this.time.now);
    if (killed) {
      this.heat.add(HEAT.perKill, this.time.now);
      this.singularity.add(SINGULARITY.perKill);
      this.synth.kill();
      if (juice) {
        this.hitStop(60);
        this.cameras.main.shake(140, 0.006);
      }
    } else if (juice) {
      this.synth.hit();
    }
  }

  // ---- abilities / ultimate / overdrive ----

  private handleAbilities(now: number) {
    if (
      Phaser.Input.Keyboard.JustDown(this.abilityKey) &&
      now >= this.player.nextAbilityAt
    ) {
      this.player.nextAbilityAt =
        now + this.classDef.ability.cooldownMs / this.abilityRate;
      this.runAbility(this.classDef.ability);
    }

    if (
      Phaser.Input.Keyboard.JustDown(this.ultKey) &&
      this.heat.canUlt &&
      now >= this.player.nextUltAt
    ) {
      this.player.nextUltAt = now + this.classDef.ultimate.cooldownMs;
      this.heat.spend(HEAT.ultHeatCost);
      this.runAbility(this.classDef.ultimate);
      this.cameras.main.flash(120, 40, 0, 80);
    }

    if (
      Phaser.Input.Keyboard.JustDown(this.overdriveKey) &&
      this.heat.canOverdrive &&
      !this.overdriveActive
    ) {
      this.startOverdrive(now);
    }
  }

  private runAbility(def: AbilityDef) {
    const p = this.input.activePointer;
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    const aimAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, w.x, w.y);
    def.run({ host: this, player: this.player, aimX: w.x, aimY: w.y, aimAngle });
    this.synth.infect(); // cast sfx
  }

  private startOverdrive(now: number) {
    this.overdriveActive = true;
    this.overdriveUntil = now + OVERDRIVE.durationMs;
    this.player.nextAbilityAt = 0; // ability spam
    this.cameras.main.flash(300, 120, 0, 160);
    this.cameras.main.shake(400, 0.006);
    this.synth.meltdown();
    if (this.neon) {
      this.neon.glitch = 0.5;
      this.tweens.add({ targets: this.neon, glitch: 0, duration: 900 });
    }
    this.floatText("OVERDRIVE", this.classDef.hex);
  }

  private endOverdrive() {
    this.overdriveActive = false;
    this.heat.reset(this.time.now);
    this.cameras.main.flash(220, 80, 0, 40);
    this.floatText("SYSTEM PURGE", "#ff3b6b");
    this.spawnPurgeWave();
  }

  private spawnPurgeWave() {
    for (let i = 0; i < OVERDRIVE.purgeCops; i++) {
      const a = (i / OVERDRIVE.purgeCops) * Math.PI * 2 + Math.random() * 0.4;
      const r = 180 + Math.random() * 120;
      const x = Phaser.Math.Clamp(
        this.player.x + Math.cos(a) * r,
        TILE * 1.5,
        WORLD_W - TILE * 1.5,
      );
      const y = Phaser.Math.Clamp(
        this.player.y + Math.sin(a) * r,
        TILE * 1.5,
        WORLD_H - TILE * 1.5,
      );
      this.spawnCopAt(x, y);
    }
  }

  private spawnCopAt(x: number, y: number) {
    const cop = new TuringCop(this, x, y);
    this.enemies.add(cop);
  }

  // ---- AbilityHost (effects invoked by class ability/ultimate hooks) ----

  aoeDamage(x: number, y: number, radius: number, dmg: number) {
    this.enemies.getChildren().forEach((go) => {
      const cop = go as TuringCop;
      if (!cop.active || cop.isDead) return;
      if (Phaser.Math.Distance.Between(cop.x, cop.y, x, y) <= radius) {
        this.damageCop(cop, dmg, false);
      }
    });
  }

  telegraphBlast(
    x: number,
    y: number,
    radius: number,
    dmg: number,
    delayMs: number,
    color: number,
  ) {
    const ring = this.add
      .circle(x, y, radius, color, 0.12)
      .setStrokeStyle(2, color, 0.8)
      .setDepth(5);
    this.tweens.add({
      targets: ring,
      alpha: { from: 0.15, to: 0.4 },
      yoyo: true,
      repeat: -1,
      duration: 180,
    });
    this.time.delayedCall(delayMs, () => {
      ring.destroy();
      this.aoeDamage(x, y, radius, dmg);
      const b = this.add.circle(x, y, radius, color, 0.5).setDepth(6);
      this.tweens.add({
        targets: b,
        alpha: 0,
        scale: 1.3,
        duration: 320,
        onComplete: () => b.destroy(),
      });
      this.spark(x, y, color, 4);
      this.cameras.main.shake(160, 0.009);
    });
  }

  lingeringPool(
    x: number,
    y: number,
    radius: number,
    dps: number,
    durMs: number,
    color: number,
  ) {
    const pool = this.add.circle(x, y, radius, color, 0.16).setDepth(4);
    this.tweens.add({
      targets: pool,
      alpha: { from: 0.1, to: 0.24 },
      yoyo: true,
      repeat: -1,
      duration: 380,
    });
    const tick = this.time.addEvent({
      delay: 300,
      loop: true,
      callback: () => this.aoeDamage(x, y, radius, dps * 0.3),
    });
    this.time.delayedCall(durMs, () => {
      tick.remove();
      this.tweens.add({
        targets: pool,
        alpha: 0,
        duration: 320,
        onComplete: () => pool.destroy(),
      });
    });
  }

  coneDisable(angle: number, range: number, halfDeg: number, durMs: number, color: number) {
    const half = Phaser.Math.DegToRad(halfDeg);
    this.enemies.getChildren().forEach((go) => {
      const cop = go as TuringCop;
      if (!cop.active || cop.isDead) return;
      if (Phaser.Math.Distance.Between(cop.x, cop.y, this.player.x, this.player.y) > range)
        return;
      const a = Phaser.Math.Angle.Between(this.player.x, this.player.y, cop.x, cop.y);
      if (Math.abs(Phaser.Math.Angle.Wrap(a - angle)) <= half) cop.disable(durMs);
    });
    const g = this.add.graphics().setDepth(11);
    g.fillStyle(color, 0.18);
    g.fillTriangle(
      this.player.x,
      this.player.y,
      this.player.x + Math.cos(angle - half) * range,
      this.player.y + Math.sin(angle - half) * range,
      this.player.x + Math.cos(angle + half) * range,
      this.player.y + Math.sin(angle + half) * range,
    );
    this.tweens.add({ targets: g, alpha: 0, duration: 300, onComplete: () => g.destroy() });
  }

  spawnMinions(
    count: number,
    x: number,
    y: number,
    lifeMs: number,
    tint: number,
    dmg: number,
  ) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 10 + Math.random() * 30;
      this.minions.add(
        new Minion(this, x + Math.cos(a) * r, y + Math.sin(a) * r, lifeMs, tint, dmg),
      );
    }
  }

  dashStrike(player: Player, angle: number, color: number) {
    this.telegraphBlast(player.x, player.y, 60, 46, 650, color); // charge at start point
    player.forceDash(angle, 720, 180);
  }

  private floatText(msg: string, color: string) {
    const t = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 44, msg, {
        fontFamily: "Courier New, monospace",
        fontSize: "40px",
        color,
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2000)
      .setAlpha(0);
    t.setShadow(0, 0, "#00e5ff", 16, true, true);
    this.tweens.add({
      targets: t,
      alpha: 1,
      scale: { from: 1.5, to: 1 },
      duration: 280,
      yoyo: true,
      hold: 650,
      onComplete: () => t.destroy(),
    });
  }

  /** Brief impact freeze for game feel (pauses physics + sim). */
  private hitStop(ms: number) {
    if (this.hitStopActive) return;
    this.hitStopActive = true;
    this.physics.world.pause();
    this.time.delayedCall(ms, () => {
      this.hitStopActive = false;
      this.physics.world.resume();
    });
  }

  private onBulletHitWall(manager: Bullets, bullet: Phaser.Physics.Arcade.Image) {
    const { x, y } = bullet;
    manager.kill(bullet);
    this.spark(x, y, COLORS.spark, 2);
  }

  private onBulletHitsCop(bullet: Phaser.Physics.Arcade.Image, cop: TuringCop) {
    if (!cop.active || cop.isDead) return;
    const dmg = (bullet.getData("dmg") as number) * this.dmgMult;
    this.bullets.kill(bullet);
    this.spark(bullet.x, bullet.y, COLORS.enemyEdge, 1.6);
    this.damageCop(cop, dmg);
  }

  private onEnemyBulletHitsPlayer(bullet: Phaser.Physics.Arcade.Image) {
    this.enemyBullets.kill(bullet);
    if (this.player.invulnerable) return; // negated by dash / respawn i-frames
    const died = this.player.applyDamage(ENEMY_BULLET.damage);
    this.cameras.main.shake(60, 0.004);
    this.synth.hit();
    this.hitStop(45);
    if (died) this.respawnPlayer();
  }

  private respawnPlayer() {
    this.player.respawn(this.spawn.x, this.spawn.y);
    this.cameras.main.flash(220, 60, 0, 24);
  }

  private muzzleFlash(x: number, y: number) {
    const f = this.add
      .image(x, y, GLOW_KEY)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(COLORS.bullet)
      .setDepth(11)
      .setScale(0.45);
    this.tweens.add({
      targets: f,
      scale: 0,
      alpha: 0,
      duration: 110,
      onComplete: () => f.destroy(),
    });
  }

  private spark(x: number, y: number, color: number, scale: number) {
    const s = this.add
      .image(x, y, SPARK_KEY)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(color)
      .setDepth(11)
      .setScale(0.8);
    this.tweens.add({
      targets: s,
      scale: scale * 1.4,
      alpha: 0,
      duration: 160,
      onComplete: () => s.destroy(),
    });
  }
}
