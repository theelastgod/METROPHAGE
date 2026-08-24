-- Genesis Key deeds. On-chain mint is the door; D1 keeps furniture / guestbook / ₵ price.
-- Additive only. token n (1–50) → plot n-1 → zone est{n-1}. nft filled after ops mint.
ALTER TABLE estates ADD COLUMN nft TEXT;
ALTER TABLE estates ADD COLUMN token INTEGER;

UPDATE estates
SET token = CAST(substr(id, 4) AS INTEGER) + 1
WHERE token IS NULL
  AND id LIKE 'est%'
  AND length(id) > 3
  AND CAST(substr(id, 4) AS INTEGER) BETWEEN 0 AND 49;
