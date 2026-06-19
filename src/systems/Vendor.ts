import { Item, Rarity, rollItem, itemValue, sellValue } from "../game/items";
import { CONSUMABLES, ConsumableId } from "../game/consumables";
import Progression, { RESPEC_COST } from "./Progression";
import Inventory from "./Inventory";

/**
 * Single hub vendor: buy gear/consumables, sell loot, pay to respec. Stock is
 * regenerated per session (the fixer "restocks"); purchases land in the inventory
 * / consumable counts. No player trading (single-player).
 */
export default class Vendor {
  gearStock: Item[] = [];

  constructor(level: number) {
    this.restock(level);
  }

  restock(level: number) {
    // A spread of rarities so there's always something aspirational.
    const rarities: Rarity[] = ["standard", "tuned", "tuned", "blackice", "blackice"];
    this.gearStock = rarities.map((r) => rollItem(level + 2, 0, r));
  }

  buyGear(item: Item, prog: Progression, inv: Inventory): boolean {
    const price = itemValue(item);
    if (prog.currency < price || inv.full) return false;
    prog.spendCurrency(price);
    inv.add(item);
    this.gearStock = this.gearStock.filter((g) => g.id !== item.id);
    return true;
  }

  buyConsumable(id: ConsumableId, prog: Progression): boolean {
    const def = CONSUMABLES.find((c) => c.id === id);
    if (!def || prog.currency < def.price) return false;
    prog.spendCurrency(def.price);
    prog.addConsumable(id);
    return true;
  }

  sell(item: Item, prog: Progression, inv: Inventory): boolean {
    const idx = inv.items.indexOf(item);
    if (idx < 0) return false;
    inv.items.splice(idx, 1);
    prog.addCurrency(sellValue(item));
    return true;
  }

  respec(prog: Progression): boolean {
    return prog.respec();
  }

  get respecCost(): number {
    return RESPEC_COST;
  }
}
