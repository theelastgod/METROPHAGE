-- Personal stash — account-wide safe storage, accessed at any TENEMENT lockbox
-- (district building interiors of kind "home"). Items JSON, mirrors inventory format.
ALTER TABLE players ADD COLUMN stash TEXT NOT NULL DEFAULT '[]';
