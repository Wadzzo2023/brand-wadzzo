-- Multi-platform (white-label) support. One-time, run ONCE against the shared DB
-- before deploying code that uses the new columns. The project uses `prisma db push`,
-- which cannot do this safely: the platform FKs need the "wadzzo" Platform row to
-- exist first. After this script, `prisma db push` reports no changes.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/sql/2026-10-07-multi-platform.sql
--
-- Every existing row (including coin balances) is assigned to "wadzzo" via the column defaults.

BEGIN;

-- CreateTable
CREATE TABLE "Platform" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isRoot" BOOLEAN NOT NULL DEFAULT false,
    "webUrl" TEXT NOT NULL,
    "brandUrl" TEXT NOT NULL,
    "assetCode" TEXT,
    "assetIssuer" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Platform_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Platform" ("id", "name", "isRoot", "webUrl", "brandUrl", "assetCode", "updatedAt") VALUES
    ('wadzzo', 'Wadzzo', true, 'https://web.wadzzo.com', 'https://brand.wadzzo.com', 'Wadzzo', CURRENT_TIMESTAMP),
    ('clintoncounty', 'Clinton County', false, 'https://web.clintoncounty-ia.gov', 'https://brand.clintoncounty-ia.gov', NULL, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "platformId" TEXT NOT NULL DEFAULT 'wadzzo';

-- AlterTable
ALTER TABLE "Creator" ADD COLUMN     "platformId" TEXT NOT NULL DEFAULT 'wadzzo';

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "platformId" TEXT NOT NULL DEFAULT 'wadzzo';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "signupPlatformId" TEXT NOT NULL DEFAULT 'wadzzo';

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "platformId" TEXT NOT NULL DEFAULT 'wadzzo';

-- AlterTable
ALTER TABLE "MarketAsset" ADD COLUMN     "platformId" TEXT NOT NULL DEFAULT 'wadzzo';

-- AlterTable
ALTER TABLE "Admin" ADD COLUMN     "platformId" TEXT NOT NULL DEFAULT 'wadzzo';

-- AlterTable
ALTER TABLE "Hotspot" ADD COLUMN     "platformId" TEXT NOT NULL DEFAULT 'wadzzo';

-- AlterTable
ALTER TABLE "LocationGroup" ADD COLUMN     "platformId" TEXT NOT NULL DEFAULT 'wadzzo';

-- AlterTable
ALTER TABLE "LocationConsumer" ADD COLUMN     "platformId" TEXT NOT NULL DEFAULT 'wadzzo';

-- AlterTable
ALTER TABLE "Bounty" ADD COLUMN     "platformId" TEXT NOT NULL DEFAULT 'wadzzo';

-- AlterTable
ALTER TABLE "BountyParticipant" ADD COLUMN     "platformId" TEXT NOT NULL DEFAULT 'wadzzo';

-- AlterTable
ALTER TABLE "Redeem" ADD COLUMN     "platformId" TEXT NOT NULL DEFAULT 'wadzzo';

-- AlterTable
ALTER TABLE "QRItem" ADD COLUMN     "platformId" TEXT NOT NULL DEFAULT 'wadzzo';

-- AlterTable
ALTER TABLE "CreatorEvent" ADD COLUMN     "platformId" TEXT NOT NULL DEFAULT 'wadzzo';

-- AlterTable
ALTER TABLE "CreatorAnnouncement" ADD COLUMN     "platformId" TEXT NOT NULL DEFAULT 'wadzzo';

-- AlterTable
ALTER TABLE "MapEmbed" ADD COLUMN     "platformId" TEXT NOT NULL DEFAULT 'wadzzo';

-- AlterTable
ALTER TABLE "Mural" ADD COLUMN     "platformId" TEXT NOT NULL DEFAULT 'wadzzo';

-- AlterTable
ALTER TABLE "CoinBalance" DROP CONSTRAINT "CoinBalance_pkey",
ADD COLUMN     "platformId" TEXT NOT NULL DEFAULT 'wadzzo',
ADD CONSTRAINT "CoinBalance_pkey" PRIMARY KEY ("userId", "platformId");

-- AlterTable
ALTER TABLE "CoinLedger" ADD COLUMN     "platformId" TEXT NOT NULL DEFAULT 'wadzzo';


-- CreateTable
CREATE TABLE "UserPlatform" (
    "userId" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "signUpMethod" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPlatform_pkey" PRIMARY KEY ("userId","platformId")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "targetPlatformId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserPlatform_platformId_firstSeenAt_idx" ON "UserPlatform"("platformId", "firstSeenAt");

-- CreateIndex
CREATE INDEX "AuditLog_platformId_createdAt_idx" ON "AuditLog"("platformId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "Subscription_platformId_idx" ON "Subscription"("platformId");

-- CreateIndex
CREATE INDEX "Creator_platformId_idx" ON "Creator"("platformId");

-- CreateIndex
CREATE INDEX "Post_platformId_idx" ON "Post"("platformId");

-- CreateIndex
CREATE INDEX "Asset_platformId_idx" ON "Asset"("platformId");

-- CreateIndex
CREATE INDEX "MarketAsset_platformId_idx" ON "MarketAsset"("platformId");

-- CreateIndex
CREATE INDEX "Admin_platformId_idx" ON "Admin"("platformId");

-- CreateIndex
CREATE INDEX "Hotspot_platformId_idx" ON "Hotspot"("platformId");

-- CreateIndex
CREATE INDEX "LocationGroup_platformId_idx" ON "LocationGroup"("platformId");

-- CreateIndex
CREATE INDEX "LocationConsumer_platformId_idx" ON "LocationConsumer"("platformId");

-- CreateIndex
CREATE INDEX "Bounty_platformId_idx" ON "Bounty"("platformId");

-- CreateIndex
CREATE INDEX "BountyParticipant_platformId_idx" ON "BountyParticipant"("platformId");

-- CreateIndex
CREATE INDEX "Redeem_platformId_idx" ON "Redeem"("platformId");

-- CreateIndex
CREATE INDEX "QRItem_platformId_idx" ON "QRItem"("platformId");

-- CreateIndex
CREATE INDEX "CreatorEvent_platformId_idx" ON "CreatorEvent"("platformId");

-- CreateIndex
CREATE INDEX "CreatorAnnouncement_platformId_idx" ON "CreatorAnnouncement"("platformId");

-- CreateIndex
CREATE INDEX "MapEmbed_platformId_idx" ON "MapEmbed"("platformId");

-- CreateIndex
CREATE INDEX "Mural_platformId_idx" ON "Mural"("platformId");

-- CreateIndex
CREATE INDEX "CoinLedger_platformId_idx" ON "CoinLedger"("platformId");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creator" ADD CONSTRAINT "Creator_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_signupPlatformId_fkey" FOREIGN KEY ("signupPlatformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketAsset" ADD CONSTRAINT "MarketAsset_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admin" ADD CONSTRAINT "Admin_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hotspot" ADD CONSTRAINT "Hotspot_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationGroup" ADD CONSTRAINT "LocationGroup_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationConsumer" ADD CONSTRAINT "LocationConsumer_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bounty" ADD CONSTRAINT "Bounty_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BountyParticipant" ADD CONSTRAINT "BountyParticipant_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redeem" ADD CONSTRAINT "Redeem_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QRItem" ADD CONSTRAINT "QRItem_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorEvent" ADD CONSTRAINT "CreatorEvent_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorAnnouncement" ADD CONSTRAINT "CreatorAnnouncement_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapEmbed" ADD CONSTRAINT "MapEmbed_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mural" ADD CONSTRAINT "Mural_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinBalance" ADD CONSTRAINT "CoinBalance_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinLedger" ADD CONSTRAINT "CoinLedger_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPlatform" ADD CONSTRAINT "UserPlatform_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPlatform" ADD CONSTRAINT "UserPlatform_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Every existing user joined on wadzzo.
INSERT INTO "UserPlatform" ("userId", "platformId", "signUpMethod", "firstSeenAt", "lastSeenAt")
SELECT "id", 'wadzzo', "firstSignUpMethod", COALESCE("joinedAt", CURRENT_TIMESTAMP), COALESCE("joinedAt", CURRENT_TIMESTAMP)
FROM "User"
ON CONFLICT DO NOTHING;

COMMIT;
