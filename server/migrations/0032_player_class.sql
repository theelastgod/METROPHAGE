-- Persist class kit across logins (client still may re-send; server is source of truth).
ALTER TABLE players ADD COLUMN class_id TEXT NOT NULL DEFAULT 'metrophage';
