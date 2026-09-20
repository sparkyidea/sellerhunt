CREATE TABLE "scan_listing_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"item_sold" integer,
	"sold_last_24h" integer,
	"sold_last_30_days" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scan_listing_snapshot_item_sold_check" CHECK ("scan_listing_snapshot"."item_sold" >= 0),
	CONSTRAINT "scan_listing_snapshot_sold_last_24h_check" CHECK ("scan_listing_snapshot"."sold_last_24h" >= 0),
	CONSTRAINT "scan_listing_snapshot_sold_last_30_days_check" CHECK ("scan_listing_snapshot"."sold_last_30_days" >= 0)
);
--> statement-breakpoint
ALTER TABLE "scan_listing_variant_snapshot" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "scan_listing_variant_snapshot" CASCADE;--> statement-breakpoint
ALTER TABLE "scan_listing_variant" DROP CONSTRAINT "scan_listing_variant_sales_check";--> statement-breakpoint
ALTER TABLE "scan_listing" DROP CONSTRAINT "scan_listing_keyword_id_scan_keyword_id_fk";
--> statement-breakpoint
DROP INDEX "scan_listing_keyword_id_idx";--> statement-breakpoint
DROP INDEX "scan_listing_marketplace_last_scanned_at_idx";--> statement-breakpoint
ALTER TABLE "scan_listing_snapshot" ADD CONSTRAINT "scan_listing_snapshot_listing_id_scan_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."scan_listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scan_listing_snapshot_history_idx" ON "scan_listing_snapshot" USING btree ("listing_id","created_at","id");--> statement-breakpoint
CREATE INDEX "scan_listing_marketplace_updated_at_idx" ON "scan_listing" USING btree ("marketplace","updated_at","id");--> statement-breakpoint
ALTER TABLE "scan_listing" DROP COLUMN "keyword_id";--> statement-breakpoint
ALTER TABLE "scan_listing" DROP COLUMN "keyword_attempts";--> statement-breakpoint
ALTER TABLE "scan_listing" DROP COLUMN "has_variations";--> statement-breakpoint
ALTER TABLE "scan_listing" DROP COLUMN "good_till_cancelled";--> statement-breakpoint
ALTER TABLE "scan_listing" DROP COLUMN "monitored";--> statement-breakpoint
ALTER TABLE "scan_listing" DROP COLUMN "last_observation_sequence";--> statement-breakpoint
ALTER TABLE "scan_listing" DROP COLUMN "last_scanned_at";--> statement-breakpoint
ALTER TABLE "scan_listing_variant" DROP COLUMN "is_synthetic";--> statement-breakpoint
ALTER TABLE "scan_listing_variant" DROP COLUMN "title";--> statement-breakpoint
ALTER TABLE "scan_listing_variant" DROP COLUMN "item_sold";--> statement-breakpoint
ALTER TABLE "scan_listing" ADD CONSTRAINT "scan_listing_item_sold_check" CHECK ("scan_listing"."item_sold" >= 0);--> statement-breakpoint
ALTER TABLE "scan_listing" ADD CONSTRAINT "scan_listing_sold_last_24h_check" CHECK ("scan_listing"."sold_last_24h" >= 0);--> statement-breakpoint
ALTER TABLE "scan_listing" ADD CONSTRAINT "scan_listing_sold_last_30_days_check" CHECK ("scan_listing"."sold_last_30_days" >= 0);--> statement-breakpoint
DROP SEQUENCE "public"."scan_observation_sequence";