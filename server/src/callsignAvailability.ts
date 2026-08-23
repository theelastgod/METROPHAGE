// Callsign availability — UX preflight only. Claim INSERT with UNIQUE is authority.

import type { D1Database } from "@cloudflare/workers-types";
import { CALLSIGN_MAX, cleanCallsign, isReservedCallsign, reservedCallsignReason } from "../../src/game/callsign";

export type CallsignCheck = {
  ok: true;
  callsign: string;
  available: boolean;
  reason?: string;
  suggestion?: string;
};

async function nameTaken(db: D1Database, nameNorm: string): Promise<boolean> {
  try {
    const row = await db
      .prepare("SELECT 1 AS taken FROM players WHERE name_norm = ?")
      .bind(nameNorm)
      .first();
    return !!row;
  } catch {
    return false;
  }
}

export async function suggestCallsign(db: D1Database, callsign: string): Promise<string | undefined> {
  for (let n = 2; n <= 9; n++) {
    const suffix = "-" + n;
    const cand = callsign.slice(0, CALLSIGN_MAX - suffix.length) + suffix;
    const norm = cleanCallsign(cand);
    if (!norm || isReservedCallsign(norm)) continue;
    if (!(await nameTaken(db, norm))) return cand;
  }
  return undefined;
}

export async function checkCallsign(db: D1Database, raw: string): Promise<CallsignCheck> {
  const callsign = cleanCallsign(raw);
  const reserved = reservedCallsignReason(callsign);
  if (reserved) return { ok: true, callsign, available: false, reason: reserved };
  if (!(await nameTaken(db, callsign))) return { ok: true, callsign, available: true };

  const suggestion = await suggestCallsign(db, callsign);
  return {
    ok: true,
    callsign,
    available: false,
    reason: "that callsign is taken",
    suggestion,
  };
}
