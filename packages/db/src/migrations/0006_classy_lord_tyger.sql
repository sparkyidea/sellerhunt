DROP INDEX "mobile_profile_app_label_uidx";--> statement-breakpoint
ALTER TABLE "mobile_profile" ADD COLUMN "index" integer NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "mobile_profile_index_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);--> statement-breakpoint
ALTER TABLE "mobile_profile" ADD COLUMN "assigned_worker" text;--> statement-breakpoint
CREATE UNIQUE INDEX "mobile_profile_index_uidx" ON "mobile_profile" USING btree ("index");--> statement-breakpoint
CREATE UNIQUE INDEX "mobile_profile_app_assigned_worker_uidx" ON "mobile_profile" USING btree ("app","assigned_worker");--> statement-breakpoint
ALTER TABLE "mobile_profile" DROP COLUMN "label";