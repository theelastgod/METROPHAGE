-- Memory fragments recovered from ICE dives (instanced dungeon zones v0–v6).
-- JSON array of fragment ids, claim-once per player — the dive core can be
-- re-channelled by other players, but a given mind only recovers a memory once.
ALTER TABLE players ADD COLUMN fragments TEXT;
