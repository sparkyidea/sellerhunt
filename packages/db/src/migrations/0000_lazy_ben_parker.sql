CREATE TYPE "public"."mobile_profile_status" AS ENUM('active', 'dead');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"issuer" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passkey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"aaguid" text
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	"two_factor_enabled" boolean DEFAULT false,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mobile_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"app" text NOT NULL,
	"label" text,
	"credentials" text NOT NULL,
	"access_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token" text,
	"refresh_token_expires_at" timestamp,
	"status" "mobile_profile_status" DEFAULT 'active' NOT NULL,
	"last_used_at" timestamp,
	"last_success_at" timestamp,
	"failed_at" timestamp,
	"failure_reason" text,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"cooldown_until" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_config" (
	"marketplace" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"keyword_rescan_after" integer DEFAULT 1440 NOT NULL,
	"seller_rescan_after" integer DEFAULT 1440 NOT NULL,
	"listing_rescan_after" integer DEFAULT 1440 NOT NULL,
	"max_search_pages" integer DEFAULT 10 NOT NULL,
	"max_listing_pages" integer DEFAULT 50 NOT NULL,
	"min_item_sold" integer DEFAULT 0 NOT NULL,
	"min_price_cents" integer DEFAULT 0 NOT NULL,
	"max_price_cents" integer,
	"min_sold_last_24h" integer,
	"keyword_batch_size" integer DEFAULT 20 NOT NULL,
	"seller_batch_size" integer DEFAULT 20 NOT NULL,
	"listing_batch_size" integer DEFAULT 50 NOT NULL,
	"listing_scan_batch_size" integer DEFAULT 20 NOT NULL,
	"listing_scan_concurrency" integer DEFAULT 1 NOT NULL,
	"listing_scan_delay_min_ms" integer DEFAULT 200 NOT NULL,
	"listing_scan_delay_max_ms" integer DEFAULT 800 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_keyword" (
	"marketplace" text NOT NULL,
	"keyword" text NOT NULL,
	"source" text NOT NULL,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_scanned_at" timestamp,
	"dead_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scan_keyword_marketplace_keyword_pk" PRIMARY KEY("marketplace","keyword")
);
--> statement-breakpoint
CREATE TABLE "scan_listing" (
	"id" text PRIMARY KEY NOT NULL,
	"marketplace" text NOT NULL,
	"reference" text NOT NULL,
	"seller_id" text,
	"title" text NOT NULL,
	"description" text,
	"condition" text,
	"marketplace_category_reference" text,
	"category_path" text[],
	"image_urls" text[],
	"url" text,
	"variant" boolean DEFAULT false NOT NULL,
	"good_till_cancelled" boolean,
	"started_at" timestamp,
	"ended_at" timestamp,
	"price" integer,
	"currency" text,
	"item_sold" integer,
	"sold_last_24h" integer,
	"sold_last_30_days" integer,
	"monitored" boolean DEFAULT false NOT NULL,
	"last_scanned_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_listing_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"scanned_at" timestamp DEFAULT now() NOT NULL,
	"price" integer,
	"item_sold" integer,
	"sold_last_24h" integer,
	"sold_last_30_days" integer
);
--> statement-breakpoint
CREATE TABLE "scan_listing_variant" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"reference" text NOT NULL,
	"attributes" jsonb,
	"image_urls" text[],
	"price" integer,
	"last_scanned_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_seller" (
	"id" text PRIMARY KEY NOT NULL,
	"marketplace" text NOT NULL,
	"reference" text NOT NULL,
	"display_name" text,
	"logo_url" text,
	"feedback_score" integer,
	"feedback_percent" numeric(5, 4),
	"total_items_sold" integer,
	"monitored" boolean DEFAULT false NOT NULL,
	"last_scanned_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_listing" ADD CONSTRAINT "scan_listing_seller_id_scan_seller_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."scan_seller"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_listing_snapshot" ADD CONSTRAINT "scan_listing_snapshot_listing_id_scan_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."scan_listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_listing_variant" ADD CONSTRAINT "scan_listing_variant_listing_id_scan_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."scan_listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_accountId_uidx" ON "account" USING btree ("issuer","account_id");--> statement-breakpoint
CREATE INDEX "passkey_userId_idx" ON "passkey" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "passkey_credentialID_idx" ON "passkey" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factor_secret_idx" ON "two_factor" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "two_factor_userId_idx" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "mobile_profile_app_status_idx" ON "mobile_profile" USING btree ("app","status");--> statement-breakpoint
CREATE INDEX "mobile_profile_last_used_at_idx" ON "mobile_profile" USING btree ("last_used_at");--> statement-breakpoint
CREATE INDEX "mobile_profile_cooldown_until_idx" ON "mobile_profile" USING btree ("cooldown_until");--> statement-breakpoint
CREATE INDEX "scan_keyword_marketplace_last_scanned_at_idx" ON "scan_keyword" USING btree ("marketplace","last_scanned_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scan_listing_marketplace_reference_unique" ON "scan_listing" USING btree ("marketplace","reference");--> statement-breakpoint
CREATE INDEX "scan_listing_seller_id_idx" ON "scan_listing" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "scan_listing_item_sold_idx" ON "scan_listing" USING btree ("item_sold");--> statement-breakpoint
CREATE INDEX "scan_listing_sold_last_24h_idx" ON "scan_listing" USING btree ("sold_last_24h");--> statement-breakpoint
CREATE INDEX "scan_listing_sold_last_30_days_idx" ON "scan_listing" USING btree ("sold_last_30_days");--> statement-breakpoint
CREATE INDEX "scan_listing_last_scanned_at_idx" ON "scan_listing" USING btree ("last_scanned_at");--> statement-breakpoint
CREATE INDEX "scan_listing_marketplace_category_reference_idx" ON "scan_listing" USING btree ("marketplace_category_reference");--> statement-breakpoint
CREATE INDEX "scan_listing_marketplace_last_scanned_at_idx" ON "scan_listing" USING btree ("marketplace","last_scanned_at");--> statement-breakpoint
CREATE INDEX "scan_listing_snapshot_listing_id_scanned_at_idx" ON "scan_listing_snapshot" USING btree ("listing_id","scanned_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scan_listing_variant_listing_id_reference_unique" ON "scan_listing_variant" USING btree ("listing_id","reference");--> statement-breakpoint
CREATE INDEX "scan_listing_variant_listing_id_idx" ON "scan_listing_variant" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "scan_listing_variant_last_scanned_at_idx" ON "scan_listing_variant" USING btree ("last_scanned_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scan_seller_marketplace_reference_unique" ON "scan_seller" USING btree ("marketplace","reference");--> statement-breakpoint
CREATE INDEX "scan_seller_feedback_score_idx" ON "scan_seller" USING btree ("feedback_score");--> statement-breakpoint
CREATE INDEX "scan_seller_last_scanned_at_idx" ON "scan_seller" USING btree ("last_scanned_at");--> statement-breakpoint
CREATE INDEX "scan_seller_marketplace_last_scanned_at_idx" ON "scan_seller" USING btree ("marketplace","last_scanned_at");