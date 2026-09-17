-- Hand-edited from drizzle-kit's `ALTER COLUMN "id" SET DATA TYPE integer`:
-- the old ids are UUID text and cannot be cast. Nothing references them, so
-- the text id is dropped and the identity column 0006 added as "index" becomes
-- the primary key — every row keeps the number it already shows.
DROP INDEX "mobile_profile_index_uidx";--> statement-breakpoint
ALTER TABLE "mobile_profile" DROP CONSTRAINT "mobile_profile_pkey";--> statement-breakpoint
ALTER TABLE "mobile_profile" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "mobile_profile" RENAME COLUMN "index" TO "id";--> statement-breakpoint
ALTER SEQUENCE "mobile_profile_index_seq" RENAME TO "mobile_profile_id_seq";--> statement-breakpoint
ALTER TABLE "mobile_profile" ADD PRIMARY KEY ("id");
