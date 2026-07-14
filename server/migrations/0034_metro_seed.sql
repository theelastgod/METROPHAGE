-- Developer treasury seed (1% of $METRO supply) counted in the cash-out pool.
-- Ops records the seed once; poolMetro = seed + deposits - withdrawals.
CREATE TABLE IF NOT EXISTS metro_seed (
  id         TEXT    PRIMARY KEY,
  metro      REAL    NOT NULL,
  note       TEXT,
  created_at INTEGER NOT NULL
);
