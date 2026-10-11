-- Asset redesign (wadzz0 rebuild): run ONCE, BEFORE `prisma db push`.
--
-- 1. Music is no longer its own feature: a song is a normal asset with
--    mediaType MUSIC. Keep each song's artist in the asset description and
--    turn its SONG market listing into a normal one, so `db push` can drop
--    Song / Album / User_Song and the SONG enum value without losing anything.
-- 2. Existing assets were fully minted into storage when created, so every
--    copy up to their limit already exists on-chain: mintedCount = limit.

BEGIN;

UPDATE "Asset" a
SET "description" = CASE
    WHEN coalesce(a."description", '') = '' THEN 'Artist: ' || s."artist"
    ELSE a."description" || E'\n\nArtist: ' || s."artist"
  END
FROM "Song" s
WHERE s."assetId" = a."id" AND coalesce(s."artist", '') <> '';

UPDATE "MarketAsset" SET "type" = 'FAN' WHERE "type" = 'SONG';

-- Added by db push with default 0; set here when the column already exists,
-- otherwise run this statement again right after the push.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Asset' AND column_name = 'mintedCount') THEN
    UPDATE "Asset" SET "mintedCount" = coalesce("limit", 0) WHERE "mintedCount" = 0;
  END IF;
END $$;

COMMIT;

-- AFTER `prisma db push`:
-- UPDATE "Asset" SET "mintedCount" = coalesce("limit", 0) WHERE "mintedCount" = 0 AND "createdAt" < '2026-10-12';
