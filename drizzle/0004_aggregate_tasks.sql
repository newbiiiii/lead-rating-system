-- 创建聚合任务表
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

-- 添加索引
CREATE INDEX IF NOT EXISTS "aggregate_tasks_status_idx" ON "aggregate_tasks" USING btree ("status");
CREATE INDEX IF NOT EXISTS "aggregate_tasks_created_idx" ON "aggregate_tasks" USING btree ("created_at");

-- 在tasks表上添加aggregate_task_id列
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "aggregate_task_id" varchar(255);

-- 添加外键约束
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tasks_aggregate_task_id_aggregate_tasks_id_fk'
    ) THEN
        ALTER TABLE "tasks" ADD CONSTRAINT "tasks_aggregate_task_id_aggregate_tasks_id_fk" 
        FOREIGN KEY ("aggregate_task_id") REFERENCES "aggregate_tasks"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
    END IF;
END $$;

-- 添加索引
CREATE INDEX IF NOT EXISTS "tasks_aggregate_task_idx" ON "tasks" USING btree ("aggregate_task_id");
