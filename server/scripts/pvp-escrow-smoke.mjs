// Focused crash-safety smoke for migration 0030's PvP escrow state machine.
// Uses the system SQLite binary so it is fast, isolated, and does not require a
// running Worker or mutate Wrangler's local D1 state. Each transaction mirrors
// one sequential D1 batch; changes() gates its second statement on the first.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const migration = readFileSync(new URL("../migrations/0030_pvp_escrow.sql", import.meta.url), "utf8");
const sql = `
PRAGMA foreign_keys=ON;
CREATE TABLE players (
  id TEXT PRIMARY KEY,
  metro INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
INSERT INTO players (id, metro, updated_at) VALUES
  ('alpha', 100000, 0), ('beta', 100000, 0);
${migration}

-- Both contestants lock exactly one fixed buy-in.
BEGIN;
UPDATE players SET metro=metro-50000, updated_at=1
 WHERE id='alpha' AND metro>=50000;
INSERT INTO pvp_escrows
  (player, amount, zone, state, transfer_to, created_at, updated_at)
SELECT 'alpha', 50000, 'd0', 'active', NULL, 1, 1 WHERE changes()=1;
COMMIT;
BEGIN;
UPDATE players SET metro=metro-50000, updated_at=1
 WHERE id='beta' AND metro>=50000;
INSERT INTO pvp_escrows
  (player, amount, zone, state, transfer_to, created_at, updated_at)
SELECT 'beta', 50000, 'd0', 'active', NULL, 1, 1 WHERE changes()=1;
COMMIT;
SELECT 'locked',
       (SELECT metro FROM players WHERE id='alpha'),
       (SELECT metro FROM players WHERE id='beta'),
       (SELECT SUM(amount) FROM pvp_escrows);

-- Elimination moves the complete victim pot; replay is a no-op.
BEGIN;
UPDATE pvp_escrows
   SET amount=amount+(SELECT amount FROM pvp_escrows WHERE player='beta' AND state='active'), updated_at=2
 WHERE player='alpha' AND state='active'
   AND EXISTS (SELECT 1 FROM pvp_escrows WHERE player='beta' AND state='active');
DELETE FROM pvp_escrows
 WHERE player='beta' AND state='active' AND changes()=1;
COMMIT;
BEGIN;
UPDATE pvp_escrows
   SET amount=amount+(SELECT amount FROM pvp_escrows WHERE player='beta' AND state='active'), updated_at=2
 WHERE player='alpha' AND state='active'
   AND EXISTS (SELECT 1 FROM pvp_escrows WHERE player='beta' AND state='active');
DELETE FROM pvp_escrows
 WHERE player='beta' AND state='active' AND changes()=1;
COMMIT;
SELECT 'transferred',
       (SELECT amount FROM pvp_escrows WHERE player='alpha'),
       (SELECT COUNT(*) FROM pvp_escrows WHERE player='beta');

-- Cold-load recovery/refund consumes the row; replay cannot double-credit.
BEGIN;
UPDATE players
   SET metro=metro+(SELECT amount FROM pvp_escrows WHERE player='alpha' AND state='active'), updated_at=3
 WHERE id='alpha' AND EXISTS (SELECT 1 FROM pvp_escrows WHERE player='alpha' AND state='active');
DELETE FROM pvp_escrows
 WHERE player='alpha' AND state='active' AND changes()=1;
COMMIT;
BEGIN;
UPDATE players
   SET metro=metro+(SELECT amount FROM pvp_escrows WHERE player='alpha' AND state='active'), updated_at=3
 WHERE id='alpha' AND EXISTS (SELECT 1 FROM pvp_escrows WHERE player='alpha' AND state='active');
DELETE FROM pvp_escrows
 WHERE player='alpha' AND state='active' AND changes()=1;
COMMIT;
SELECT 'refunded',
       (SELECT metro FROM players WHERE id='alpha'),
       (SELECT metro FROM players WHERE id='beta'),
       (SELECT COUNT(*) FROM pvp_escrows);
`;

const run = spawnSync("sqlite3", [":memory:"], { input: sql, encoding: "utf8" });
if (run.status !== 0) {
  console.error(run.stderr || run.stdout || "sqlite escrow smoke failed");
  process.exit(1);
}

const lines = run.stdout.trim().split(/\r?\n/);
const expected = ["locked|50000|50000|100000", "transferred|100000|0", "refunded|150000|50000|0"];
const rejectionSql = `
CREATE TABLE players (id TEXT PRIMARY KEY, metro INTEGER NOT NULL, updated_at INTEGER NOT NULL);
INSERT INTO players VALUES ('funded', 100000, 0), ('poor', 49999, 0), ('loser', 100000, 0);
${migration}
BEGIN;
UPDATE players SET metro=metro-50000, updated_at=1 WHERE id='funded' AND metro>=50000;
INSERT INTO pvp_escrows SELECT 'funded', 50000, 'd0', 'active', NULL, 1, 1 WHERE changes()=1;
COMMIT;
-- D1 rolls an entire batch back when its duplicate insert fails. The explicit
-- rollback below gives the SQLite CLI the same behavior after it reports the error.
BEGIN;
UPDATE players SET metro=metro-50000, updated_at=2 WHERE id='funded' AND metro>=50000;
INSERT INTO pvp_escrows SELECT 'funded', 50000, 'd0', 'active', NULL, 2, 2 WHERE changes()=1;
ROLLBACK;
-- An underfunded first attempt is a complete no-op.
BEGIN;
UPDATE players SET metro=metro-50000, updated_at=2 WHERE id='poor' AND metro>=50000;
INSERT INTO pvp_escrows SELECT 'poor', 50000, 'd0', 'active', NULL, 2, 2 WHERE changes()=1;
COMMIT;
-- A transfer with no active winner pot leaves the victim pot recoverable.
BEGIN;
UPDATE players SET metro=metro-50000, updated_at=2 WHERE id='loser' AND metro>=50000;
INSERT INTO pvp_escrows SELECT 'loser', 50000, 'd0', 'active', NULL, 2, 2 WHERE changes()=1;
COMMIT;
BEGIN;
UPDATE pvp_escrows
   SET amount=amount+(SELECT amount FROM pvp_escrows WHERE player='loser' AND state='active'), updated_at=2
 WHERE player='poor' AND state='active'
   AND EXISTS (SELECT 1 FROM pvp_escrows WHERE player='loser' AND state='active');
DELETE FROM pvp_escrows WHERE player='loser' AND state='active' AND changes()=1;
COMMIT;
BEGIN;
UPDATE players
   SET metro=metro+(SELECT amount FROM pvp_escrows WHERE player='loser' AND state='active'), updated_at=3
 WHERE id='loser' AND EXISTS (SELECT 1 FROM pvp_escrows WHERE player='loser' AND state='active');
DELETE FROM pvp_escrows WHERE player='loser' AND state='active' AND changes()=1;
COMMIT;
SELECT 'guarded',
       (SELECT metro FROM players WHERE id='funded'),
       (SELECT metro FROM players WHERE id='poor'),
       (SELECT metro FROM players WHERE id='loser'),
       (SELECT COUNT(*) FROM pvp_escrows),
       (SELECT SUM(amount) FROM pvp_escrows);
`;
const rejected = spawnSync("sqlite3", [":memory:"], { input: rejectionSql, encoding: "utf8" });
const rejectionLine = rejected.stdout.trim().split(/\r?\n/).at(-1) ?? "";
const guarded = rejected.status !== 0 && rejectionLine === "guarded|50000|49999|100000|1|50000";
const ok = expected.every((line, i) => lines[i] === line) && guarded;
console.log(`\n[${ok ? "PASS" : "FAIL"}] PVP ESCROW — atomic lock, transfer, replay, and recovery refund`);
console.log("   data:", JSON.stringify([...lines, rejectionLine]));
if (!ok) process.exit(1);
