CREATE TABLE "scan_listing_variant_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"variant_id" text NOT NULL,
	"price" integer,
	"currency" text,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scan_listing_variant_snapshot_status_check" CHECK ("scan_listing_variant_snapshot"."status" IN ('in_stock', 'out_of_stock', 'removed')),
	CONSTRAINT "scan_listing_variant_snapshot_price_check" CHECK ("scan_listing_variant_snapshot"."price" >= 0)
);
--> statement-breakpoint
ALTER TABLE "scan_listing" ADD COLUMN "brand" text;--> statement-breakpoint
ALTER TABLE "scan_listing" ADD COLUMN "manufacturer" text;--> statement-breakpoint
ALTER TABLE "scan_listing" ADD COLUMN "specifics" jsonb;--> statement-breakpoint
ALTER TABLE "scan_listing" ADD COLUMN "type" text;--> statement-breakpoint
ALTER TABLE "scan_listing" ADD COLUMN "search" "tsvector" GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce("scan_listing"."title", '')), 'A') ||
        setweight(to_tsvector('english', coalesce("scan_listing"."brand", '')), 'B')
      ) STORED;--> statement-breakpoint
ALTER TABLE "scan_listing_variant" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "scan_listing_variant" ADD COLUMN "mpn" text;--> statement-breakpoint
ALTER TABLE "scan_listing_variant" ADD COLUMN "upc" text;--> statement-breakpoint
ALTER TABLE "scan_listing_variant" ADD COLUMN "ean" text;--> statement-breakpoint
ALTER TABLE "scan_listing_variant" ADD COLUMN "isbn" text;--> statement-breakpoint
ALTER TABLE "scan_listing_variant" ADD COLUMN "gtin" text;--> statement-breakpoint
ALTER TABLE "scan_listing_variant_snapshot" ADD CONSTRAINT "scan_listing_variant_snapshot_variant_id_scan_listing_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."scan_listing_variant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scan_listing_variant_snapshot_history_idx" ON "scan_listing_variant_snapshot" USING btree ("variant_id","created_at","id");--> statement-breakpoint
CREATE INDEX "scan_listing_brand_idx" ON "scan_listing" USING btree ("brand");--> statement-breakpoint
CREATE INDEX "scan_listing_search_idx" ON "scan_listing" USING gin ("search");--> statement-breakpoint
CREATE INDEX "scan_listing_variant_upc_idx" ON "scan_listing_variant" USING btree ("upc");--> statement-breakpoint
CREATE INDEX "scan_listing_variant_ean_idx" ON "scan_listing_variant" USING btree ("ean");--> statement-breakpoint
CREATE INDEX "scan_listing_variant_gtin_idx" ON "scan_listing_variant" USING btree ("gtin");--> statement-breakpoint
CREATE INDEX "scan_listing_variant_isbn_idx" ON "scan_listing_variant" USING btree ("isbn");--> statement-breakpoint
CREATE INDEX "scan_listing_variant_mpn_idx" ON "scan_listing_variant" USING btree ("mpn");