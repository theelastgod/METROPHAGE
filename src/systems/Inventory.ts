import { ModBag, ZERO_MODS, addMods } from "../game/stats";
import { Item, Slot, SLOTS } from "../game/items";

export interface InventoryData {
  items: Item[];
  equipped: Record<string, Item | null>;
}

/** Bag + 4 equip slots. Equipped items contribute a ModBag via mods(). */
export default class Inventory {
  readonly cap = 24;
  items: Item[] = [];
  equipped: Record<Slot, Item | null> = {
    weapon: null,
    implant: null,
    armor: null,
    chip: null,
  };

  get full(): boolean {
    return this.items.length >= this.cap;
  }

  add(item: Item): boolean {
    if (this.full) return false;
    this.items.push(item);
    return true;
  }

  /** Equip a bag item into its slot; any previously-equipped item returns to the bag. */
  equip(item: Item): boolean {
    const idx = this.items.indexOf(item);
    if (idx < 0) return false;
    this.items.splice(idx, 1);
    const prev = this.equipped[item.slot];
    this.equipped[item.slot] = item;
    if (prev) this.items.push(prev);
    return true;
  }

  unequip(slot: Slot): boolean {
    const it = this.equipped[slot];
    if (!it || this.full) return false;
    this.equipped[slot] = null;
    this.items.push(it);
    return true;
  }

  /** Aggregate modifiers from all equipped items. */
  mods(): ModBag {
    let m = ZERO_MODS;
    for (const slot of SLOTS) {
      const it = this.equipped[slot];
      if (it) m = addMods(m, it.mods);
    }
    return m;
  }

  toData(): InventoryData {
    return { items: [...this.items], equipped: { ...this.equipped } };
  }

  load(data: InventoryData | undefined | null) {
    if (!data) return;
    this.items = Array.isArray(data.items) ? data.items.slice(0, this.cap) : [];
    this.equipped = { weapon: null, implant: null, armor: null, chip: null };
    for (const slot of SLOTS) {
      const it = data.equipped?.[slot];
      if (it) this.equipped[slot] = it as Item;
    }
  }
}
