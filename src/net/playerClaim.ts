import { metroApiBase } from "../economy/metro";
import type { PlayerLook } from "./protocol";

export type ClaimResponse = {
  ok: boolean;
  playerId?: string;
  callsign?: string;
  already?: boolean;
  reason?: string;
  suggestion?: string;
};

export async function claimCallsign(body: {
  guestId?: string;
  secret?: string;
  callsign: string;
  look?: PlayerLook;
  classId?: string;
  wallet?: string;
  sig?: string;
  ts?: number;
}): Promise<ClaimResponse> {
  const r = await fetch(`${metroApiBase()}/player/claim`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = (await r.json()) as ClaimResponse;
  if (!j || typeof j.ok !== "boolean") {
    return { ok: false, reason: `claim failed (HTTP ${r.status})` };
  }
  return j;
}

export type Availability = {
  ok: boolean;
  callsign?: string;
  available?: boolean;
  reason?: string;
  suggestion?: string;
};

export async function checkCallsignAvailable(callsign: string): Promise<Availability> {
  const url = `${metroApiBase()}/player/available?callsign=${encodeURIComponent(callsign)}`;
  const r = await fetch(url);
  return (await r.json()) as Availability;
}
