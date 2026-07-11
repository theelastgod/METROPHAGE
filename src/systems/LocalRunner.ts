import type { Customization } from "../game/customization";
import { sanitizeCustomization } from "../game/customization";

/**
 * Device-local multiplayer runner profile (no wallet required).
 *
 * Progress (credits, inventory, campaign, house…) is saved on the game server under
 * a guest id = callsign, gated by a per-device secret (`mp_secret_*` in NetClient).
 * This local slot only remembers callsign/look so CONTINUE can reconnect you.
 */

const KEY = "metrophage_local_runner_v1";

export interface LocalRunnerProfile {
  v: 1;
  callsign: string;
  classId: string;
  customization: Customization;
  /** Last online zone (best-effort resume hint). */
  lastZone?: string;
  /**
   * Guest multiplayer device secret (same value as `mp_secret_<id>` in localStorage).
   * Stored here so CONTINUE still works if the mp_secret_* key was wiped but the
   * profile wasn't — regenerating a secret was causing "callsign locked on another device".
   */
  deviceSecret?: string;
  updatedAt: number;
}

export function loadLocalRunner(): LocalRunnerProfile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as LocalRunnerProfile;
    if (!s || s.v !== 1 || !s.customization || !s.classId) return null;
    const callsign = (s.callsign || s.customization.callsign || "").trim();
    if (!callsign) return null;
    return {
      v: 1,
      callsign,
      classId: s.classId,
      customization: sanitizeCustomization(s.customization, s.classId),
      lastZone: typeof s.lastZone === "string" ? s.lastZone : undefined,
      deviceSecret: typeof s.deviceSecret === "string" && s.deviceSecret.length >= 8 ? s.deviceSecret : undefined,
      updatedAt: typeof s.updatedAt === "number" ? s.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function writeLocalRunner(partial: {
  callsign: string;
  classId: string;
  customization: Customization;
  lastZone?: string;
  deviceSecret?: string;
}): LocalRunnerProfile {
  const prev = loadLocalRunner();
  const profile: LocalRunnerProfile = {
    v: 1,
    callsign: partial.callsign,
    classId: partial.classId,
    customization: sanitizeCustomization(partial.customization, partial.classId),
    lastZone: partial.lastZone ?? prev?.lastZone,
    // Prefer explicit secret, else keep previous when callsign matches.
    deviceSecret:
      partial.deviceSecret ??
      (prev && prev.callsign.toLowerCase() === partial.callsign.toLowerCase() ? prev.deviceSecret : undefined),
    updatedAt: Date.now(),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* private mode / quota */
  }
  return profile;
}

/** Update lastZone without rewriting the whole character. */
export function touchLocalRunnerZone(zone: string): void {
  const prev = loadLocalRunner();
  if (!prev || !zone) return;
  writeLocalRunner({
    callsign: prev.callsign,
    classId: prev.classId,
    customization: prev.customization,
    lastZone: zone,
  });
}

export function clearLocalRunner(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function hasLocalRunner(): boolean {
  return loadLocalRunner() !== null;
}
