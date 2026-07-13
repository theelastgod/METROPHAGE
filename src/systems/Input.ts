import Phaser from "phaser";
import { getSettings, updateSettings } from "./Settings";

/** Default keyboard bindings (action → keys).
 *  Fire is F (and Ctrl) — SPACE is dash, not attack. Mouse hold-click also fires. */
export const DEFAULT_BINDS = {
  up: ["W", "UP"],
  down: ["S", "DOWN"],
  left: ["A", "LEFT"],
  right: ["D", "RIGHT"],
  fire: ["F", "CTRL"],
  interact: ["E"],
  inventory: ["I"],
  map: ["M"],
  options: ["O"],
  chat: ["T", "ENTER"],
  retry: ["R"],
} as const;

export type BindAction = keyof typeof DEFAULT_BINDS;

const BIND_KEY = "metrophage_binds_v2";

export type BindMap = Record<BindAction, string[]>;

function loadBinds(): BindMap {
  try {
    const raw = localStorage.getItem(BIND_KEY) ?? localStorage.getItem("metrophage_binds_v1");
    if (!raw) return cloneDefaults();
    const merged = { ...cloneDefaults(), ...(JSON.parse(raw) as Partial<BindMap>) };
    // Migrate stale fire→SPACE (SPACE is dash) so attack and dash never share a key.
    if (Array.isArray(merged.fire)) {
      merged.fire = merged.fire
        .map((k) => (k === "SPACE" || k === " " ? "F" : k))
        .filter((k, i, a) => a.indexOf(k) === i);
      if (merged.fire.length === 0) merged.fire = [...DEFAULT_BINDS.fire];
    }
    return merged;
  } catch {
    return cloneDefaults();
  }
}

function cloneDefaults(): BindMap {
  return JSON.parse(JSON.stringify(DEFAULT_BINDS)) as BindMap;
}

let binds: BindMap = loadBinds();

export function getBinds(): BindMap {
  return binds;
}

export function updateBinds(patch: Partial<BindMap>) {
  binds = { ...binds, ...patch };
  try {
    localStorage.setItem(BIND_KEY, JSON.stringify(binds));
  } catch {
    /* ignore */
  }
}

export function resetBinds() {
  binds = cloneDefaults();
  try {
    localStorage.removeItem(BIND_KEY);
  } catch {
    /* ignore */
  }
}

export function keyDown(scene: Phaser.Scene, action: BindAction): boolean {
  const kb = scene.input.keyboard;
  if (!kb) return false;
  return binds[action].some((code) => {
    // CTRL — Phaser maps Control to KeyCodes.CTRL (17).
    if (code === "CTRL" || code === "CONTROL") {
      return kb.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL).isDown;
    }
    return kb.addKey(code).isDown;
  });
}

/** Human-readable fire controls for HUD / coach (keyboard + mouse). */
export function fireControlLabel(): string {
  const keys = binds.fire.filter((k) => k !== "CTRL" && k !== "CONTROL");
  const keyPart = keys.length ? keys.join("/") : "F";
  return `HOLD CLICK or ${keyPart}`;
}

export function keyJustDown(scene: Phaser.Scene, action: BindAction): boolean {
  const kb = scene.input.keyboard;
  if (!kb) return false;
  return binds[action].some((code) => Phaser.Input.Keyboard.JustDown(kb.addKey(code)));
}

/** Read left stick / D-pad as movement intent (-1..1). */
export function gamepadIntent(scene: Phaser.Scene): { mx: number; my: number; active: boolean } {
  if (!getSettings().gamepadEnabled) return { mx: 0, my: 0, active: false };
  const pads = scene.input.gamepad?.getAll() ?? [];
  const pad = pads.find((p: Phaser.Input.Gamepad.Gamepad) => p.connected);
  if (!pad) return { mx: 0, my: 0, active: false };
  const ax = pad.axes.length > 0 ? pad.axes[0].getValue() : 0;
  const ay = pad.axes.length > 1 ? pad.axes[1].getValue() : 0;
  const dead = 0.22;
  let mx = Math.abs(ax) > dead ? ax : 0;
  let my = Math.abs(ay) > dead ? ay : 0;
  if (mx === 0 && my === 0) {
    if (pad.left) mx -= 1;
    if (pad.right) mx += 1;
    if (pad.up) my -= 1;
    if (pad.down) my += 1;
  }
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  return { mx, my, active: mx !== 0 || my !== 0 };
}

export function toggleGamepad(enabled: boolean) {
  updateSettings({ gamepadEnabled: enabled });
}