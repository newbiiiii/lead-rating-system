DROP INDEX IF EXISTS "lead_ratings_score_idx";--> statement-breakpoint
ALTER TABLE "automation_logs" ALTER COLUMN "company_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_logs" ADD COLUMN IF NOT EXISTS "lead_id" varchar(255);--> statement-breakpoint
ALTER TABLE "lead_ratings" ADD COLUMN IF NOT EXISTS "overall_rating" text NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_ratings" ADD COLUMN IF NOT EXISTS "suggestion" text NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_ratings" ADD COLUMN IF NOT EXISTS "think" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "crm_sync_status" varchar(20) DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "crm_synced_at" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_ratings_score_idx" ON "lead_ratings" ("overall_rating");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "automation_logs" ADD CONSTRAINT "automation_logs_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "lead_ratings" DROP COLUMN IF EXISTS "total_score";--> statement-breakpoint
ALTER TABLE "lead_ratings" DROP COLUMN IF EXISTS "breakdown";--> statement-breakpoint
ALTER TABLE "lead_ratings" DROP COLUMN IF EXISTS "confidence";--> statement-breakpoint
ALTER TABLE "lead_ratings" DROP COLUMN IF EXISTS "reasoning";--> statement-breakpoint
ALTER TABLE "lead_ratings" DROP COLUMN IF EXISTS "icebreaker";--> statement-breakpoint
ALTER TABLE "lead_ratings" DROP COLUMN IF EXISTS "model";--> statement-breakpoint
ALTER TABLE "lead_ratings" DROP COLUMN IF EXISTS "tokens_used";