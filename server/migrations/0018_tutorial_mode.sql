-- Tutorial depth preference — quick (core loop) or full (every major system).
ALTER TABLE players ADD COLUMN tutorial_mode TEXT NOT NULL DEFAULT 'quick';