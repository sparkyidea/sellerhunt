-- SQL body replaced by hand (see .agents/rules/reference-generated-files.md,
-- "Hand-written migration SQL"). The snapshot and journal entry are drizzle-kit's.
--
-- drizzle-kit generated, for the id column:
--   ALTER TABLE "mobile_profile" ALTER COLUMN "id" SET DATA TYPE integer;
--   ALTER TABLE "mobile_profile" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (...);
-- The old ids are UUID text and cannot be cast to integer. Nothing references
-- them, so the text id is dropped and a fresh identity column becomes the
-- primary key: the database numbers every row, and that number is how the
-- admin UI, URLs and logs name a profile. `label` goes with the old id (rows
-- are numbered, not named); `assigned_worker` and `revision` arrive for worker
-- claims and the worker/admin write fence. The remaining statements are
-- drizzle-kit's, reordered so the column changes precede the index.
ALTER TABLE "mobile_profile" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mobile_profile" ADD COLUMN "assigned_worker" text;--> statement-breakpoint
CREATE UNIQUE INDEX "mobile_profile_app_assigned_worker_uidx" ON "mobile_profile" USING btree ("app","assigned_worker");--> statement-breakpoint
ALTER TABLE "mobile_profile" DROP COLUMN "label";--> statement-breakpoint
ALTER TABLE "mobile_profile" DROP CONSTRAINT "mobile_profile_pkey";--> statement-breakpoint
ALTER TABLE "mobile_profile" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "mobile_profile" ADD COLUMN "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mobile_profile_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);
