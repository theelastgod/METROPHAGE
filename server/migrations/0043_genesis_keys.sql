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

INSERT OR IGNORE INTO estates (id, owner, owner_name, price, for_sale, furniture, guestbook, updated, token)
SELECT 'est' || (value - 1), NULL, NULL, 60000, 1, '[]', '[]', 0, value
FROM json_each('[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50]');
