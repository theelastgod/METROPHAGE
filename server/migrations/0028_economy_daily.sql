-- Economy telemetry: daily credit flows by source, per zone.
-- flow: 'emit' (game creates credits) | 'burn' (credits destroyed by a sink).
-- Player↔player transfers (trades, market price, guild bank) are net-zero and
-- deliberately not recorded. Bridge flows live in metro_deposits/withdrawals.
CREATE TABLE IF NOT EXISTS economy_daily (
  day TEXT NOT NULL,           -- UTC YYYY-MM-DD
  zone TEXT NOT NULL,
  flow TEXT NOT NULL,          -- emit | burn
  kind TEXT NOT NULL,          -- kill, quest, daily, vendor, forge, estates, …
  credits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, zone, flow, kind)
);
CREATE INDEX IF NOT EXISTS idx_economy_daily_day ON economy_daily(day);
