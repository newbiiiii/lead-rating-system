CREATE TABLE IF NOT EXISTS "aggregate_tasks" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"keywords" jsonb,
	"countries" jsonb,
	"total_sub_tasks" integer DEFAULT 0,
	"completed_sub_tasks" integer DEFAULT 0,
	"failed_sub_tasks" integer DEFAULT 0,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "business_lines" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"description" text,
	"api_key" integer,
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "business_lines_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_profiles" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"business_line_id" varchar(255) NOT NULL,
	"name" varchar(100) NOT NULL,
	"display_name" varchar(200),
	"description" text,
	"keywords" jsonb NOT NULL,
	"rating_prompt" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
/* ALTER TABLE "contacts" ALTER COLUMN "title" SET DATA TYPE varchar(255); */
/* ALTER TABLE "contacts" ALTER COLUMN "phone" SET DATA TYPE varchar(100); */
/* ALTER TABLE "contacts" ALTER COLUMN "mobile" SET DATA TYPE varchar(100); */
/* ALTER TABLE "leads" ADD COLUMN "rating_error" text; */
/* ALTER TABLE "leads" ADD COLUMN "crm_lead_id" varchar(50); */
/* ALTER TABLE "leads" ADD COLUMN "enrich_status" varchar(20) DEFAULT 'pending'; */
/* ALTER TABLE "leads" ADD COLUMN "enriched_at" timestamp; */
/* ALTER TABLE "leads" ADD COLUMN "enrich_error" text; */
/* ALTER TABLE "tasks" ADD COLUMN "aggregate_task_id" varchar(255); */
CREATE INDEX IF NOT EXISTS "aggregate_tasks_status_idx" ON "aggregate_tasks" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "aggregate_tasks_created_idx" ON "aggregate_tasks" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "business_lines_name_idx" ON "business_lines" ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "business_lines_active_idx" ON "business_lines" ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_profiles_business_line_idx" ON "customer_profiles" ("business_line_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_profiles_name_idx" ON "customer_profiles" ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_profiles_active_idx" ON "customer_profiles" ("is_active");--> statement-breakpoint
/* CREATE INDEX IF NOT EXISTS "leads_enrich_status_idx" ON "leads" ("enrich_status"); */
/* CREATE INDEX IF NOT EXISTS "tasks_aggregate_task_idx" ON "tasks" ("aggregate_task_id"); */
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_aggregate_task_id_aggregate_tasks_id_fk" FOREIGN KEY ("aggregate_task_id") REFERENCES "aggregate_tasks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_business_line_id_business_lines_id_fk" FOREIGN KEY ("business_line_id") REFERENCES "business_lines"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
