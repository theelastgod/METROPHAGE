import type { BuildingKind } from "../world/city";

// METROPHAGE — map legend. Maps each building kind (and special markers) to a colour +
// label so the city minimap / world map read at a glance. When real icon art lands
// (assets/ui/icon_*.png), the renderer can swap the coloured dot for the matching icon
// keyed by `icon` — until then the colour + label carry the meaning.

export interface LegendEntry {
  color: number;
  label: string;
  icon: string; // future PNG key (see ASSET LIST), e.g. "icon_hospital"
}

export const BUILDING_LEGEND: Record<BuildingKind, LegendEntry> = {
  hospital: { color: 0x39ff88, label: "Hospital · heal", icon: "icon_hospital" },
  clinic: { color: 0x7dffb0, label: "Med-Clinic · heal", icon: "icon_hospital" },
  hotel: { color: 0xffb13c, label: "Hotel · rest", icon: "icon_hotel" },
  subway: { color: 0x29e7ff, label: "Subway · THE UNDERLINE", icon: "icon_subway" },
  stadium: { color: 0xff3b6b, label: "Arena · PvP", icon: "icon_stadium" },
  citycenter: { color: 0x4d8cff, label: "Civic Spire", icon: "icon_citycenter" },
  shop: { color: 0x00e5ff, label: "Store", icon: "icon_shop" },
  bar: { color: 0xff79c6, label: "Bar", icon: "icon_bar" },
  guild: { color: 0x6ab0ff, label: "Runners' Guild · jobs", icon: "icon_guild" },
  den: { color: 0xff2bd6, label: "Back Room · fence", icon: "icon_fence" },
  home: { color: 0xf7a23c, label: "Residence", icon: "icon_home" },
};

/** Non-building markers on the map. */
export const MARKER_LEGEND = {
  player: { color: 0xeafdff, label: "You", icon: "icon_player" },
  metro: { color: 0xff2bd6, label: "Black Market · $METRO", icon: "icon_metro" },
  quest: { color: 0xf7ff3c, label: "Quest-giver", icon: "icon_quest" },
} as const;

/** Order shown in the world-map legend (landmarks first — the things you go looking for). */
export const LEGEND_ORDER: BuildingKind[] = [
  "hospital", "hotel", "subway", "stadium", "citycenter", "shop", "bar", "guild", "clinic", "den", "home",
];
