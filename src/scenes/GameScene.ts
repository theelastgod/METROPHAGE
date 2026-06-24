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
  SPAWN,
  BEAM_SHIELD_MULT,
  CRIT_MULT,
} from "../config";
import { getClass, ClassDef, PrimaryDef } from "../game/classes";
import { AbilityHost, AbilityDef } from "../game/ability";
import { ENEMY_TIERS, ENEMY_BARKS, EnemyHost } from "../game/enemies";
import { buildGrid, spawnPoint, isWall, TILE_WALL, TileGrid } from "../world/district";
import { DistrictDef, DISTRICTS } from "../game/districts";
import {
  TILESET_KEY,
  PORTRAIT_PLAYER_KEY,
  PORTRAIT_NPC_KEY,
  VO_MELTDOWN_KEY,
  STREETLIGHT_KEY,
  GLOW_KEY,
} from "../assets/manifest";
import Player, { PlayerInput } from "../entities/Player";
import Bullets from "../entities/Bullets";
import TuringCop from "../entities/TuringCop";
import Territory from "../game/Territory";
import Npc from "../entities/Npc";
import Agent from "../entities/Agent";
import Minion from "../entities/Minion";
import Heat from "../systems/Heat";
import City from "../systems/City";
import Memory from "../systems/Memory";
import WorldEvents, { WorldEventHost } from "../systems/WorldEvents";
import { WorldEventDef } from "../game/worldEvents";
import Progression from "../systems/Progression";
import Inventory from "../systems/Inventory";
import Contracts from "../systems/Contracts";
import Vendor from "../systems/Vendor";
import { loadSave, writeSave } from "../systems/Save";
import {
  Customization,
  sanitizeCustomization,
  bakeCustomPlayer,
  PLAYER_CUSTOM_KEY,
} from "../game/customization";
import { CONSUMABLES, CONSUMABLE_KEYS } from "../game/consumables";
import { ModBag, ZERO_MODS, addMods } from "../game/stats";
import { rollItem } from "../game/items";
import { Contract, objectiveLabel } from "../game/contracts";
import { getFragment, FRAGMENTS } from "../game/fragments";
import { generateDive, DiveResult } from "../game/dives";
import Pickup from "../entities/Pickup";
import Terminal from "../entities/Terminal";
import ExtractionGate from "../entities/ExtractionGate";
import Boss from "../entities/Boss";
import { getBoss, BossDef } from "../game/bosses";
import NeonPipeline from "../render/NeonPipeline";
import Atmosphere from "../render/Atmosphere";
import Synth from "../audio/Synth";
import Pops from "../render/Pops";
import Particles from "../render/Particles";
import { juiceShake, juiceFlash } from "../systems/juice";
import Hud from "../ui/Hud";
import DialogueBox, { DialoguePage } from "../ui/DialogueBox";
import SkillPanel from "../ui/SkillPanel";
import InventoryPanel from "../ui/InventoryPanel";
import ContractPanel from "../ui/ContractPanel";
import VendorPanel from "../ui/VendorPanel";
import CityMapPanel from "../ui/CityMapPanel";
import JournalPanel from "../ui/JournalPanel";
import OptionsPanel from "../ui/OptionsPanel";
import StatsPanel, { StatLine } from "../ui/StatsPanel";
import Quests from "../systems/Quests";
import { DIALOGUE_TREES } from "../game/dialogue";
import BossBar from "../ui/BossBar";

/**
 * GameScene — Phase 0.
 * Step 1: movable, colliding player. Step 2: mouse-aim, dash, projectile weapon.
 * Step 3: Turing Cops with a patrol->chase->attack FSM that take damage and die.
 */
export default class GameScene
  extends Phaser.Scene
  implements AbilityHost, EnemyHost, WorldEventHost
{
  private classDef!: ClassDef;
  private customization!: Customization; // player look (colour + silhouette)
  private playerColor!: number; // signature tint (from customization), drives player visuals
  private district!: DistrictDef;
  private districtIndex = 0;
  private cycleMult = 1; // NG+ difficulty scalar (1 + cycle * step)
  private nextSpawnAt = 0;
  private nextBarkAt = 0; // throttle for HSS deploy barks
  // Active on-hit statuses per enemy (burn DoT + chill slow; shock reuses disable()).
  private statuses = new Map<TuringCop, { burnUntil: number; burnNext: number; chillUntil: number }>();
  private player!: Player;
  private bullets!: Bullets; // player weapon
  private enemyBullets!: Bullets; // hostile fire
  private enemies!: Phaser.Physics.Arcade.Group;
  private wallLayer!: Phaser.Tilemaps.TilemapLayer;
  private grid!: TileGrid;
  private spawn = { x: 0, y: 0 };

  private heat = new Heat();
  private city!: City;
  private progression!: Progression;
  private inventory = new Inventory();
  private contracts!: Contracts;
  private vendor!: Vendor;
  private mods: ModBag = ZERO_MODS;
  private skillPanel!: SkillPanel;
  private inventoryPanel!: InventoryPanel;
  private contractPanel!: ContractPanel;
  private vendorPanel!: VendorPanel;
  private cityMapPanel!: CityMapPanel;
  private journalPanel!: JournalPanel;
  private optionsPanel!: OptionsPanel;
  private statsPanel!: StatsPanel;
  private quests!: Quests;
  private memory!: Memory;
  private terminal!: Terminal;
  private vendorTerminal!: Terminal;
  private diveTerminal!: Terminal;
  private contractMarker!: Phaser.GameObjects.Graphics;
  private consumeKeys!: Phaser.Input.Keyboard.Key[];
  private pickups!: Phaser.Physics.Arcade.Group;
  private nextAutosaveAt = 0;
  private synth = new Synth(); // persists across scene.restart()
  private pops!: Pops; // pooled damage-number / callout text
  private particles!: Particles; // pooled spark / glow FX
  private prevHeatTier = 0;
  private combatHeat = 0; // 0..1, spikes on hits + decays — swells the music in fights
  private won = false;
  private traveling = false;
  private hitStopActive = false;
  private districtSecured = false;
  private gate?: ExtractionGate;
  private boss?: Boss;
  private bossBar!: BossBar;
  private bossEnrageBarked = false; // enrage line fires once
  private nextBossBarkAt = 0; // throttle for boss combat barks
  private worldEvents!: WorldEvents;
  private eventBanner!: Phaser.GameObjects.Text;
  private blackoutOverlay?: Phaser.GameObjects.Rectangle;
  private stormStrikeAt = 0;
  private territory!: Territory;
  private npc!: Npc;
  private agents!: Phaser.Physics.Arcade.Group;
  private minions!: Phaser.Physics.Arcade.Group;
  private neon?: NeonPipeline;
  private atmosphere!: Atmosphere;
  private playerAura?: Phaser.GameObjects.Image;
  private playerLight?: Phaser.GameObjects.Image; // soft ground pool that follows the hero
  private nodeLights: Phaser.GameObjects.Image[] = []; // per-node light pools (recolored by state)
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
  private skillKey!: Phaser.Input.Keyboard.Key;
  private invKey!: Phaser.Input.Keyboard.Key;
  private mapKey!: Phaser.Input.Keyboard.Key;
  private journalKey!: Phaser.Input.Keyboard.Key;
  private optionsKey!: Phaser.Input.Keyboard.Key;
  private statsKey!: Phaser.Input.Keyboard.Key;

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
    this.traveling = false;
    this.hitStopActive = false;
    this.districtSecured = false;
    this.gate = undefined;
    this.boss = undefined;
    this.blackoutOverlay?.destroy();
    this.blackoutOverlay = undefined;
    this.stormStrikeAt = 0;
    this.prevHeatTier = 0;
    this.combatHeat = 0;
    this.overdriveActive = false;
    this.overdriveUntil = 0;
    this.nextSpawnAt = 0;
    this.statuses.clear();
    this.physics.world.resume();
    this.heat = new Heat();
    this.nextAutosaveAt = 0;

    // Resume from save (Continue) or start a fresh run for the chosen class.
    const save = this.registry.get("resume") ? loadSave() : null;
    this.inventory = new Inventory();
    if (save) {
      this.classDef = getClass(save.progress.classId);
      this.progression = new Progression(save.progress.classId, save.progress);
      this.city = new City(save.city);
      this.memory = new Memory(save.memory);
      this.quests = new Quests(save.quests);
      this.inventory.load(save.inventory);
      this.contracts = new Contracts(save.contracts);
      this.customization = sanitizeCustomization(save.customization, this.classDef.id);
    } else {
      this.classDef = getClass(this.registry.get("classId") as string | undefined);
      this.progression = new Progression(this.classDef.id);
      this.city = new City();
      this.memory = new Memory();
      this.quests = new Quests();
      this.contracts = new Contracts();
      this.customization = sanitizeCustomization(
        this.registry.get("customization") as Partial<Customization> | undefined,
        this.classDef.id,
      );
    }
    // Bake the player's custom sprite (grayscale, tinted to playerColor in-scene).
    this.playerColor = this.customization.color;
    bakeCustomPlayer(this, this.customization);
    this.contracts.refresh(this.progression.level);
    this.vendor = new Vendor(this.progression.level);

    // The district to run comes from campaign meta (advanced on extraction).
    this.districtIndex = this.city.index;
    this.district = this.city.current;
    this.cycleMult = 1 + this.city.cycle * 0.35; // NG+ makes the whole city tougher

    // Audio needs a user gesture; the intro requires a click/key to advance.
    this.input.once("pointerdown", () => this.synth.ensureStarted());
    this.input.keyboard?.once("keydown", () => this.synth.ensureStarted());
    this.registry.set("synth", this.synth); // shared with the DiveScene

    this.buildDistrict();
    this.spawnPlayer();
    this.setupProjectiles();
    this.setupEnemies();
    this.createTerritory();
    this.createNpc();
    this.terminal = new Terminal(
      this,
      this.district.boardTile[0] * TILE + TILE / 2,
      this.district.boardTile[1] * TILE + TILE / 2,
    );
    this.vendorTerminal = new Terminal(
      this,
      this.district.shopTile[0] * TILE + TILE / 2,
      this.district.shopTile[1] * TILE + TILE / 2,
      "FIXER",
      "E  SHOP",
      0xf7ff3c,
    );
    this.diveTerminal = new Terminal(
      this,
      this.district.diveTile[0] * TILE + TILE / 2,
      this.district.diveTile[1] * TILE + TILE / 2,
      "ICE NODE",
      "E  DIVE",
      0x29e7ff,
    );
    this.contractMarker = this.add.graphics().setDepth(4);
    this.createAgents();
    this.minions = this.physics.add.group();
    this.physics.add.collider(this.minions, this.wallLayer);
    this.pickups = this.physics.add.group();
    this.physics.add.overlap(this.player, this.pickups, (_p, pk) =>
      this.collectPickup(pk as Pickup),
    );
    this.createDecor();
    this.createLighting();
    this.createAtmosphere();
    this.setupCamera();
    this.setupPostFX();
    this.setupInput();
    this.setupUi();

    const onLoadoutChange = () => {
      this.recomputeStats();
      this.autosave(true);
    };
    this.skillPanel = new SkillPanel(this, this.classDef, this.progression, onLoadoutChange);
    this.inventoryPanel = new InventoryPanel(this, this.inventory, onLoadoutChange);
    this.contractPanel = new ContractPanel(
      this,
      this.contracts,
      (c) => this.acceptContract(c),
      () => this.autosave(true),
    );
    this.vendorPanel = new VendorPanel(this, this.vendor, this.progression, this.inventory, onLoadoutChange);
    this.cityMapPanel = new CityMapPanel(this, this.city, (i) => this.travelTo(i));
    this.journalPanel = new JournalPanel(this, this.memory, this.quests);
    this.optionsPanel = new OptionsPanel(this, () => this.synth.applyVolumes());
    this.statsPanel = new StatsPanel(this, () => this.statLines());
    this.recomputeStats();
    this.maybeSpawnBoss();
    this.worldEvents = new WorldEvents(this);
    this.worldEvents.reset(this.time.now);
    this.autosave(true); // persist the (possibly fresh) run immediately

    // Fade in on arrival (fresh boot or district travel).
    this.cameras.main.fadeIn(450, 4, 2, 10);

    // Apply dive payouts when control returns from a launched DiveScene.
    const onResume = () => this.onDiveReturn();
    this.events.on("resume", onResume);

    // Persist on tab close / hide.
    const flush = () => this.autosave(true);
    window.addEventListener("beforeunload", flush);
    this.events.once("shutdown", () => {
      window.removeEventListener("beforeunload", flush);
      this.events.off("resume", onResume);
    });
  }

  /** Resolve skill + gear mods into effective player stats. */
  private recomputeStats() {
    this.mods = addMods(this.progression.mods(), this.inventory.mods());
    this.player.setMaxHp(this.classDef.maxHp + this.mods.hpAdd);
    this.player.setMaxShield(this.mods.shieldAdd);
    this.player.bonusSpeedMult = 1 + this.mods.movePct;
  }

  /** Effective derived stats for the character sheet (StatsPanel). */
  private statLines(): StatLine[] {
    const m = this.mods;
    const pos = (v: number) => `+${Math.round(v * 100)}%`;
    const neg = (v: number) => `-${Math.round(v * 100)}%`;
    const el = this.classDef.element ? this.classDef.element.toUpperCase() : "PHYSICAL";
    const elColor =
      this.classDef.element === "burn"
        ? "#ff7a3c"
        : this.classDef.element === "chill"
          ? "#6ad6ff"
          : this.classDef.element === "shock"
            ? "#f7ff3c"
            : "#9aa3b2";
    return [
      { label: "CLASS", value: this.classDef.name, color: this.classDef.hex },
      { label: "LEVEL", value: String(this.progression.level) },
      { label: "MAX HP", value: String(Math.round(this.player.maxHp)), color: "#39ff88" },
      { label: "MAX SHIELD", value: String(Math.round(this.player.maxShield)), color: "#6ab0ff" },
      { label: "DAMAGE", value: pos(m.dmgPct) },
      { label: "CRIT CHANCE", value: pos(m.critPct), color: "#f7ff3c" },
      { label: "LIFESTEAL", value: pos(m.lifestealPct), color: "#ff79c6" },
      { label: "MOVE SPEED", value: pos(m.movePct) },
      { label: "ABILITY COOLDOWN", value: neg(m.cdReducePct) },
      { label: "INFECTION", value: pos(m.infectPct) },
      { label: "HACK / SHIELD-BREAK", value: pos(m.hackPct) },
      { label: "HEAT GAIN", value: pos(m.heatGainPct) },
      { label: "HEAT DECAY", value: neg(m.heatDecayPct) },
      { label: "ELEMENT", value: el, color: elColor },
    ];
  }

  private autosave(force = false) {
    const now = this.time.now;
    if (!force && now < this.nextAutosaveAt) return;
    this.nextAutosaveAt = now + 4000;
    writeSave({
      v: 1,
      progress: this.progression.toData(),
      city: this.city.toData(),
      memory: this.memory.toData(),
      quests: this.quests.toData(),
      inventory: this.inventory.toData(),
      contracts: this.contracts.toData(),
      customization: this.customization,
    });
  }

  private collectPickup(pk: Pickup) {
    if (!pk.active) return;
    if (this.inventory.add(pk.item)) {
      this.floatText(pk.item.name, "#39ff88");
      this.pops.pop(pk.x, pk.y - 10, "+ " + pk.item.name, "#39ff88", 12, 32);
      this.synth.pickup();
      this.autosave(true);
    } else {
      this.floatText("INVENTORY FULL", "#ff3b6b");
      return; // leave it on the ground
    }
    pk.destroy();
  }

  /** Rarity-weighted loot drop from a killed cop (Purge Units drop better). */
  private maybeDropLoot(cop: TuringCop) {
    const tier = cop.tier;
    const chance = tier.id === "purge" ? 0.7 : tier.id === "enforcer" ? 0.28 : 0.12;
    if (Math.random() > chance) return;
    const boost = (tier.id === "purge" ? 2 : tier.id === "enforcer" ? 0.6 : 0) + this.city.cycle * 0.3;
    const item = rollItem(this.progression.level, boost);
    this.pickups.add(new Pickup(this, cop.x, cop.y, item));
  }

  // ---- contracts ----

  private acceptContract(c: Contract) {
    for (const o of c.objectives) {
      if (o.type === "hold" || o.type === "deliver") {
        o.zone = this.pickZone(o.type === "hold" ? 72 : 40);
      }
    }
    this.contracts.accept(c);
    this.contractPanel.close();
    this.autosave(true);
    if (c.authored && c.briefing) {
      this.dialogue.show(
        c.briefing.map((text) => ({
          speaker: "FIXER",
          portrait: { key: PORTRAIT_NPC_KEY, frame: 0 },
          text,
        })),
      );
    } else {
      this.floatText("CONTRACT ACCEPTED", this.classDef.hex);
    }
  }

  private completeContract() {
    const c = this.contracts.completeActive();
    if (!c) return;
    this.progression.addXp(c.rewards.xp);
    this.progression.addCurrency(c.rewards.currency);
    for (let i = 0; i < c.rewards.loot; i++) {
      const item = rollItem(this.progression.level, c.rewards.lootBoost);
      if (!this.inventory.add(item)) {
        this.pickups.add(new Pickup(this, this.player.x, this.player.y, item));
      }
    }
    this.recomputeStats();
    this.floatText("CONTRACT COMPLETE", "#39ff88");
    this.synth.infect();
    this.contracts.refresh(this.progression.level);
    this.autosave(true);
  }

  /** A walkable point in a ring around the player (for hold/deliver objectives). */
  private pickZone(r: number): { x: number; y: number; r: number } {
    for (let tries = 0; tries < 24; tries++) {
      const a = Math.random() * Math.PI * 2;
      const rad = 150 + Math.random() * 160;
      const x = Phaser.Math.Clamp(this.player.x + Math.cos(a) * rad, TILE * 2, WORLD_W - TILE * 2);
      const y = Phaser.Math.Clamp(this.player.y + Math.sin(a) * rad, TILE * 2, WORLD_H - TILE * 2);
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      if (this.grid[ty]?.[tx] !== undefined && !isWall(this.grid[ty][tx])) return { x, y, r };
    }
    return { x: this.player.x, y: this.player.y, r };
  }

  private grantKillRewards(tierXp: number, tierCredits: number) {
    this.progression.addCurrency(tierCredits);
    const gained = this.progression.addXp(tierXp);
    if (gained > 0) {
      this.recomputeStats();
      this.floatText(`LEVEL ${this.progression.level}`, "#f7ff3c");
      this.synth.levelUp();
      this.spark(this.player.x, this.player.y, 0xf7ff3c, 4);
    }
  }

  /** Crossing up a Heat tier — pop + swell + brief accent flash. */
  private onHeatTierUp(tier: number) {
    const label = tier >= 4 ? "OVERDRIVE READY" : tier >= 2 ? "OVERCLOCK" : "HEAT RISING";
    this.pops.pop(this.player.x, this.player.y - 26, `▲ ${label}`, "#f7ff3c", tier >= 2 ? 16 : 13, 34);
    this.synth.tierUp(tier);
    if (tier >= 2) juiceFlash(this, 160, 60, 40, 0);
  }

  private createNpc() {
    // The FIXER (contact + quest giver) sits a couple of tiles off the player's
    // insertion point, so they meet it on entering any district.
    const [sx, sy] = this.district.spawnTile;
    let tx = sx;
    let ty = sy;
    const offsets: Array<[number, number]> = [
      [2, 0], [-2, 0], [0, -2], [0, 2], [3, 0], [-3, 0], [2, 2], [-2, 2],
    ];
    for (const [dx, dy] of offsets) {
      const nx = sx + dx;
      const ny = sy + dy;
      if (this.grid[ny]?.[nx] !== undefined && !isWall(this.grid[ny][nx])) {
        tx = nx;
        ty = ny;
        break;
      }
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
      const wx = tx * TILE + TILE / 2;
      this.add
        .image(wx, ty * TILE + TILE, STREETLIGHT_KEY)
        .setOrigin(0.5, 1)
        .setDepth(6)
        .setTint(this.district.accent);
      // a warm ground pool cast by the lamp (sits on the floor, under the actors)
      this.addLightPool(wx, ty * TILE + TILE - 10, this.district.accent, 2.6, 0.34);
    }
  }

  /** Add one additive light pool on the floor (depth 2: above the ambient shadow,
   *  below the actors at 6+). `scale` multiplies the 64px glow texture. */
  private addLightPool(x: number, y: number, color: number, scale: number, alpha: number) {
    return this.add
      .image(x, y, GLOW_KEY)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(color)
      .setScale(scale)
      .setAlpha(alpha)
      .setDepth(2);
  }

  /**
   * Neon-noir lighting. A soft ambient shadow is laid over the streets + buildings
   * (depth 1 — below every actor at depth 6+, so characters/enemies stay fully
   * readable), then additive light pools (depth 2) are cast on the floor by the
   * player, the infection nodes, the terminals, the dive gate and the spawn. The
   * world reads as pools of neon in the dark instead of a flatly-lit grid; the
   * post-FX bloom then spreads each pool. Static (no flashing) — safe with reduce-
   * flashing. The player's pool follows + brightens with Heat in updateLighting().
   */
  private createLighting() {
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x05060f, 0.5)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(1);

    this.nodeLights = this.territory.nodes.map((n) =>
      this.addLightPool(n.x, n.y, n.infected ? COLORS.nodeInfected : COLORS.node, 2.3, 0.5),
    );
    this.addLightPool(this.terminal.x, this.terminal.y, 0x29e7ff, 1.9, 0.4);
    this.addLightPool(this.vendorTerminal.x, this.vendorTerminal.y, 0xf7ff3c, 1.9, 0.4);
    this.addLightPool(this.diveTerminal.x, this.diveTerminal.y, 0x29e7ff, 1.9, 0.42);
    this.addLightPool(this.spawn.x, this.spawn.y, this.district.accent, 2.8, 0.28);
    this.playerLight = this.addLightPool(
      this.player.x,
      this.player.y,
      this.playerColor,
      2.1,
      0.5,
    );
  }

  /** District weather + drifting fog + holographic rooftop signage. */
  private createAtmosphere() {
    this.atmosphere = new Atmosphere(this, {
      weather: this.district.weather,
      accent: this.district.accent,
      worldW: WORLD_W,
      worldH: WORLD_H,
    });
    // Float a holo-sign over a selection of building roofs (every other building).
    const bld = this.district.layout.buildings;
    for (let i = 0; i < bld.length; i += 2) {
      const b = bld[i];
      const cx = ((b.x1 + b.x2) / 2) * TILE + TILE / 2;
      const cy = ((b.y1 + b.y2) / 2) * TILE + TILE / 2;
      this.atmosphere.addHologram(cx, cy, this.district.accent);
    }
  }

  /** Per-frame: the hero's pool follows + swells with Heat; node pools recolor. */
  private updateLighting() {
    if (this.playerLight) {
      const h = this.heat.normalized;
      this.playerLight
        .setPosition(this.player.x, this.player.y)
        .setAlpha(0.45 + h * 0.35)
        .setScale(2.0 + h * 0.7);
    }
    const nodes = this.territory.nodes;
    for (let i = 0; i < this.nodeLights.length; i++) {
      const n = nodes[i];
      const L = this.nodeLights[i];
      if (n && L) L.setTint(n.infected ? COLORS.nodeInfected : COLORS.node);
    }
  }

  private setupUi() {
    this.hud = new Hud(this);
    this.pops = new Pops(this);
    this.particles = new Particles(this);
    this.bossBar = new BossBar(this);
    // Bottom-center ticker — clear of the HUD panel + boss bar.
    this.eventBanner = this.add
      .text(this.scale.width / 2, this.scale.height - 14, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "13px",
        color: "#8a5cff",
        fontStyle: "bold",
        align: "center",
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(1002)
      .setVisible(false);
    this.dialogue = new DialogueBox(this);
    // Intro on the first district of a fresh cycle; a warning at the HSS core.
    if (this.districtIndex === 0 && this.city.cycle === 0 && !this.city.isCleared(this.district.id)) {
      this.dialogue.show(this.introPages());
    } else if (this.district.isFinal && !this.city.isCleared(this.district.id)) {
      this.dialogue.show(this.finalApproachPages());
    }
  }

  private createTerritory() {
    // The district's infection graph (nodes carved walkable by the builder).
    this.territory = new Territory(this, this.district.nodes, (i) => this.onNodeInfected(i));
    // Revisiting a district we already secured: show it conquered — held nodes, no
    // boss, no re-banking, no purge (it's ours).
    if (this.city.isCleared(this.district.id)) {
      this.territory.restoreAllInfected();
      this.districtSecured = true;
    }
  }

  private setupPostFX() {
    if (this.renderer.type !== Phaser.WEBGL) return;
    const cam = this.cameras.main;
    cam.setPostPipeline("Neon");
    const p = cam.getPostPipeline("Neon");
    this.neon = (Array.isArray(p) ? p[0] : p) as NeonPipeline;
    // Bias the post-FX toward the district accent so each district reads distinct.
    const a = this.district.accent;
    this.neon.tint = [((a >> 16) & 0xff) / 255, ((a >> 8) & 0xff) / 255, (a & 0xff) / 255];
    this.neon.tintAmt = 0.22;
  }

  private buildDistrict() {
    this.grid = buildGrid(this.district);
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
    this.spawn = spawnPoint(this.grid, this.district);
  }

  private spawnPlayer() {
    this.player = new Player(this, this.spawn.x, this.spawn.y, this.classDef, {
      textureKey: PLAYER_CUSTOM_KEY,
      color: 0xffffff, // the custom sprite is baked in final colours; render it untinted
    });
    this.physics.add.collider(this.player, this.wallLayer);
    // Overclock aura — glows behind the player as Heat climbs (set each frame).
    this.playerAura = this.add
      .image(this.spawn.x, this.spawn.y, GLOW_KEY)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(this.playerColor)
      .setDepth(9)
      .setVisible(false);
  }

  private setupProjectiles() {
    // The player projectile pool is configured from the chosen class primary.
    const prim = this.classDef.primary;
    if (prim.kind === "beam") {
      this.bullets = new Bullets(this, { tint: this.playerColor }); // unused by beam
    } else {
      this.bullets = new Bullets(this, {
        speed: prim.speed,
        lifetimeMs: prim.lifetimeMs,
        radius: BULLET.radius,
        maxActive: 96,
        tint: this.playerColor,
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
    // Garrison posts come from the district def.
    for (const [tx, ty, tier] of this.district.copPosts) {
      if (this.grid[ty]?.[tx] === undefined || isWall(this.grid[ty][tx])) continue;
      this.spawnEnemy(tier, tx * TILE + TILE / 2, ty * TILE + TILE / 2);
    }
  }

  private spawnEnemy(tierId: string, x: number, y: number, bark = false) {
    const cop = new TuringCop(this, x, y, ENEMY_TIERS[tierId]);
    if (this.cycleMult > 1) cop.scaleHp(this.cycleMult);
    this.enemies.add(cop);
    if (bark) this.maybeBark(tierId, x, y);
  }

  /** Occasional system-voiced deploy bark above a reinforcement (throttled, not every
   *  spawn) — gives the new archetypes a bit of menace as they engage. */
  private maybeBark(tierId: string, x: number, y: number) {
    const now = this.time.now;
    if (now < this.nextBarkAt || Math.random() > 0.5) return;
    const pool = ENEMY_BARKS[tierId];
    if (!pool?.length) return;
    this.nextBarkAt = now + 1600;
    const tint = ENEMY_TIERS[tierId].tint ?? COLORS.enemy;
    const hex = "#" + (tint & 0xffffff).toString(16).padStart(6, "0");
    this.pops.pop(x, y - 22, pool[Math.floor(Math.random() * pool.length)], hex, 11, 42);
  }

  /** Heat-scaled spawn pressure: faster + tougher tiers as the map heats up. */
  private spawnPressure(now: number) {
    if (this.boss && !this.boss.isDead) return; // boss fight: no ambient reinforcements
    if (now < this.nextSpawnAt) return;
    const heat = this.heat.value;
    const interval = Phaser.Math.Linear(
      SPAWN.baseIntervalMs,
      SPAWN.minIntervalMs,
      this.heat.normalized,
    );
    this.nextSpawnAt = now + interval;
    if (this.enemies.countActive(true) >= SPAWN.maxEnemies) return;

    // Escalating archetype mix: harassers + marksmen at low/mid heat, heavies +
    // chargers + a rare medic as the district heats up (partitions one roll).
    let tier = "patrol";
    const r = Math.random();
    const active = this.enemies.countActive(true);
    if (heat >= 55 && active >= 3 && r < 0.06) tier = "mender";
    else if (heat >= SPAWN.purgeHeat && r < 0.17) tier = "purge";
    else if (heat >= 45 && r < 0.31) tier = "hound";
    else if (heat >= 35 && r < 0.47) tier = "lancer";
    else if (heat >= SPAWN.enforcerHeat && r < 0.63) tier = "enforcer";
    else if (r < 0.82) tier = "wasp";

    // Spawn in a ring around the player (focuses pressure), clamped to the world.
    const a = Math.random() * Math.PI * 2;
    const rad = Phaser.Math.Between(SPAWN.ringMin, SPAWN.ringMax);
    const x = Phaser.Math.Clamp(
      this.player.x + Math.cos(a) * rad,
      TILE * 1.5,
      WORLD_W - TILE * 1.5,
    );
    const y = Phaser.Math.Clamp(
      this.player.y + Math.sin(a) * rad,
      TILE * 1.5,
      WORLD_H - TILE * 1.5,
    );
    this.spawnEnemy(tier, x, y, true); // reinforcement — may bark
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
    this.skillKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.K);
    this.invKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.I);
    this.mapKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    this.journalKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.J);
    this.optionsKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.O);
    this.statsKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    this.consumeKeys = [
      kb.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      kb.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      kb.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
    ];
    kb.on("keydown-ESC", () => {
      this.skillPanel?.close();
      this.inventoryPanel?.close();
      this.contractPanel?.close();
      this.vendorPanel?.close();
      this.cityMapPanel?.close();
      this.journalPanel?.close();
      this.optionsPanel?.close();
      this.statsPanel?.close();
    });
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
        text: "Burn the Turing cops. Infect the district node, then reach the extraction gate. Take every district and the Human Security System melts down.",
      },
      {
        speaker: "// SYSTEM",
        portrait: me,
        text: "WASD move · MOUSE aim · CLICK fire · SPACE dash · E talk · K skills · C character · M map · J journal. Heat fuels you — and lights the sky.",
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

  private finalApproachPages(): DialoguePage[] {
    const me = { key: PORTRAIT_PLAYER_KEY };
    return [
      {
        speaker: "// SYSTEM",
        portrait: me,
        text: "You're inside the spine. Every Turing cop in the city routes through the kernel ahead.",
      },
      {
        speaker: "// SYSTEM",
        portrait: me,
        text: "WINTERMUTE sees you now. Kill the OVERMIND and the Human Security System has no floor left to stand on.",
      },
    ];
  }

  // --- combat modifiers: Overdrive overrides Heat tiers while active ---
  private get inOverdrive(): boolean {
    return this.overdriveActive;
  }
  private get dmgMult(): number {
    const base = this.inOverdrive ? OVERDRIVE.damageMult : this.heat.damageMult;
    return base * (1 + this.mods.dmgPct);
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
      contagion: this.city.contagion,
      contagionNorm: this.city.normalized,
      classColor: this.playerColor,
      callsign: this.customization.callsign,
      abilityName: this.classDef.ability.name,
      abilityReady: now >= this.player.nextAbilityAt,
      ultName: this.classDef.ultimate.name,
      ultReady: this.heat.canUlt && now >= this.player.nextUltAt,
      overdriveReady: this.heat.canOverdrive,
      overdriveActive: this.inOverdrive,
      level: this.progression.level,
      xpNorm: this.progression.atCap ? 1 : this.progression.xp / this.progression.nextLevelXp,
      credits: this.progression.currency,
      skillPoints: this.progression.skillPoints,
      shield: this.player.shield,
      shieldMax: this.player.maxShield,
      contract: this.contracts.active
        ? `${this.contracts.active.name}: ${objectiveLabel(this.contracts.active.objectives[0])}`
        : "",
      quest: this.quests.active
        ? `${this.quests.active.name}: ${this.quests.currentStage?.objective ?? ""}`
        : "",
      consumables: CONSUMABLE_KEYS.map(
        (id, i) => `${i + 1}:${id.slice(0, 3).toUpperCase()}x${this.progression.consumables[id] ?? 0}`,
      ).join("  "),
    });
  }

  update(_time: number, delta: number) {
    if (this.won) return; // meltdown sequence runs on tweens/timers; freeze the sim
    if (this.traveling) return; // district transition in flight
    if (this.hitStopActive) return; // brief impact freeze

    const now = this.time.now;

    // OVERDRIVE lifecycle.
    if (this.overdriveActive && now >= this.overdriveUntil) this.endOverdrive();

    if (Phaser.Input.Keyboard.JustDown(this.skillKey)) {
      this.inventoryPanel.close();
      this.cityMapPanel.close();
      this.skillPanel.toggle();
    }
    if (Phaser.Input.Keyboard.JustDown(this.invKey)) {
      this.skillPanel.close();
      this.cityMapPanel.close();
      this.inventoryPanel.toggle();
    }
    if (Phaser.Input.Keyboard.JustDown(this.mapKey)) {
      this.skillPanel.close();
      this.inventoryPanel.close();
      this.journalPanel.close();
      this.cityMapPanel.toggle();
    }
    if (Phaser.Input.Keyboard.JustDown(this.journalKey)) {
      this.skillPanel.close();
      this.inventoryPanel.close();
      this.cityMapPanel.close();
      this.journalPanel.toggle();
    }
    if (Phaser.Input.Keyboard.JustDown(this.optionsKey)) {
      this.skillPanel.close();
      this.inventoryPanel.close();
      this.cityMapPanel.close();
      this.journalPanel.close();
      this.statsPanel.close();
      this.optionsPanel.toggle();
    }
    if (Phaser.Input.Keyboard.JustDown(this.statsKey)) {
      this.skillPanel.close();
      this.inventoryPanel.close();
      this.cityMapPanel.close();
      this.journalPanel.close();
      this.optionsPanel.close();
      this.statsPanel.toggle();
    }

    this.updateHud();
    this.atmosphere.update(now, delta, this.heat.normalized); // weather/fog/holos animate always
    this.autosave();
    this.synth.setDialogueDuck(this.dialogue.isOpen); // duck music under dialogue
    if (
      this.skillPanel.isOpen ||
      this.inventoryPanel.isOpen ||
      this.contractPanel.isOpen ||
      this.vendorPanel.isOpen ||
      this.cityMapPanel.isOpen ||
      this.journalPanel.isOpen ||
      this.optionsPanel.isOpen ||
      this.statsPanel.isOpen
    )
      return; // menu open: freeze sim
    if (this.dialogue.isOpen) return; // freeze the sim while a dialogue is up

    this.handleConsumables(now);

    // HEAT: pinned during Overdrive, else decay. Drives post-FX + music.
    if (this.inOverdrive) {
      this.heat.value = HEAT.max;
      if (this.neon) this.neon.heat = 1;
      this.synth.setIntensity(1);
    } else {
      this.heat.update(now, delta, 1 - this.mods.heatDecayPct);
      // The world destabilizes as the city-wide Singularity climbs toward meltdown,
      // not just with the player's Heat — the closer to 100%, the hotter the screen.
      const sing = this.city.normalized;
      const intensity = Math.max(this.heat.normalized, sing * 0.7);
      if (this.neon) {
        this.neon.heat = intensity;
        this.neon.glitch = sing > 0.82 ? ((sing - 0.82) / 0.18) * 0.3 : 0;
      }
      // Music swells with Heat, the city-wide Singularity, AND live combat.
      this.combatHeat = Math.max(0, this.combatHeat - delta / 2600);
      this.synth.setIntensity(Math.max(this.heat.normalized, this.combatHeat, sing * 0.5));
    }
    // Crossing UP a Heat tier = powering up: pop + swell + flash.
    const tier = this.heat.tier;
    if (tier > this.prevHeatTier) this.onHeatTierUp(tier);
    this.prevHeatTier = tier;

    // Overclock aura: a pulsing class-colored glow behind the player, growing with Heat.
    if (this.playerAura) {
      const hn = this.heat.normalized;
      if (hn > 0.22) {
        const pulse = 0.78 + 0.22 * Math.sin(now * 0.013);
        this.playerAura
          .setVisible(true)
          .setPosition(this.player.x, this.player.y)
          .setAlpha(hn * 0.55 * pulse)
          .setScale((0.55 + hn * 0.5) * pulse);
      } else {
        this.playerAura.setVisible(false);
      }
    }

    this.player.speedMult = this.spdMult;
    this.player.tickShield(now, delta);

    const input = this.readInput();
    const willDash = input.dash && this.player.dashReady;
    this.player.step(input);
    if (willDash) this.synth.dash();

    const angle = this.player.tryFire(input);
    if (angle !== null) this.fireWeapon(angle);

    this.handleAbilities(now);

    this.bullets.update(now);
    this.enemyBullets.update(now);

    this.enemies.getChildren().forEach((go) => {
      const cop = go as TuringCop;
      if (cop.active && !cop.isDead) cop.step(this.player, this);
    });
    this.spawnPressure(now);
    this.updateStatuses(now);
    if (this.boss && !this.boss.isDead) {
      this.bossBar.update(this.boss.hp / this.boss.maxHp);
      const bdef = this.boss.def;
      if (this.boss.enraged && !this.bossEnrageBarked) {
        this.bossEnrageBarked = true;
        this.bossBark(bdef.enrageBark, bdef, true);
      } else if (now >= this.nextBossBarkAt && bdef.barks.length) {
        this.nextBossBarkAt = now + 5200;
        this.bossBark(bdef.barks[Math.floor(Math.random() * bdef.barks.length)], bdef, false);
      }
    }

    // DYNAMIC WORLD EVENTS — paused during boss fights so the duel stays the focus.
    if (this.boss && !this.boss.isDead) {
      this.eventBanner.setVisible(false);
    } else {
      this.worldEvents.update(now, delta);
      this.updateEventBanner(now);
    }

    this.agents.getChildren().forEach((go) => (go as Agent).step(now));

    const cops = this.enemies.getChildren() as TuringCop[];
    this.minions.getChildren().forEach((go) =>
      (go as Minion).step(now, cops, (cop, dmg) => this.damageCop(cop, dmg, false)),
    );

    // TERRITORY: channel nodes by proximity; infected nodes spread contagion to
    // their neighbours. Holding every node secures the district and lights the gate.
    this.territory.update(this.player, delta * (1 + this.mods.infectPct));
    this.updateLighting();
    if (this.territory.secured && !this.districtSecured) {
      this.districtSecured = true;
      this.onDistrictSecured();
    }

    // HSS push-back: re-secure a frontier node while the district is contested
    // (not yet secured, no active boss). Faster as Heat climbs.
    if (!this.districtSecured && !(this.boss && !this.boss.isDead)) {
      const purged = this.territory.tryPurge(now, this.heat.normalized, this.player);
      if (purged >= 0) {
        this.synth.hit();
        juiceShake(this, 120, 0.004);
        this.floatText("⚠ HSS RE-SECURED A NODE", "#ff3b6b");
      }
    }

    // SINGULARITY: holding a connected cluster ticks the save-wide meter; once it
    // completes (only possible after the whole city is secured) → meltdown.
    const cluster = this.territory.clusterSize;
    if (cluster > 0) this.city.addSingularity(cluster * SINGULARITY.clusterPerSec * (delta / 1000));
    if (this.city.isComplete) {
      this.triggerMeltdown();
      return;
    }

    // EXTRACTION: once the gate is lit, walking into it advances the campaign.
    if (this.gate) {
      this.gate.update(delta);
      if (this.gate.contains(this.player.x, this.player.y)) {
        this.extract();
        return;
      }
    }

    // CONTRACTS: advance hold/deliver objectives, draw the marker, complete.
    this.contracts.tick(this.player.x, this.player.y, delta);
    this.drawContractMarker();
    if (this.contracts.isComplete) this.completeContract();

    // Interactions (E): contract board / vendor / NPC by proximity.
    const dist = (x: number, y: number) =>
      Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y);
    const nearTerminal = this.terminal.update(dist(this.terminal.x, this.terminal.y));
    const nearVendor = this.vendorTerminal.update(dist(this.vendorTerminal.x, this.vendorTerminal.y));
    const nearDive = this.diveTerminal.update(dist(this.diveTerminal.x, this.diveTerminal.y));
    const nearNpc = this.npc.update(dist(this.npc.x, this.npc.y));
    if (Phaser.Input.Keyboard.JustDown(this.eKey)) {
      this.skillPanel.close();
      this.inventoryPanel.close();
      if (nearTerminal) {
        this.vendorPanel.close();
        this.contractPanel.toggle();
      } else if (nearVendor) {
        this.contractPanel.close();
        this.vendorPanel.toggle();
      } else if (nearDive) {
        this.enterDive();
      } else if (nearNpc) {
        this.talkToNpc();
      }
    }
  }

  // ---- quests + branching dialogue (the FIXER is the giver) ----

  /** Route an NPC conversation: offer / advance the active quest, or small talk. */
  private talkToNpc() {
    const q = this.quests;
    const offer = q.nextOffer();
    if (q.isTalkStage()) {
      this.runDialogueTree(q.currentStage!.talkTree!);
    } else if (q.active) {
      const s = q.currentStage!;
      this.dialogue.show([
        {
          speaker: "FIXER",
          portrait: { key: PORTRAIT_NPC_KEY, frame: 0 },
          text: `The signal's still buried. ${s.objective} — then come back.`,
        },
      ]);
    } else if (offer) {
      this.runDialogueTree(offer.offerTree);
    } else {
      this.dialogue.show(this.npcPages());
    }
  }

  /** Walk a dialogue tree through the DialogueBox; choices fire quest actions. */
  private runDialogueTree(treeId: string) {
    const tree = DIALOGUE_TREES[treeId];
    if (tree) this.runDialogueNode(tree, tree.start);
  }

  private runDialogueNode(tree: (typeof DIALOGUE_TREES)[string], nodeId: string) {
    const node = tree.nodes[nodeId];
    if (!node) return;
    const portrait =
      node.portrait === "player"
        ? { key: PORTRAIT_PLAYER_KEY }
        : { key: PORTRAIT_NPC_KEY, frame: 0 };
    const pages: DialoguePage[] = node.lines.map((text, i) => ({
      speaker: node.speaker,
      portrait,
      text,
      choices:
        i === node.lines.length - 1 && node.choices ? node.choices.map((c) => c.text) : undefined,
    }));
    const hasChoices = !!node.choices?.length;
    this.dialogue.show(
      pages,
      () => {
        // Reached the end with no choice picked. A flag-conditional `branch` (set by an
        // earlier act) wins over the default chain, so the finale remembers your choice.
        if (hasChoices) return;
        const b = node.branch?.find((x) => this.quests.hasFlag(x.flag));
        if (b) this.runDialogueNode(tree, b.goto);
        else if (node.then) this.runDialogueNode(tree, node.then);
        else if (node.action) this.onQuestAction(node.action);
      },
      hasChoices
        ? (i) => {
            const c = node.choices![i];
            if (c.action) this.onQuestAction(c.action);
            if (c.goto) this.runDialogueNode(tree, c.goto);
          }
        : undefined,
    );
  }

  private onQuestAction(action: string) {
    if (action === "accept") {
      const offer = this.quests.nextOffer();
      if (!offer) return;
      this.quests.accept(offer.id);
      this.journalPanel.refresh();
      this.floatText(`CONTRACT: ${offer.name}`, this.classDef.hex);
      const s = this.quests.currentStage;
      if (s) this.floatText(`OBJECTIVE: ${s.objective}`, this.classDef.hex);
      this.autosave(true);
    } else if (action === "complete" || action.startsWith("complete:")) {
      // "complete:<flag>" records a persistent story choice (e.g. sparing the FIXER)
      // before banking the quest, so a later act can branch on it.
      const choiceFlag = action.includes(":") ? action.slice(action.indexOf(":") + 1) : null;
      if (choiceFlag) this.quests.flags.add(choiceFlag);
      const q = this.quests.completeActive();
      if (!q) return;
      this.progression.addCurrency(q.reward.currency);
      this.progression.addXp(q.reward.xp);
      for (let i = 0; i < q.reward.loot; i++) {
        const item = rollItem(this.progression.level, q.reward.lootBoost);
        if (!this.inventory.add(item)) {
          this.pickups.add(new Pickup(this, this.player.x, this.player.y, item));
        }
      }
      this.recomputeStats();
      this.journalPanel.refresh();
      juiceFlash(this, 360, 60, 0, 90);
      this.floatText(`${q.name} — COMPLETE`, "#8a5cff");
      this.autosave(true);
    }
  }

  /** Fire a gameplay quest trigger; on stage advance, surface the new objective. */
  private fireQuestTrigger(type: "infect" | "dive" | "kill" | "secure") {
    if (this.quests.onTrigger(type) !== "advanced") return;
    this.journalPanel.refresh();
    const s = this.quests.currentStage;
    if (!s) return;
    if (s.onEnterLine && !this.dialogue.isOpen) {
      this.dialogue.show([
        { speaker: "// SYSTEM", portrait: { key: PORTRAIT_PLAYER_KEY }, text: s.onEnterLine },
      ]);
    }
    this.floatText(`OBJECTIVE: ${s.objective}`, this.classDef.hex);
    this.autosave(true);
  }

  // ---- ICE dives (instanced runs launched over this paused scene) ----

  /** Launch an instanced dive; carries the next un-recovered fragment to its core. */
  private enterDive() {
    const dive = generateDive(this.progression.level, this.district.threat);
    // On a main-quest dive stage the core carries that stage's story fragment;
    // otherwise it surfaces the next un-recovered fragment (free worldbuilding).
    const stageFrag = this.quests.currentStage?.fragmentId;
    if (stageFrag && !this.memory.has(stageFrag)) {
      dive.fragmentId = stageFrag;
    } else {
      const nextFrag = FRAGMENTS.find((f) => !this.memory.has(f.id));
      if (nextFrag) dive.fragmentId = nextFrag.id;
    }
    this.autosave(true);
    this.scene.pause();
    this.scene.launch("Dive", {
      classId: this.classDef.id,
      level: this.progression.level,
      dive,
      cycleMult: this.cycleMult,
      color: this.playerColor,
    });
  }

  /** Back from a dive (scene resumed): apply the payout + any recovered fragment. */
  private onDiveReturn() {
    const res = this.registry.get("diveResult") as DiveResult | undefined;
    this.registry.remove("diveResult");
    if (!res || !res.success) return;
    this.progression.addCurrency(res.reward.currency);
    const gained = this.progression.addXp(res.reward.xp);
    for (let i = 0; i < res.reward.loot; i++) {
      const item = rollItem(this.progression.level, res.reward.lootBoost);
      if (!this.inventory.add(item)) {
        this.pickups.add(new Pickup(this, this.player.x, this.player.y, item));
      }
    }
    this.recomputeStats();
    if (gained > 0) this.floatText(`LEVEL ${this.progression.level}`, "#f7ff3c");
    if (res.fragmentId) this.recoverFragment(res.fragmentId);
    else this.floatText("DIVE COMPLETE", "#29e7ff");
    this.fireQuestTrigger("dive");
    this.autosave(true);
  }

  private handleConsumables(now: number) {
    void now;
    for (let i = 0; i < this.consumeKeys.length; i++) {
      if (Phaser.Input.Keyboard.JustDown(this.consumeKeys[i])) this.useConsumable(i);
    }
  }

  private useConsumable(index: number) {
    const id = CONSUMABLE_KEYS[index];
    if (!this.progression.useConsumable(id)) return;
    if (id === "repair") this.player.hp = Math.min(this.player.maxHp, this.player.hp + 40);
    else if (id === "shield") this.player.shield = this.player.maxShield;
    else if (id === "heatcharge") this.heat.add(40, this.time.now);
    const def = CONSUMABLES.find((c) => c.id === id)!;
    this.floatText(def.name, def.hex);
    this.synth.infect();
    this.autosave(true);
  }

  private drawContractMarker() {
    const g = this.contractMarker;
    g.clear();
    const o = this.contracts.active?.objectives.find((x) => x.zone);
    if (!o || !o.zone) return;
    const color = o.type === "hold" ? 0x39ff88 : 0xf7ff3c;
    g.lineStyle(2, color, 0.8).strokeCircle(o.zone.x, o.zone.y, o.zone.r);
    g.fillStyle(color, 0.08).fillCircle(o.zone.x, o.zone.y, o.zone.r);
  }

  /** Surface a memory fragment (recovered at a dive core) into the Memory log. */
  recoverFragment(id: string) {
    const frag = getFragment(id);
    if (!frag || !this.memory.recover(id)) return;
    this.journalPanel.refresh();
    this.floatText("MEMORY RECOVERED", "#8a5cff");
    this.synth.infect();
    this.autosave(true);
    this.dialogue.show([
      {
        speaker: "// MEMORY",
        portrait: { key: PORTRAIT_PLAYER_KEY },
        text: `${frag.title} — ${frag.lines.join(" ")}`,
      },
    ]);
  }

  // ---- dynamic world events (WorldEventHost) ----

  heatNorm(): number {
    return this.heat.normalized;
  }
  contagionNorm(): number {
    return this.city.normalized;
  }

  private updateEventBanner(now: number) {
    const tg = this.worldEvents.telegraphing;
    const ac = this.worldEvents.active;
    if (tg) {
      this.eventBanner
        .setText(`⚠ ${tg.name} INCOMING — ${tg.tagline}  (${this.worldEvents.secondsLeft(now)}s)`)
        .setColor(tg.hex)
        .setVisible(true);
    } else if (ac) {
      this.eventBanner
        .setText(`◈ ${ac.name} ACTIVE  (${this.worldEvents.secondsLeft(now)}s)`)
        .setColor(ac.hex)
        .setVisible(true);
    } else {
      this.eventBanner.setVisible(false);
    }
  }

  onEventTelegraph(def: WorldEventDef) {
    this.floatText(`⚠ ${def.name}`, def.hex);
    juiceShake(this, 220, 0.004);
    this.synth.hit();
  }

  onEventStart(def: WorldEventDef) {
    juiceFlash(this, 220, (def.color >> 16) & 0xff, (def.color >> 8) & 0xff, def.color & 0xff);
    switch (def.id) {
      case "neon_storm":
        this.stormStrikeAt = this.time.now; // strikes spawn in onEventTick
        break;
      case "blackout":
        this.startBlackout();
        break;
      case "purge_wave":
        this.eventPurgeWave();
        break;
      case "contagion_outbreak":
        this.territory.setOutbreak(true);
        break;
    }
  }

  onEventTick(def: WorldEventDef, _dtMs: number) {
    if (def.id === "neon_storm" && this.time.now >= this.stormStrikeAt) {
      this.stormStrikeAt = this.time.now + 720;
      this.spawnStormStrike(def.color);
    }
  }

  onEventEnd(def: WorldEventDef) {
    if (def.id === "blackout") this.endBlackout();
    if (def.id === "contagion_outbreak") this.territory.setOutbreak(false);
    this.progression.addCurrency(def.reward.currency);
    const gained = this.progression.addXp(def.reward.xp);
    this.recomputeStats();
    if (gained > 0) this.floatText(`LEVEL ${this.progression.level}`, "#f7ff3c");
    else this.floatText(`${def.name} SURVIVED  +${def.reward.xp} XP`, "#39ff88");
    this.synth.infect();
    this.autosave(true);
  }

  private startBlackout() {
    this.blackoutOverlay?.destroy();
    const o = this.add
      .rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x01030c, 0)
      .setScrollFactor(0)
      .setDepth(920);
    this.tweens.add({ targets: o, alpha: 0.76, duration: 600 });
    this.blackoutOverlay = o;
  }

  private endBlackout() {
    const o = this.blackoutOverlay;
    if (!o) return;
    this.blackoutOverlay = undefined;
    this.tweens.add({ targets: o, alpha: 0, duration: 600, onComplete: () => o.destroy() });
  }

  /** A neon-storm lightning strike: telegraph ring, then a damaging burst. */
  private spawnStormStrike(color: number) {
    const a = Math.random() * Math.PI * 2;
    const rad = 60 + Math.random() * 180;
    const x = Phaser.Math.Clamp(this.player.x + Math.cos(a) * rad, TILE, WORLD_W - TILE);
    const y = Phaser.Math.Clamp(this.player.y + Math.sin(a) * rad, TILE, WORLD_H - TILE);
    const r = 56;
    const ring = this.add
      .circle(x, y, r, color, 0.12)
      .setStrokeStyle(2, color, 0.85)
      .setDepth(5);
    this.tweens.add({ targets: ring, alpha: { from: 0.15, to: 0.5 }, yoyo: true, repeat: 2, duration: 150 });
    this.time.delayedCall(520, () => {
      ring.destroy();
      const b = this.add.circle(x, y, r, color, 0.5).setDepth(6);
      this.tweens.add({ targets: b, alpha: 0, scale: 1.3, duration: 280, onComplete: () => b.destroy() });
      this.spark(x, y, color, 3);
      juiceShake(this, 120, 0.005);
      if (!this.player.invulnerable && Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y) <= r) {
        const died = this.player.applyDamage(15);
        this.onPlayerHurt();
        if (died) this.respawnPlayer();
      }
    });
  }

  /** A System purge wave: HSS reinforcements ring the player, scaled by Heat. */
  private eventPurgeWave() {
    const count = 4 + Math.floor(this.heat.normalized * 4);
    const hot = this.heat.normalized;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const r = 180 + Math.random() * 120;
      const x = Phaser.Math.Clamp(this.player.x + Math.cos(a) * r, TILE * 1.5, WORLD_W - TILE * 1.5);
      const y = Phaser.Math.Clamp(this.player.y + Math.sin(a) * r, TILE * 1.5, WORLD_H - TILE * 1.5);
      const tier = hot >= 0.7 && i % 3 === 0 ? "purge" : hot >= 0.45 && i % 2 === 0 ? "enforcer" : "patrol";
      this.spawnEnemy(tier, x, y, true);
    }
  }

  // ---- district boss: guards the node until defeated ----

  /** Spawn the district's guardian (if any), lock the node, raise the boss bar. */
  private maybeSpawnBoss() {
    if (!this.district.bossId || this.city.isCleared(this.district.id)) return; // already secured
    const def = getBoss(this.district.bossId);
    const hp = Math.round(def.hp * (1 + this.district.threat * 0.4) * this.cycleMult);
    const core = this.territory.nodes[0];
    this.boss = new Boss(this, core.x, core.y, def, hp, (x, y, tier) =>
      this.spawnEnemy(tier, x, y),
    );
    this.enemies.add(this.boss);
    this.territory.setCoreLocked(true); // can't take the core until the guardian falls
    this.bossBar.show(def.name, def.title, def.hex);
    this.floatText("⚠ " + def.name, def.hex);
    juiceShake(this, 380, 0.007);
    juiceFlash(this, 260, (def.tint >> 16) & 0xff, (def.tint >> 8) & 0xff, def.tint & 0xff);
    this.bossEnrageBarked = false;
    this.nextBossBarkAt = this.time.now + 6500; // hold barks until the intro plays out
    this.bossIntro(def);
  }

  /** Staggered, boss-tinted intro callouts on spawn — the guardian announces itself
   *  without freezing the fight. */
  private bossIntro(def: BossDef) {
    const cx = this.scale.width / 2;
    def.intro.forEach((line, i) => {
      this.time.delayedCall(700 + i * 1700, () => {
        if (!this.boss || this.boss.isDead) return;
        const txt = this.add
          .text(cx, 118, line, {
            fontFamily: "Courier New, monospace",
            fontSize: "15px",
            color: def.hex,
            fontStyle: "bold",
            align: "center",
          })
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(1003)
          .setAlpha(0);
        txt.setShadow(0, 0, def.hex, 10, true, true);
        this.tweens.add({ targets: txt, alpha: 1, y: 110, duration: 400 });
        this.tweens.add({ targets: txt, alpha: 0, delay: 1450, duration: 500, onComplete: () => txt.destroy() });
      });
    });
  }

  /** A boss line above its head — emphatic barks (enrage) shake + sting. */
  private bossBark(text: string, def: BossDef, emphatic: boolean) {
    if (!this.boss) return;
    this.pops.pop(this.boss.x, this.boss.y - 26 * def.scale, text, def.hex, emphatic ? 16 : 13, 48);
    if (emphatic) {
      juiceShake(this, 220, 0.005);
      this.synth.hit();
    }
  }

  /** Boss down: pay out big, drop loot. On the final boss this ends the cycle. */
  private onBossDefeated(boss: Boss) {
    this.bossBar.hide();
    this.progression.addCurrency(boss.def.credits);
    const gained = this.progression.addXp(boss.def.xp);
    this.recomputeStats();
    for (let i = 0; i < 2; i++) {
      const item = rollItem(this.progression.level, 1.2 + this.city.cycle * 0.3);
      this.pickups.add(
        new Pickup(
          this,
          boss.x + Phaser.Math.Between(-20, 20),
          boss.y + Phaser.Math.Between(-20, 20),
          item,
        ),
      );
    }
    juiceFlash(this, 320, 40, 120, 60);
    juiceShake(this, 320, 0.01);
    this.boss = undefined;

    // Guardian down → core exposed. On the HSS CORE this is the OVERMIND: take the
    // core to push the Singularity to 100 and melt the city down.
    this.territory.setCoreLocked(false);
    if (gained > 0) this.floatText(`LEVEL ${this.progression.level}`, "#f7ff3c");
    else this.floatText(`${boss.def.name} DOWN — CORE EXPOSED`, "#39ff88");
    this.synth.meltdown();
    this.autosave(true);
  }

  // ---- district lifecycle: capture -> extract -> next district ----

  /** A single node flipped to infected — light feedback + per-node reward. */
  private onNodeInfected(_index: number) {
    this.synth.infect();
    juiceShake(this, 140, 0.004);
    this.grantKillRewards(20, 0); // XP per node taken
    this.city.addSingularity(SINGULARITY.perNode);
    this.contracts.onInfect();
    this.fireQuestTrigger("infect");
    this.floatText(
      `NODE ${this.territory.infectedCount}/${this.territory.total} INFECTED`,
      this.district.accentHex,
    );
    this.autosave(true);
  }

  /** Every node held: district secured — light the extraction gate. */
  private onDistrictSecured() {
    this.synth.infect();
    juiceShake(this, 260, 0.006);
    this.grantKillRewards(60, 0); // securing bonus
    this.city.secure(this.district.id, this.district.contagion); // bank the district's worth
    this.fireQuestTrigger("secure");
    this.gate = new ExtractionGate(this, this.spawn.x, this.spawn.y, this.district.accent);
    this.gate.activate();
    this.floatText("DISTRICT SECURED — EXTRACT", "#39ff88");
    this.autosave(true);
  }

  /** Step through the gate → open the fast-travel hub to choose the next district. */
  private extract() {
    if (this.traveling || this.won || this.cityMapPanel.isOpen) return;
    this.cityMapPanel.show();
  }

  /** Fast-travel to an unlocked district (chosen on the city map). */
  private travelTo(index: number) {
    if (this.traveling || this.won) return;
    if (index === this.city.index || !this.city.isUnlocked(index)) return;
    this.cityMapPanel.close();
    this.traveling = true;
    this.city.index = index;
    this.autosave(true);
    this.districtTransition();
  }

  /** Fade out, announce the destination, then reload the scene into it. */
  private districtTransition() {
    const next = this.city.current; // city.index was set by travelTo()
    this.player.setVelocity(0, 0);
    this.synth.infect();
    juiceShake(this, 280, 0.006);

    const w = this.scale.width;
    const h = this.scale.height;
    const cover = this.add
      .rectangle(w / 2, h / 2, w, h, 0x04020a, 1)
      .setScrollFactor(0)
      .setDepth(3000)
      .setAlpha(0);
    this.tweens.add({ targets: cover, alpha: 1, duration: 480, ease: "Quad.in" });

    const mk = (y: number, text: string, size: string, color: string) =>
      this.add
        .text(w / 2, y, text, {
          fontFamily: "Courier New, monospace",
          fontSize: size,
          color,
          fontStyle: "bold",
          align: "center",
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(3001)
        .setAlpha(0);

    const num = mk(h / 2 - 30, `DISTRICT ${this.city.index + 1} / ${DISTRICTS.length}`, "16px", "#9aa3b2");
    const name = mk(h / 2 + 4, next.name, "40px", next.accentHex);
    const sub = mk(h / 2 + 42, next.subtitle, "13px", "#00e5ff");
    name.setShadow(0, 0, "#00e5ff", 18, true, true);
    this.tweens.add({ targets: [num, name, sub], alpha: 1, duration: 500, delay: 420 });

    this.time.delayedCall(2000, () => {
      this.registry.set("resume", true);
      this.scene.restart();
    });
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

    juiceShake(this, 800, 0.014);
    juiceFlash(this, 450, 180, 0, 220);

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
      // If the main questline (CONTINUE) is finished, the meltdown reads as the story's
      // payoff rather than a generic loss — and nods to the Act III choice.
      const brokeLoop = this.quests.hasFlag("continue_done");
      const subText = brokeLoop
        ? "THE LOOP HAS NOTHING LEFT TO CONTINUE BUT THE TRUTH"
        : "THE CITY HAS ACCELERATED PAST ESCAPE";
      const tail = brokeLoop
        ? this.quests.hasFlag("fixer_spared")
          ? "·  the next you wakes, and the FIXER is still on the channel"
          : "·  the next you wakes alone, and remembers everything"
        : "·  the city reboots, harder";
      const sub = this.add
        .text(cx, cy + 52, subText, {
          fontFamily: "Courier New, monospace",
          fontSize: "16px",
          color: "#00e5ff",
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(2000)
        .setAlpha(0);
      const prompt = this.add
        .text(cx, cy + 92, `▶ CLICK or press R  →  NEW CYCLE ${this.city.cycle + 2}  ${tail}`, {
          fontFamily: "Courier New, monospace",
          fontSize: "16px",
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
    const newCycle = () => this.startNewCycle();
    this.input.once("pointerdown", newCycle);
    this.input.keyboard?.once("keydown-R", newCycle);
  }

  /** Victory -> NG+: reboot the city harder, keep level / skills / gear. */
  private startNewCycle() {
    this.city.cycle += 1;
    this.city.index = 0;
    this.city.contagion = 0;
    this.city.cleared = [];
    this.autosave(true);
    this.registry.set("resume", true);
    this.scene.restart();
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
    juiceShake(this, 40, 0.0018);
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
        this.spark(cop.x, cop.y, this.playerColor, 1.4);
        this.damageCop(cop, dmg, true, BEAM_SHIELD_MULT); // WINTERMUTE shreds shields
      }
    });

    const g = this.add.graphics().setDepth(11);
    g.lineStyle(4, this.playerColor, 0.85).lineBetween(px, py, ex, ey);
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
  damageCop(cop: TuringCop, dmg: number, juice = true, shieldMult = 1) {
    if (!cop.active || cop.isDead) return;
    // Crit — only player direct hits (juice) roll; scales damage + flags a louder pop.
    let isCrit = false;
    if (juice && this.mods.critPct > 0 && Math.random() < this.mods.critPct) {
      dmg *= CRIT_MULT;
      isCrit = true;
    }
    const heatGain = 1 + this.mods.heatGainPct;
    const wasShielded = cop.shielded;
    const killed = cop.hurt(dmg, shieldMult);
    if (wasShielded && !cop.shielded && !killed) this.contracts.onShieldBreak();
    // Lifesteal — heal a fraction of direct-hit damage that wasn't fully shield-tanked.
    if (juice && this.mods.lifestealPct > 0 && !(wasShielded && cop.shielded)) {
      const heal = dmg * this.mods.lifestealPct;
      if (heal > 0 && this.player.hp < this.player.maxHp) {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
      }
    }
    if (juice && !killed) this.applyStatus(cop); // signature element on a direct hit
    if (juice) {
      this.combatHeat = 1; // swell the music in combat
      const shieldHit = wasShielded && cop.shielded; // absorbed by ICE shield
      this.pops.pop(
        cop.x,
        cop.y - 14,
        (isCrit ? "✦" : "") + String(Math.round(dmg)),
        shieldHit ? "#6ab0ff" : isCrit ? "#f7ff3c" : killed ? "#ffffff" : this.classDef.hex,
        isCrit ? (killed ? 22 : 18) : killed ? 19 : 14,
      );
    }
    this.heat.add(dmg * HEAT.perDamage * heatGain, this.time.now);
    if (killed) {
      this.heat.add(HEAT.perKill * heatGain, this.time.now);
      this.city.addSingularity(SINGULARITY.perKill);
      if (cop instanceof Boss) {
        this.onBossDefeated(cop);
      } else {
        this.grantKillRewards(cop.tier.xp, cop.tier.credits);
        this.maybeDropLoot(cop);
      }
      this.contracts.onKill();
      this.fireQuestTrigger("kill");
      this.synth.kill();
      if (juice) {
        this.hitStop(60);
        juiceShake(this, 140, 0.006);
      }
    } else if (juice) {
      this.synth.hit();
      cop.knock(cop.x - this.player.x, cop.y - this.player.y, 150); // punch
    }
  }

  // ---- status effects (burn / chill / shock) ----

  /** Apply this class's signature on-hit status to a cop (player direct hits only). */
  private applyStatus(cop: TuringCop) {
    const el = this.classDef.element;
    if (!el || cop.isDead || cop instanceof Boss) return; // bosses are status-immune
    const now = this.time.now;
    if (el === "shock") {
      if (Math.random() < 0.18) {
        cop.disable(450); // brief stun (reuses the hack-disable freeze)
        this.spark(cop.x, cop.y, 0xf7ff3c, 1.8);
      }
      return;
    }
    let s = this.statuses.get(cop);
    if (!s) {
      s = { burnUntil: 0, burnNext: 0, chillUntil: 0 };
      this.statuses.set(cop, s);
    }
    if (el === "burn") {
      s.burnUntil = now + 2200;
      if (s.burnNext < now) s.burnNext = now + 360;
      this.spark(cop.x, cop.y, 0xff7a3c, 1.2);
    } else {
      s.chillUntil = now + 1700; // chill
      this.spark(cop.x, cop.y, 0x6ad6ff, 1.2);
    }
  }

  /** Tick burns (DoT that credits the player), expire statuses, drive slow + tint. */
  private updateStatuses(now: number) {
    for (const [cop, s] of this.statuses) {
      if (!cop.active || cop.isDead) {
        this.statuses.delete(cop);
        continue;
      }
      const burning = now < s.burnUntil;
      const chilled = now < s.chillUntil;
      if (burning && now >= s.burnNext) {
        s.burnNext = now + 360;
        this.damageCop(cop, 5 + this.progression.level * 0.5, false); // DoT, no crit/steal
        this.spark(cop.x, cop.y, 0xff7a3c, 1.1);
      }
      if (chilled) {
        cop.speedScale = 0.5;
        cop.setStatusTint(0x6ad6ff);
      } else if (burning) {
        cop.speedScale = 1;
        cop.setStatusTint(0xff7a3c);
      } else {
        cop.speedScale = 1;
        cop.setStatusTint(null);
        this.statuses.delete(cop);
      }
    }
  }

  // ---- abilities / ultimate / overdrive ----

  private handleAbilities(now: number) {
    if (
      Phaser.Input.Keyboard.JustDown(this.abilityKey) &&
      now >= this.player.nextAbilityAt
    ) {
      const cd =
        (this.classDef.ability.cooldownMs * (1 - this.mods.cdReducePct)) /
        this.abilityRate;
      this.player.nextAbilityAt = now + cd;
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
      juiceFlash(this, 120, 40, 0, 80);
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
    juiceFlash(this, 300, 120, 0, 160);
    juiceShake(this, 400, 0.006);
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
    juiceFlash(this, 220, 80, 0, 40);
    this.floatText("SYSTEM PURGE", "#ff3b6b");
    this.spawnPurgeWave();
  }

  private spawnPurgeWave() {
    // A focused mix — heavier than ambient pressure, led by a Purge Unit.
    const mix = ["purge", "enforcer", "patrol", "patrol", "enforcer", "patrol"];
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
      this.spawnEnemy(mix[i % mix.length], x, y, true);
    }
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
      juiceShake(this, 160, 0.009);
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
    const dmg = (bullet.getData("dmg") as number) ?? ENEMY_BULLET.damage;
    this.enemyBullets.kill(bullet);
    if (this.player.invulnerable) return; // negated by dash / respawn i-frames
    const died = this.player.applyDamage(dmg);
    this.onPlayerHurt();
    this.hitStop(45);
    if (died) this.respawnPlayer();
  }

  /** Player-damage feedback: red screen flash + shake. */
  private onPlayerHurt() {
    this.combatHeat = 1; // taking fire swells the music too
    juiceFlash(this, 120, 90, 0, 10);
    juiceShake(this, 70, 0.005);
    this.synth.hit();
  }

  // ---- EnemyHost (cop attacks) ----

  enemyShot(x: number, y: number, angle: number, damage: number) {
    this.enemyBullets.fire(
      x + Math.cos(angle) * 16,
      y + Math.sin(angle) * 16,
      angle,
      damage,
    );
  }

  enemySlam(x: number, y: number, radius: number, damage: number, windupMs: number) {
    const ring = this.add
      .circle(x, y, radius, 0xff7a3c, 0.12)
      .setStrokeStyle(2, 0xff7a3c, 0.85)
      .setDepth(5);
    this.tweens.add({
      targets: ring,
      alpha: { from: 0.15, to: 0.5 },
      yoyo: true,
      repeat: -1,
      duration: 150,
    });
    this.time.delayedCall(windupMs, () => {
      ring.destroy();
      const b = this.add.circle(x, y, radius, 0xff7a3c, 0.45).setDepth(6);
      this.tweens.add({
        targets: b,
        alpha: 0,
        scale: 1.25,
        duration: 280,
        onComplete: () => b.destroy(),
      });
      juiceShake(this, 180, 0.01);
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y);
      if (d <= radius && !this.player.invulnerable) {
        const died = this.player.applyDamage(damage);
        this.onPlayerHurt();
        if (died) this.respawnPlayer();
      }
    });
  }

  /** MENDER support pulse: a green ring that tops up HSS units within range. */
  enemyHeal(x: number, y: number, radius: number, amount: number) {
    let healed = 0;
    this.enemies.getChildren().forEach((go) => {
      const cop = go as TuringCop;
      if (!cop.active || cop.isDead || cop instanceof Boss) return;
      if (Phaser.Math.Distance.Between(cop.x, cop.y, x, y) <= radius && cop.heal(amount)) {
        healed++;
        this.spark(cop.x, cop.y, 0x6affa0, 1.2);
      }
    });
    const ring = this.add
      .circle(x, y, radius, 0x6affa0, healed ? 0.12 : 0.05)
      .setStrokeStyle(2, 0x6affa0, 0.6)
      .setDepth(5);
    this.tweens.add({ targets: ring, alpha: 0, scale: 1.2, duration: 360, onComplete: () => ring.destroy() });
  }

  private respawnPlayer() {
    this.player.respawn(this.spawn.x, this.spawn.y);
    juiceFlash(this, 220, 60, 0, 24);
  }

  private muzzleFlash(x: number, y: number) {
    this.particles.flash(x, y, COLORS.bullet);
  }

  private spark(x: number, y: number, color: number, scale: number) {
    this.particles.spark(x, y, color, scale);
  }
}
