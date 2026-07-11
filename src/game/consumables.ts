// METROPHAGE — consumables (data). Bought from the vendor (credits) or the Black Market
// ($METRO), used with the 1-5 hotkeys. Effects are data: GameScene.useConsumable applies
// `heal` / `shield` / `heat` generically, so adding a consumable here needs no code change.

export type ConsumableId = "medkit" | "repair" | "shield" | "stim" | "heatcharge";

export interface ConsumableDef {
  id: ConsumableId;
  name: string;
  klass: string; // icon key
  price: number; // vendor price (credits)
  metro: number; // Black-Market price ($METRO)
  desc: string;
  hex: string;
  heal?: number; // HP restored (Infinity = full heal)
  shield?: boolean; // refill shields to max
  heat?: number; // Heat added
}

export const CONSUMABLES: ConsumableDef[] = [
  { id: "medkit", name: "FIELD MEDKIT", klass: "MEDKIT", price: 55, metro: 35, desc: "+85 HP", hex: "#39ff88", heal: 85 },
  { id: "repair", name: "REPAIR KIT", klass: "MEDKIT", price: 25, metro: 18, desc: "+40 HP", hex: "#7dffb0", heal: 40 },
  { id: "shield", name: "SHIELD CELL", klass: "SHIELD", price: 30, metro: 22, desc: "Refill shields", hex: "#29e7ff", shield: true },
  { id: "stim", name: "COMBAT STIM", klass: "STIM", price: 40, metro: 28, desc: "+50 Heat · +25 HP", hex: "#ff2bd6", heat: 50, heal: 25 },
  { id: "heatcharge", name: "HEAT CHARGE", klass: "HEAT", price: 20, metro: 14, desc: "+40 Heat", hex: "#ffb13c", heat: 40 },
];

export const CONSUMABLE_KEYS: ConsumableId[] = ["medkit", "repair", "shield", "stim", "heatcharge"];

export function getConsumable(id: ConsumableId): ConsumableDef | undefined {
  return CONSUMABLES.find((c) => c.id === id);
}
