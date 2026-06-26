-- Tutorial drill yard — per-player onboarding before the live city (one-way deploy).
ALTER TABLE players ADD COLUMN tutorial_done INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN tutorial_step INTEGER NOT NULL DEFAULT 0;