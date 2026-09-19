ALTER TABLE "scan_listing" DROP CONSTRAINT "scan_listing_item_sold_check";--> statement-breakpoint
ALTER TABLE "scan_listing" DROP CONSTRAINT "scan_listing_sold_last_24h_check";--> statement-breakpoint
ALTER TABLE "scan_listing" DROP CONSTRAINT "scan_listing_sold_last_30_days_check";--> statement-breakpoint
ALTER TABLE "scan_listing_snapshot" DROP CONSTRAINT "scan_listing_snapshot_item_sold_check";--> statement-breakpoint
ALTER TABLE "scan_listing_snapshot" DROP CONSTRAINT "scan_listing_snapshot_sold_last_24h_check";--> statement-breakpoint
ALTER TABLE "scan_listing_snapshot" DROP CONSTRAINT "scan_listing_snapshot_sold_last_30_days_check";