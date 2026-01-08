CREATE TABLE IF NOT EXISTS "search_points" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"task_id" varchar(255) NOT NULL,
	"latitude" real NOT NULL,
	"longitude" real NOT NULL,
	"sequence_number" integer NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"results_found" integer DEFAULT 0,
	"results_saved" integer DEFAULT 0,
	"error" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "search_points_task_idx" ON "search_points" ("task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "search_points_status_idx" ON "search_points" ("task_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "search_points_sequence_idx" ON "search_points" ("task_id","sequence_number");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "search_points" ADD CONSTRAINT "search_points_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
