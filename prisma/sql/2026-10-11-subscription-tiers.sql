-- Membership tiers get a structured format: run ONCE, BEFORE `prisma db push`.
-- `features` was one HTML/plain-text string; it becomes a list with one perk
-- per paragraph / list item / line. New columns get their defaults.

BEGIN;

ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "color" TEXT NOT NULL DEFAULT 'green';
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "popular" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'Subscription' AND column_name = 'features') = 'text' THEN
    ALTER TABLE "Subscription" ADD COLUMN "features_list" TEXT[] NOT NULL DEFAULT '{}';
    UPDATE "Subscription" SET "features_list" = ARRAY(
      SELECT btrim(part)
      FROM regexp_split_to_table(
        replace(replace(
          regexp_replace(
            regexp_replace(coalesce("features", ''), '(</p>|</li>|<br\s*/?>)', E'\n', 'gi'),
            '<[^>]+>', '', 'g'),
          '&nbsp;', ' '), '&amp;', '&'),
        E'\n') AS part
      WHERE btrim(part) <> ''
    );
    ALTER TABLE "Subscription" DROP COLUMN "features";
    ALTER TABLE "Subscription" RENAME COLUMN "features_list" TO "features";
    ALTER TABLE "Subscription" ALTER COLUMN "features" DROP DEFAULT;
  END IF;
END $$;

COMMIT;
