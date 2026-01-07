CREATE TABLE IF NOT EXISTS "automation_logs" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"company_id" varchar(255) NOT NULL,
	"rating_id" varchar(255),
	"action_type" varchar(50) NOT NULL,
	"action_data" jsonb,
	"status" varchar(20) NOT NULL,
	"error" text,
	"executed_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "companies" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"domain" varchar(255),
	"website" text,
	"industry" varchar(100),
	"region" varchar(100),
	"email" varchar(255),
	"phone" varchar(50),
	"employee_count" integer,
	"estimated_size" varchar(20),
	"raw_data" jsonb,
	"source" varchar(50) NOT NULL,
	"source_url" text,
	"scraped_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contacts" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"lead_id" varchar(255) NOT NULL,
	"name" varchar(255),
	"title" varchar(100),
	"email" varchar(255),
	"phone" varchar(50),
	"mobile" varchar(50),
	"linkedin_url" text,
	"source" varchar(50),
	"is_primary" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "intent_signals" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"company_id" varchar(255) NOT NULL,
	"signal_type" varchar(50) NOT NULL,
	"title" text,
	"content" text,
	"metadata" jsonb,
	"detected_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_ratings" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"lead_id" varchar(255) NOT NULL,
	"total_score" real NOT NULL,
	"breakdown" jsonb NOT NULL,
	"confidence" real NOT NULL,
	"reasoning" text NOT NULL,
	"icebreaker" text,
	"model" varchar(50),
	"tokens_used" integer,
	"rated_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lead_ratings_lead_id_unique" UNIQUE("lead_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leads" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"task_id" varchar(255),
	"company_name" text NOT NULL,
	"domain" varchar(255),
	"website" text,
	"industry" varchar(100),
	"region" varchar(100),
	"address" text,
	"employee_count" integer,
	"estimated_size" varchar(20),
	"rating" real,
	"review_count" integer,
	"raw_data" jsonb,
	"source" varchar(50) NOT NULL,
	"source_url" text,
	"rating_status" varchar(20) DEFAULT 'pending',
	"scraped_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ratings" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"company_id" varchar(255) NOT NULL,
	"total_score" real NOT NULL,
	"breakdown" jsonb NOT NULL,
	"confidence" real NOT NULL,
	"reasoning" text NOT NULL,
	"icebreaker" text,
	"model" varchar(50),
	"tokens_used" integer,
	"rated_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_metrics" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"task_type" varchar(50) NOT NULL,
	"total_count" integer DEFAULT 0,
	"success_count" integer DEFAULT 0,
	"failed_count" integer DEFAULT 0,
	"date" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"source" varchar(50) NOT NULL,
	"query" text NOT NULL,
	"target_count" integer,
	"config" jsonb,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"progress" integer DEFAULT 0,
	"total_leads" integer DEFAULT 0,
	"success_leads" integer DEFAULT 0,
	"failed_leads" integer DEFAULT 0,
	"error" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_automation_idx" ON "automation_logs" ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "automation_status_idx" ON "automation_logs" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "domain_idx" ON "companies" ("domain");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "source_idx" ON "companies" ("source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_lead_idx" ON "contacts" ("lead_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_email_idx" ON "contacts" ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_signals_idx" ON "intent_signals" ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signal_type_idx" ON "intent_signals" ("signal_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_ratings_lead_idx" ON "lead_ratings" ("lead_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_ratings_score_idx" ON "lead_ratings" ("total_score");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_task_idx" ON "leads" ("task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_domain_idx" ON "leads" ("domain");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_rating_status_idx" ON "leads" ("rating_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_ratings_idx" ON "ratings" ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "score_idx" ON "ratings" ("total_score");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "metrics_date_idx" ON "task_metrics" ("date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "metrics_type_idx" ON "task_metrics" ("task_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_status_idx" ON "tasks" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_source_idx" ON "tasks" ("source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_created_idx" ON "tasks" ("created_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "automation_logs" ADD CONSTRAINT "automation_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "automation_logs" ADD CONSTRAINT "automation_logs_rating_id_ratings_id_fk" FOREIGN KEY ("rating_id") REFERENCES "ratings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contacts" ADD CONSTRAINT "contacts_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "intent_signals" ADD CONSTRAINT "intent_signals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lead_ratings" ADD CONSTRAINT "lead_ratings_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leads" ADD CONSTRAINT "leads_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ratings" ADD CONSTRAINT "ratings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
