CREATE SEQUENCE "public"."scan_observation_sequence" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "scan_listing_variant_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"variant_id" text NOT NULL,
	"observation_sequence" bigint NOT NULL,
	"scan_started_at" timestamp NOT NULL,
	"scanned_at" timestamp NOT NULL,
	"price" integer,
	"currency" text,
	"item_sold" integer,
	CONSTRAINT "scan_variant_snapshot_window_check" CHECK ("scan_listing_variant_snapshot"."scan_started_at" <= "scan_listing_variant_snapshot"."scanned_at"),
	CONSTRAINT "scan_variant_snapshot_price_check" CHECK ("scan_listing_variant_snapshot"."price" >= 0),
	CONSTRAINT "scan_variant_snapshot_sales_check" CHECK ("scan_listing_variant_snapshot"."item_sold" >= 0)
);
--> statement-breakpoint
ALTER TABLE "scan_listing_snapshot" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "scan_listing_snapshot" CASCADE;--> statement-breakpoint
DROP INDEX "scan_listing_last_scanned_at_idx";--> statement-breakpoint
DROP INDEX "scan_listing_marketplace_last_scanned_at_idx";--> statement-breakpoint
DROP INDEX "scan_listing_variant_listing_id_idx";--> statement-breakpoint
DROP INDEX "scan_listing_variant_last_scanned_at_idx";--> statement-breakpoint
ALTER TABLE "scan_listing" ADD COLUMN "has_variations" boolean NOT NULL;--> statement-breakpoint
ALTER TABLE "scan_listing" ADD COLUMN "last_observation_sequence" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "scan_listing_variant" ADD COLUMN "is_synthetic" boolean NOT NULL;--> statement-breakpoint
ALTER TABLE "scan_listing_variant" ADD COLUMN "sku" text;--> statement-breakpoint
ALTER TABLE "scan_listing_variant" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "scan_listing_variant" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "scan_listing_variant" ADD COLUMN "item_sold" integer;--> statement-breakpoint
ALTER TABLE "scan_listing_variant" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "scan_listing_variant_snapshot" ADD CONSTRAINT "scan_listing_variant_snapshot_variant_id_scan_listing_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."scan_listing_variant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scan_variant_snapshot_observation_unique" ON "scan_listing_variant_snapshot" USING btree ("variant_id","observation_sequence");--> statement-breakpoint
CREATE INDEX "scan_variant_snapshot_history_idx" ON "scan_listing_variant_snapshot" USING btree ("variant_id","scanned_at","id");--> statement-breakpoint
CREATE INDEX "scan_variant_snapshot_sequence_idx" ON "scan_listing_variant_snapshot" USING btree ("observation_sequence");--> statement-breakpoint
CREATE INDEX "scan_listing_variant_current_idx" ON "scan_listing_variant" USING btree ("listing_id") WHERE "scan_listing_variant"."status" IS DISTINCT FROM 'removed';--> statement-breakpoint
ALTER TABLE "scan_listing" DROP COLUMN "variant";--> statement-breakpoint
ALTER TABLE "scan_listing" DROP COLUMN "price";--> statement-breakpoint
ALTER TABLE "scan_listing" DROP COLUMN "currency";--> statement-breakpoint
ALTER TABLE "scan_listing" DROP COLUMN "last_scanned_at";--> statement-breakpoint
ALTER TABLE "scan_listing_variant" DROP COLUMN "last_scanned_at";--> statement-breakpoint
ALTER TABLE "scan_listing_variant" ADD CONSTRAINT "scan_listing_variant_status_check" CHECK ("scan_listing_variant"."status" IN ('in_stock', 'out_of_stock', 'removed'));--> statement-breakpoint
ALTER TABLE "scan_listing_variant" ADD CONSTRAINT "scan_listing_variant_price_check" CHECK ("scan_listing_variant"."price" >= 0);--> statement-breakpoint
ALTER TABLE "scan_listing_variant" ADD CONSTRAINT "scan_listing_variant_sales_check" CHECK ("scan_listing_variant"."item_sold" >= 0);