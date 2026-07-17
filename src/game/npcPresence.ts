// Coarse server-authoritative NPC presence. It intentionally validates logical zone
// before a talk/service/job action; exact click range remains presentation because
// several resident seats shift with authored room layouts.

import { ONLINE_CITY } from "../world/city";
import { districtBuildingKind } from "./districtVenues";
import {
  INTERIOR_PLAN,
  districtFieldMedic,
  districtRegionalAnchor,
  districtResident,
  hubResident,
  keeperFor,
  themedHubOccupants,
} from "./cityNpcs";
import { residentProfile, scheduledResidents } from "./residentLife";

const SAFE_CONTACTS = new Set(["rin", "doc", "vex", "marek", "amb_tech", "kessler"]);
const NAMED_INTERIORS = new Set(["clinic", "bar", "den", "shop"]);

function hasId(ids: Array<{ id: string }>, npcId: string): boolean {
  return ids.some((npc) => npc.id === npcId);
}

export function npcPresentInZone(npcId: string, zone: string, now = Date.now()): boolean {
  if (!npcId || !zone) return false;
  if (zone === "safe") return SAFE_CONTACTS.has(npcId);
  if (zone === "subway") return npcId === "subway_warden" || npcId === "keep_subway";
  if (/^w\d+$/.test(zone)) return npcId === "amb_courier" || npcId === "amb_drifter";

  if (NAMED_INTERIORS.has(zone)) {
    const planned = (INTERIOR_PLAN[zone]?.[0] ?? []);
    return planned.includes(npcId) || keeperFor(zone).id === npcId;
  }

  const hub = /^h(\d+)$/.exec(zone);
  if (hub) {
    const index = Number(hub[1]);
    const kind = ONLINE_CITY.buildings[index]?.kind;
    if (!kind) return false;
    const themed = themedHubOccupants(kind);
    const talkers = themed.length ? themed : [hubResident(index)];
    return hasId(talkers, npcId) || keeperFor(kind).id === npcId;
  }

  const street = /^d(\d+)$/.exec(zone);
  if (street) {
    const district = Number(street[1]);
    return hasId(scheduledResidents(zone, now).map((x) => x.npc), npcId)
      || districtRegionalAnchor(district).id === npcId
      || districtFieldMedic(district).id === npcId;
  }

  const room = /^d(\d+)i(\d+)$/.exec(zone);
  if (room) {
    const district = Number(room[1]);
    const index = Number(room[2]);
    const kind = districtBuildingKind(index, district);
    if (!kind) return false;
    const scheduled = scheduledResidents(zone, now).map((x) => x.npc);
    const fallback = districtResident(district, index);
    const talkers = scheduled.length ? scheduled : [residentProfile(fallback.id) ? keeperFor(kind) : fallback];
    return hasId(talkers, npcId) || keeperFor(kind).id === npcId;
  }
  return false;
}
