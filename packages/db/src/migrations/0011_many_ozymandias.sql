ALTER TABLE "scan_listing" RENAME COLUMN "updated_at" TO "last_scanned_at";--> statement-breakpoint
DROP INDEX "scan_listing_marketplace_updated_at_idx";--> statement-breakpoint
CREATE INDEX "scan_listing_marketplace_last_scanned_at_idx" ON "scan_listing" USING btree ("marketplace","last_scanned_at","id");