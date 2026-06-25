import Phaser from "phaser";
import { installUiCamera } from "../render/cameras";
import { shadeWalls } from "../render/wallShade";
import Atmosphere from "../render/Atmosphere";
import OnlineInventory from "../ui/OnlineInventory";
import OnlineShop from "../ui/OnlineShop";
import OnlineForge from "../ui/OnlineForge";
import OnlineBoard from "../ui/OnlineBoard";
import OnlineGuild from "../ui/OnlineGuild";
import OnlineMarket from "../ui/OnlineMarket";
import OnlineContracts from "../ui/OnlineContracts";
import { COLORS, TILE, VIEW_W, VIEW_H } from "../config";
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
import { buildGrid, buildSafehouse } from "../world/district";
import { DISTRICTS } from "../game/districts";
import { ENEMY_BARKS } from "../game/enemies";
import { WORLD_W, WORLD_H } from "../net/sim";
import NetClient, { type NetEnemy } from "../net/NetClient";
import NeonPipeline from "../render/NeonPipeline";
import { QUESTLINE } from "../net/quest";
import OnlineCosmetics from "../ui/OnlineCosmetics";
import { applyCosmetic } from "../game/cosmetics";
import type { PlayerLook } from "../net/protocol";
import { setOnlinePlayer } from "../economy/session";
import { connectedWallet, signWalletLogin } from "../economy/wallet";
import { loginMessage } from "../net/protocol";
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
// 0 patrol · 1 wasp · 2 lancer · 3 hound · 4 enforcer · 5 sniper · 6 wraith
const ENEMY_KIND_TINT = [0xff3b6b, 0x39ffd0, 0xffe06a, 0xff5ad0, 0xff8a3c, 0x4d8cff, 0xb06bff];

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
  private bossOverlays = new Map<number, { name: Phaser.GameObjects.Text; bar: Phaser.GameObjects.Graphics }>();
  private bossBanner!: Phaser.GameObjects.Text; // zone boss status (alive / reform countdown)
  private bossArrow!: Phaser.GameObjects.Text; // screen-edge pointer toward an off-screen boss
  private shotSprites = new Map<number, Phaser.GameObjects.Image>();
  private pickupSprites = new Map<number, Phaser.GameObjects.Image>();
  private nodeSprites = new Map<number, Phaser.GameObjects.Sprite>();
  private nodeG!: Phaser.GameObjects.Graphics;
  private hazardG!: Phaser.GameObjects.Graphics; // telegraphed boss AoE rings (raid mechanics)
  private faction = 0;
  private hud!: Phaser.GameObjects.Text;
  private hpBar!: Phaser.GameObjects.Graphics;
  private deadText!: Phaser.GameObjects.Text;
  private meltdownFx!: Phaser.GameObjects.Rectangle;
  private meltdownText!: Phaser.GameObjects.Text;
  private atmosphere?: Atmosphere; // rich ambient layer, shared with the SP city
  private inv!: OnlineInventory; // bottom hotbar + openable bag, fed by the server
  private shop!: OnlineShop; // vendor panel (credits sink)
  private forge!: OnlineForge; // gear forge — upgrade/reforge/fuse/salvage (credits+cores sink)
  private board!: OnlineBoard; // achievements + cross-zone leaderboards (D1-backed, HTTP)
  private guildPanel!: OnlineGuild; // guild ("Cell") bank/roster/level (D1-backed)
  private market!: OnlineMarket; // auction house — cross-zone player market (D1-backed)
  private contracts!: OnlineContracts; // daily contracts + reputation track (D1-backed)
  private cosmetics!: OnlineCosmetics; // wardrobe / transmog (cosmetic-only, wallet-owned)
  private baseLook?: PlayerLook; // your base appearance (cosmetics merge on top for rendering)
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
  private interior = false; // true when this is the safehouse zone
  private fromZone = "d0"; // district to return to when leaving the safehouse
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

  create(data?: { zone?: string; from?: string }) {
    const rawCust = this.registry.get("customization") as Customization | undefined;
    const cust = sanitizeCustomization(rawCust, this.registry.get("classId") as string | undefined);
    this.callsign = (rawCust?.callsign || "runner").toLowerCase();
    this.color = cust.color;
    this.emoteWheelOpen = false; // reset transient UI across scene.restart (travel)
    this.wheelObjs = [];
    this.lastEmoteShownAt = 0;
    this.bossOverlays.clear(); // GO destroyed on shutdown; drop stale refs before re-create

    // Zone = which district (or the safehouse interior) this client is in. Travel hands off
    // to another DO by reconnecting with a new zone.
    this.zone = data?.zone === "safe" ? "safe" : "d" + this.parseZone(data?.zone);
    this.interior = this.zone === "safe";
    this.fromZone = data?.from ?? "d0"; // where 'H' returns to from inside the safehouse
    this.districtIndex = this.interior ? 0 : this.parseZone(data?.zone);
    const def = DISTRICTS[this.districtIndex];

    this.cameras.main.setBackgroundColor(COLORS.bgVoid);

    // Real world — same grid + tileset the server simulates against (or the safehouse room).
    const grid = this.interior ? buildSafehouse() : buildGrid(def);
    const map = this.make.tilemap({ data: grid, tileWidth: TILE, tileHeight: TILE });
    const tileset = map.addTilesetImage(TILESET_KEY, TILESET_KEY, TILE, TILE)!;
    map.createLayer(0, tileset, 0, 0)!;
    // Building-silhouette pass (also shades the interior walls). The atmospheric weather is
    // outdoors-only — the safehouse is a calm, indoor social hub.
    shadeWalls(this, grid);
    if (!this.interior) {
      this.atmosphere = new Atmosphere(this, {
        weather: def.weather,
        accent: def.accent,
        worldW: WORLD_W,
        worldH: WORLD_H,
      });
      for (let i = 0; i < def.layout.buildings.length; i += 2) {
        const b = def.layout.buildings[i];
        const cx = ((b.x1 + b.x2) / 2) * TILE + TILE / 2;
        const cy = ((b.y1 + b.y2) / 2) * TILE + TILE / 2;
        this.atmosphere.addHologram(cx, cy, def.accent);
      }
    }
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    installUiCamera(this, 1);
    this.applyNeon();
    if (!this.interior) this.drawPvpZones(); // no PvP arena inside the safehouse
    if (this.interior) {
      this.add
        .text(WORLD_W / 2, 4 * TILE, "▣ SAFEHOUSE", { fontFamily: "Courier New, monospace", fontSize: "20px", color: "#39ff88", fontStyle: "bold" })
        .setOrigin(0.5)
        .setDepth(6);
      this.add
        .text(WORLD_W / 2, 4 * TILE + 26, "a quiet hold — no combat · H to leave · B vendor", {
          fontFamily: "Courier New, monospace",
          fontSize: "11px",
          color: "#9aa3b2",
        })
        .setOrigin(0.5)
        .setDepth(6);
    }

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
    this.hazardG = this.add.graphics().setDepth(8); // boss AoE telegraphs (under shots/players)
    // Send your look so every other player renders your customization (not a generic body).
    this.baseLook = customizationToLook(cust); // cosmetics merge onto this for the rendered avatar
    this.net = new NetClient(grid, this.callsign, url, this.faction, this.baseLook);
    this.net.onWelcome = (x, y) => {
      this.me.setPosition(x, y).setVisible(true);
      this.cameras.main.startFollow(this.me, true, 0.18, 0.18);
      setOnlinePlayer(this.net.id); // let the $METRO bridge panel address this player
    };
    this.inv = new OnlineInventory(this);
    this.inv.onEquip = (id) => this.net.equip(id);
    this.inv.onUnequip = (slot) => this.net.unequip(slot);
    this.net.onInventory = () => {
      this.inv.setItems(this.net.inventory);
      this.inv.setEquipped(this.net.equipped);
      this.forge.setState(this.net.inventory, this.net.equipped, this.net.credits, this.net.cores);
      if (this.market?.open) this.market.setState(this.net.marketListings, this.net.inventory, this.net.id, this.net.credits);
    };
    this.shop = new OnlineShop(this);
    this.shop.onBuy = (sku) => this.net.buy(sku);
    this.forge = new OnlineForge(this);
    this.forge.onCraft = (action, id, id2) => this.net.craft(action, id, id2);
    // HTTP base for cross-zone reads (leaderboards): ws(s)://host/ws → http(s)://host
    const httpBase = SERVER_URL.replace(/^ws/, "http").replace(/\/ws$/, "");
    this.board = new OnlineBoard(this, httpBase);
    this.guildPanel = new OnlineGuild(this);
    this.guildPanel.onAction = (action, c, k) => {
      if (action === "leave") this.net.guildAction("leave");
      else if (action === "info") this.net.guildAction("info");
      else this.net.guildAction(action, { credits: c, cores: k });
    };
    this.net.onGuildUpdate = () => this.guildPanel.setGuild(this.net.guild, this.net.id);
    this.market = new OnlineMarket(this);
    this.market.onBuy = (id) => this.net.marketBuy(id);
    this.market.onCancel = (id) => this.net.marketCancel(id);
    this.market.onList = (itemId, price) => this.net.marketList(itemId, price);
    this.market.onRefresh = () => this.net.marketBrowse();
    this.net.onMarket = () => {
      if (this.market.open) this.market.setState(this.net.marketListings, this.net.inventory, this.net.id, this.net.credits);
    };
    this.contracts = new OnlineContracts(this);
    this.net.onContracts = () => {
      if (this.contracts.open) this.contracts.setState(this.net.contracts, this.net.rep);
      this.shop.setRep(this.net.repTier); // higher vendor caches unlock with reputation
    };
    this.cosmetics = new OnlineCosmetics(this);
    this.cosmetics.onAction = (action, id) => this.net.cosmeticAction(action, id);
    this.net.onCosmetics = () => {
      if (this.cosmetics.open) this.cosmetics.setState(this.net.cosmeticsOwned, this.net.cosmeticEquipped, this.net.credits);
      this.applyLocalCosmetic(); // retint your own avatar to match the equipped transmog
    };
    // World-boss locator: a status banner + a screen-edge arrow toward an off-screen boss.
    this.bossBanner = this.add
      .text(VIEW_W / 2, 46, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "13px",
        color: "#39ff88",
        fontStyle: "bold",
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1002)
      .setVisible(false);
    this.bossBanner.setShadow(0, 0, "#02030a", 4, true, true);
    this.bossArrow = this.add
      .text(0, 0, "➤", { fontFamily: "Arial, sans-serif", fontSize: "30px", color: "#39ff88", fontStyle: "bold" })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1002)
      .setVisible(false);
    this.bossArrow.setShadow(0, 0, "#02030a", 6, true, true);
    void this.signInThenConnect();

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
        `WASD · CLICK fire · I bag · G forge · B vendor · K market · J jobs · Y style · C cell · L board · H safehouse · V emote · ENTER chat`,
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
      if (e.key === "i" || e.key === "I") {
        this.inv.toggle();
        return;
      }
      if (this.inv.open && e.key === "Escape") {
        this.inv.close(); // ESC closes the bag first, before it exits the scene
        return;
      }
      if (e.key === "b" || e.key === "B") {
        this.shop.toggle();
        return;
      }
      if (this.shop.open && e.key === "Escape") {
        this.shop.close();
        return;
      }
      if (e.key === "g" || e.key === "G") {
        this.forge.setState(this.net.inventory, this.net.equipped, this.net.credits, this.net.cores);
        this.forge.toggle();
        return;
      }
      if (this.forge.open && e.key === "Escape") {
        this.forge.close();
        return;
      }
      if (e.key === "l" || e.key === "L") {
        this.board.toggle(this.net.achievements, this.net.id);
        return;
      }
      if (this.board.open && e.key === "Escape") {
        this.board.close();
        return;
      }
      if (e.key === "c" || e.key === "C") {
        this.net.guildAction("info"); // pull a fresh summary before showing
        this.guildPanel.toggle(this.net.guild, this.net.id);
        return;
      }
      if (this.guildPanel.open && e.key === "Escape") {
        this.guildPanel.close();
        return;
      }
      if (e.key === "k" || e.key === "K") {
        this.market.toggle(this.net.marketListings, this.net.inventory, this.net.id, this.net.credits);
        return;
      }
      if (this.market.open && e.key === "Escape") {
        this.market.close();
        return;
      }
      if (e.key === "j" || e.key === "J") {
        this.contracts.toggle(this.net.contracts, this.net.rep);
        return;
      }
      if (this.contracts.open && e.key === "Escape") {
        this.contracts.close();
        return;
      }
      if (e.key === "y" || e.key === "Y") {
        this.cosmetics.toggle(this.net.cosmeticsOwned, this.net.cosmeticEquipped, this.net.credits);
        return;
      }
      if (this.cosmetics.open && e.key === "Escape") {
        this.cosmetics.close();
        return;
      }
      if (e.key === "h" || e.key === "H") {
        // H enters the safehouse (a no-combat hub) from a district, and returns to where
        // you came from. Travel = reconnect to the destination zone's DO.
        const dest = this.interior ? this.fromZone : "safe";
        const from = this.interior ? undefined : this.zone;
        this.net.disconnect();
        this.scene.restart({ zone: dest, from });
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

  /** Resolve a signed wallet identity (if a wallet is connected), then connect. A
   *  connected wallet signs the login message → a durable wallet account; otherwise,
   *  or if the user declines the signature, we connect as a guest keyed by callsign. */
  private async signInThenConnect() {
    const addr = connectedWallet();
    if (addr) {
      const ts = Date.now();
      const signed = await signWalletLogin(loginMessage(addr, ts));
      if (signed) this.net.setAuth({ wallet: addr, sig: signed.signature, ts });
    }
    this.net.connect();
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
    // ── guild ("Cell") commands ──
    else if (s.startsWith("/g ")) this.net.sendChat("guild", undefined, s.slice(3));
    else if (s.startsWith("/gcreate ")) {
      const r = s.slice(9).trim();
      const i = r.indexOf(" ");
      if (i > 0) this.net.guildAction("create", { tag: r.slice(0, i), name: r.slice(i + 1) });
      else this.net.guildAction("create", { tag: r, name: r });
    } else if (s.startsWith("/ginvite ")) this.net.guildAction("invite", { to: s.slice(9).trim() });
    else if (s === "/gjoin") this.net.guildAction("accept");
    else if (s === "/gleave") this.net.guildAction("leave");
    else if (s === "/ginfo") this.net.guildAction("info");
    else if (s.startsWith("/gpromote ")) this.net.guildAction("promote", { to: s.slice(10).trim() });
    else if (s.startsWith("/gdemote ")) this.net.guildAction("demote", { to: s.slice(9).trim() });
    else if (s.startsWith("/gkick ")) this.net.guildAction("kick", { to: s.slice(7).trim() });
    else if (s.startsWith("/gdep ")) {
      const parts = s.slice(6).trim().split(/\s+/);
      this.net.guildAction("deposit", { credits: parseInt(parts[0], 10) || 0, cores: parseInt(parts[1], 10) || 0 });
    } else if (s.startsWith("/gwd ")) {
      const parts = s.slice(5).trim().split(/\s+/);
      this.net.guildAction("withdraw", { credits: parseInt(parts[0], 10) || 0, cores: parseInt(parts[1], 10) || 0 });
    }
    // auction house — /list <bagSlot 1-based> <price> for a custom ask (quick-list via the K panel)
    else if (s.startsWith("/list ")) {
      const parts = s.slice(6).trim().split(/\s+/);
      const slot = parseInt(parts[0], 10);
      const price = parseInt(parts[1], 10);
      const it = this.net.inventory[slot - 1];
      if (it && price > 0) this.net.marketList(it.id, price);
    }
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

  /** Retint the LOCAL avatar to the equipped transmog (remotes get it via the relayed look). */
  private applyLocalCosmetic() {
    if (!this.me || !this.baseLook) return;
    const id = this.net.cosmeticEquipped;
    if (id) {
      const merged = applyCosmetic(this.baseLook, id);
      if (merged) {
        const k = lookKey(merged);
        bakeRemoteLook(this, k, merged);
        this.me.setTexture(k, 0).setTint(0xffffff);
      }
    } else {
      this.me.setTexture(PLAYER_CUSTOM_KEY, 0).setTint(0xffffff);
    }
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
    // Drift fog + flicker the holo-signage; the shared singularity swells the haze.
    this.atmosphere?.update(this.time.now, dt, Phaser.Math.Clamp(this.net.singularity / SING_MAX, 0, 1));
    this.updateBossLocator();
    if (this.shop.open) this.shop.setCredits(this.net.credits);
    if (this.forge.open) this.forge.setWallet(this.net.credits, this.net.cores);

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
    const inPvp = this.net.connected && !this.interior && inPvpZone(this.net.pred.x, this.net.pred.y);
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
      if (e.boss) {
        if (!s.getData("boss")) {
          s.setData("boss", true);
          s.setScale(2.6).setDepth(9).setTint(e.tint ?? COLORS.enemy); // a looming, named commander
        }
        this.updateBossOverlay(id, e);
      } else if (s.getData("kind") !== e.kind) {
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
        const o = this.bossOverlays.get(id); // a slain boss leaves the snapshot → drop its overlay
        if (o) {
          o.name.destroy();
          o.bar.destroy();
          this.bossOverlays.delete(id);
        }
      }

    // boss AoE telegraphs (raid mechanics) — a ring that fills as it nears detonation
    this.hazardG.clear();
    for (const hz of this.net.hazards) {
      const danger = hz.frac;
      const col = danger > 0.72 ? 0xff2b2b : 0xff7a3c;
      this.hazardG.fillStyle(col, 0.1 + 0.32 * danger);
      this.hazardG.fillCircle(hz.x, hz.y, hz.r * (0.22 + 0.78 * danger)); // inner fill rushes outward
      this.hazardG.lineStyle(3, col, 0.85);
      this.hazardG.strokeCircle(hz.x, hz.y, hz.r);
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
        ? `◢ ONLINE  ${this.callsign}  ·  ${this.interior ? "▣ SAFEHOUSE" : `${this.zone.toUpperCase()} ${DISTRICTS[this.districtIndex].name}`}`
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
  /** World-space boss decoration: a name plate + an HP bar floating above the commander. */
  private updateBossOverlay(id: number, e: NetEnemy) {
    let o = this.bossOverlays.get(id);
    const hex = "#" + ((e.tint ?? 0xffffff) & 0xffffff).toString(16).padStart(6, "0");
    if (!o) {
      const name = this.add
        .text(e.x, e.y - 58, e.name ?? "HSS COMMANDER", {
          fontFamily: "Courier New, monospace",
          fontSize: "12px",
          color: hex,
          fontStyle: "bold",
          align: "center",
        })
        .setOrigin(0.5)
        .setDepth(20);
      name.setShadow(0, 0, "#02030a", 5, true, true);
      const bar = this.add.graphics().setDepth(20);
      o = { name, bar };
      this.bossOverlays.set(id, o);
    }
    o.name.setPosition(e.x, e.y - 58);
    const w = 90;
    const hpn = e.hpMax ? Phaser.Math.Clamp(e.hp / e.hpMax, 0, 1) : 1;
    o.bar.clear();
    o.bar.fillStyle(0x140a1e, 0.9).fillRect(e.x - w / 2, e.y - 46, w, 6);
    o.bar.fillStyle(e.tint ?? COLORS.enemy, 1).fillRect(e.x - w / 2 + 1, e.y - 45, (w - 2) * hpn, 4);
  }

  /** Boss locator: a status banner + a screen-edge arrow pointing toward the zone boss,
   *  so players can find it from across the map (or watch its respawn countdown). */
  private updateBossLocator() {
    const b = this.net.boss;
    if (!b) {
      this.bossBanner.setVisible(false);
      this.bossArrow.setVisible(false);
      return;
    }
    this.bossBanner.setVisible(true);
    if (!b.alive) {
      this.bossBanner.setText(`◆ ${b.name} — reforms in ${b.respawnSec}s`).setColor("#9aa3b2");
      this.bossArrow.setVisible(false);
      return;
    }
    const dx = b.x - this.me.x;
    const dy = b.y - this.me.y;
    this.bossBanner.setText(`◆ ${b.name} — ALIVE · ${Math.round(Math.hypot(dx, dy) / 8)}m`).setColor("#39ff88");
    const zoom = this.cameras.main.zoom || 1;
    if (Math.abs(dx) < VIEW_W / 2 / zoom - 48 && Math.abs(dy) < VIEW_H / 2 / zoom - 48) {
      this.bossArrow.setVisible(false); // on-screen — the boss + its overlay are already visible
      return;
    }
    const ang = Math.atan2(dy, dx);
    const cx = VIEW_W / 2;
    const cy = VIEW_H / 2;
    const t = Math.min((cx - 70) / (Math.abs(Math.cos(ang)) || 1e-6), (cy - 96) / (Math.abs(Math.sin(ang)) || 1e-6));
    this.bossArrow.setVisible(true).setPosition(cx + Math.cos(ang) * t, cy + Math.sin(ang) * t).setRotation(ang);
  }

  private maybeEnemyBark(x: number, y: number, kind: number) {
    const now = this.time.now;
    if (now < this.nextEnemyBarkAt || Math.random() > 0.4) return;
    const ids = ["patrol", "wasp", "lancer", "hound", "patrol", "lancer", "hound"]; // 4-6 reuse pools
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
