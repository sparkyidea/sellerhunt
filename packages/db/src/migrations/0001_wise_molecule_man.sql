ALTER TABLE "scan_keyword" DROP CONSTRAINT "scan_keyword_marketplace_keyword_pk";--> statement-breakpoint
ALTER TABLE "scan_config" ALTER COLUMN "listing_scan_batch_size" SET DEFAULT 50;--> statement-breakpoint
ALTER TABLE "scan_config" ADD COLUMN "keyword_resolve_batch_size" integer DEFAULT 200 NOT NULL;--> statement-breakpoint
ALTER TABLE "scan_config" ADD COLUMN "keyword_llm_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "scan_config" ADD COLUMN "keyword_llm_batch_size" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "scan_config" ADD COLUMN "keyword_llm_model" text DEFAULT 'gpt-5-nano' NOT NULL;--> statement-breakpoint
ALTER TABLE "scan_keyword" ADD COLUMN "id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "scan_listing" ADD COLUMN "keyword_id" text;--> statement-breakpoint
ALTER TABLE "scan_listing" ADD COLUMN "keyword_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scan_listing" ADD CONSTRAINT "scan_listing_keyword_id_scan_keyword_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."scan_keyword"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scan_keyword_marketplace_keyword_unique" ON "scan_keyword" USING btree ("marketplace","keyword");--> statement-breakpoint
CREATE INDEX "scan_listing_keyword_id_idx" ON "scan_listing" USING btree ("keyword_id");