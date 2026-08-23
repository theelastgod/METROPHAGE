// Callsign is a unique display label. It is never a player id.
// Phaser-free so the Worker can import the same rules the client uses.

import { ALL_NPCS } from "./cityNpcs";

export const CALLSIGN_MAX = 12;
const CALLSIGN_RE = /[A-Z0-9-]/;

export function cleanCallsign(s: string): string {
  return (s || "")
    .toUpperCase()
    .split("")
    .filter((ch) => CALLSIGN_RE.test(ch))
    .join("")
    .slice(0, CALLSIGN_MAX);
}

const EXTRA_RESERVED = ["SYSTEM", "FIXER", "THEFIXER"] as const;

function reservedSet(): Set<string> {
  const s = new Set<string>(EXTRA_RESERVED);
  for (const n of ALL_NPCS) {
    const c = cleanCallsign(n.name);
    if (c) s.add(c);
  }
  return s;
}

const RESERVED = reservedSet();

export function isReservedCallsign(norm: string): boolean {
  if (!norm) return true;
  if (norm.startsWith("__")) return true;
  return RESERVED.has(norm);
}

/**
 * Canonical callsign for uniqueness (`players.name_norm`).
 * Same alphabet as cleanCallsign; empty / reserved / `__*` → "".
 */
export function normalizeCallsign(s: string): string {
  const n = cleanCallsign(s);
  if (!n || isReservedCallsign(n)) return "";
  return n;
}

export function reservedCallsignReason(norm: string): string | null {
  if (!norm) return "callsign required";
  if (isReservedCallsign(norm)) return "that callsign is reserved";
  return null;
}
