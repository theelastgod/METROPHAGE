import type { Customization } from "../game/customization";
import { sanitizeCustomization } from "../game/customization";
import { isGuestPlayerId } from "../game/playerId";

/**
 * Device-local multiplayer runner profile (no wallet required).
 *
 * Server progress is keyed by guestId `g:<uuid>` + device secret — never by callsign.
 * CONTINUE reconnects this id; typing a name cannot load someone else's row.
 */

const KEY = "metrophage_local_runner_v1";

export interface LocalRunnerProfile {
  v: 1;
  guestId: string;
  callsign: string;
  classId: string;
  customization: Customization;
  /** Last online zone (best-effort resume hint). */
  lastZone?: string;
  /**
   * Guest multiplayer device secret (same value as `mp_secret_<guestId>` in localStorage).
   * Stored here so CONTINUE still works if the mp_secret_* key was wiped but the profile wasn't.
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
    const guestId = typeof s.guestId === "string" ? s.guestId.trim() : "";
    // Name-only slots cannot CONTINUE — resume is guestId + secret, never typed name.
    if (!callsign || !isGuestPlayerId(guestId)) return null;
    return {
      v: 1,
      guestId,
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
  guestId: string;
  callsign: string;
  classId: string;
  customization: Customization;
  lastZone?: string;
  deviceSecret?: string;
}): LocalRunnerProfile {
  const prev = loadLocalRunner();
  const guestId = isGuestPlayerId(partial.guestId)
    ? partial.guestId
    : prev?.guestId && isGuestPlayerId(prev.guestId)
      ? prev.guestId
      : partial.guestId;
  const profile: LocalRunnerProfile = {
    v: 1,
    guestId,
    callsign: partial.callsign,
    classId: partial.classId,
    customization: sanitizeCustomization(partial.customization, partial.classId),
    lastZone: partial.lastZone ?? prev?.lastZone,
    deviceSecret:
      partial.deviceSecret ??
      (prev && prev.guestId === guestId ? prev.deviceSecret : undefined),
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
    guestId: prev.guestId,
    callsign: prev.callsign,
    classId: prev.classId,
    customization: prev.customization,
    lastZone: zone,
    deviceSecret: prev.deviceSecret,
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
