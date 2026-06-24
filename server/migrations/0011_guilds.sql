-- Guilds ("Cells") — player-run resistance groups. Cross-zone (members are scattered
-- across zone DOs), so the registry MUST live in shared D1, not any one DO. A zone DO
-- mutates these rows for its connected members; the rows are the single source of truth.
CREATE TABLE IF NOT EXISTS guilds (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL UNIQUE,
  tag          TEXT    NOT NULL,
  leader       TEXT    NOT NULL,            -- player id of the current leader
  bank_credits INTEGER NOT NULL DEFAULT 0,  -- shared bank (atomic guarded moves)
  bank_cores   INTEGER NOT NULL DEFAULT 0,
  xp           INTEGER NOT NULL DEFAULT 0,  -- progression (grows with deposits) → cell level
  created_at   INTEGER NOT NULL
);

-- One cell per player (PK = player). rank ∈ leader | officer | member.
CREATE TABLE IF NOT EXISTS guild_members (
  player    TEXT    PRIMARY KEY,
  guild_id  INTEGER NOT NULL,
  rank      TEXT    NOT NULL DEFAULT 'member',
  joined_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_guild_members_gid ON guild_members(guild_id);

-- Pending invites (an invitee may be offline / in another zone when invited).
CREATE TABLE IF NOT EXISTS guild_invites (
  player   TEXT    NOT NULL,
  guild_id INTEGER NOT NULL,
  at       INTEGER NOT NULL,
  PRIMARY KEY (player, guild_id)
);
