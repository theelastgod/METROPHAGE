// METROPHAGE — consumables (data). Bought from the vendor, used with 1/2/3.
// Effects are applied by GameScene.useConsumable(); this is just the catalog.

export type ConsumableId = "repair" | "shield" | "heatcharge";

export interface ConsumableDef {
  id: ConsumableId;
  name: string;
  price: number;
  desc: string;
  hex: string;
}

export const CONSUMABLES: ConsumableDef[] = [
  { id: "repair", name: "REPAIR KIT", price: 25, desc: "+40 HP", hex: "#39ff88" },
  { id: "shield", name: "SHIELD CELL", price: 30, desc: "Refill shields", hex: "#29e7ff" },
  { id: "heatcharge", name: "HEAT CHARGE", price: 20, desc: "+40 Heat", hex: "#ff2bd6" },
];

export const CONSUMABLE_KEYS: ConsumableId[] = ["repair", "shield", "heatcharge"];
