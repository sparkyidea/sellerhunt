-- Intentional listing-only reset for the variant redesign; no backfill.
-- Stop old scan workers/readers before applying this migration.
DELETE FROM "scan_listing_snapshot";
--> statement-breakpoint
DELETE FROM "scan_listing_variant";
--> statement-breakpoint
DELETE FROM "scan_listing";
