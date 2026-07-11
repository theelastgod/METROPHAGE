-- Authored NPC homes on THE ESTATES street — the neighbourhood is lived-in from day one.
-- Owners use the reserved "__npc_" prefix (logins starting with "__" are rejected, so no
-- player can claim the identity and liquidate the property). SPARROW's home makes the
-- FIXER's HOMESTEAD dialogue literal ("SPARROW's been three cycles in hers"); VELVET runs
-- a bar den; BORNE's furnished freight loft is listed FOR SALE as a premium starter home.
-- INSERT OR IGNORE: never clobbers a row that already exists (e.g. a player-owned home).
INSERT OR IGNORE INTO estates (id, owner, owner_name, price, for_sale, furniture, guestbook, updated) VALUES
  ('est7', '__npc_sparrow', 'SPARROW', 2500, 0,
   '[{"k":"bed","x":2,"y":2},{"k":"shelf","x":4,"y":2},{"k":"bookcase","x":5,"y":2},{"k":"lamp","x":1,"y":3},{"k":"rug","x":6,"y":4},{"k":"sofa","x":9,"y":3},{"k":"table","x":11,"y":3},{"k":"chair","x":12,"y":4},{"k":"plant","x":13,"y":2},{"k":"poster","x":3,"y":1},{"k":"aquarium","x":10,"y":7},{"k":"jukebox","x":1,"y":6},{"k":"crate","x":12,"y":8},{"k":"neon_sign","x":7,"y":1}]',
   '[{"n":"RIN","at":1783500000000,"s":"was here"},{"n":"OLD MAREK","at":1783550000000,"s":"the neon suits you"}]',
   1783600000000),
  ('est10', '__npc_velvet', 'VELVET', 2500, 0,
   '[{"k":"bar_counter","x":4,"y":3},{"k":"bar_counter","x":6,"y":3},{"k":"jukebox","x":9,"y":2},{"k":"neon_sign","x":6,"y":1},{"k":"sofa","x":2,"y":6},{"k":"sofa","x":10,"y":6},{"k":"table","x":6,"y":6},{"k":"chair","x":5,"y":7},{"k":"chair","x":8,"y":7},{"k":"lamp","x":1,"y":2},{"k":"lamp","x":12,"y":2},{"k":"vending","x":13,"y":7},{"k":"poster","x":3,"y":1}]',
   '[{"n":"VEX","at":1783520000000,"s":"rent?"}]',
   1783600000000),
  ('est11', '__npc_borne', 'BORNE', 4800, 1,
   '[{"k":"crate","x":2,"y":2},{"k":"crate","x":3,"y":2},{"k":"crate","x":2,"y":3},{"k":"locker","x":5,"y":2},{"k":"locker","x":6,"y":2},{"k":"server_rack","x":12,"y":2},{"k":"weapon_rack","x":11,"y":2},{"k":"desk","x":8,"y":4},{"k":"chair","x":9,"y":5},{"k":"lamp","x":1,"y":4},{"k":"rug","x":6,"y":6},{"k":"terminal","x":13,"y":4}]',
   '[]',
   1783600000000);
