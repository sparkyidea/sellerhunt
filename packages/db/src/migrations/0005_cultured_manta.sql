ALTER TABLE "mobile_profile" ADD COLUMN "capture" text;--> statement-breakpoint
ALTER TABLE "mobile_profile" ADD COLUMN "claimed_at" timestamp;--> statement-breakpoint
ALTER TABLE "scan_listing" ADD COLUMN "qualified" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "mobile_profile_app_label_idx" ON "mobile_profile" USING btree ("app","label");--> statement-breakpoint
CREATE UNIQUE INDEX "mobile_profile_one_active_owner_per_box" ON "mobile_profile" USING btree ("app","label") WHERE "mobile_profile"."status" = 'active' AND "mobile_profile"."label" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "scan_listing_marketplace_qualified_last_scanned_at_idx" ON "scan_listing" USING btree ("marketplace","qualified","last_scanned_at");