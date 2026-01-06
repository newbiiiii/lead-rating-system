import { pgTable, text, varchar, integer, timestamp, jsonb, real, boolean, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * 公司数据表
 */
export const companies = pgTable('companies', {
    id: varchar('id', { length: 255 }).primaryKey(),
    name: text('name').notNull(),
    domain: varchar('domain', { length: 255 }),
    website: text('website'),
    industry: varchar('industry', { length: 100 }),
    region: varchar('region', { length: 100 }),

    // 联系信息
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 50 }),

    // 规模信息
    employeeCount: integer('employee_count'),
    estimatedSize: varchar('estimated_size', { length: 20 }),

    // 原始数据
    rawData: jsonb('raw_data'),

    // 元数据
    source: varchar('source', { length: 50 }).notNull(),
    sourceUrl: text('source_url'),
    scrapedAt: timestamp('scraped_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    domainIdx: index('domain_idx').on(table.domain),
    sourceIdx: index('source_idx').on(table.source),
}));

/**
 * 意向信号表
 */
export const intentSignals = pgTable('intent_signals', {
    id: varchar('id', { length: 255 }).primaryKey(),
    companyId: varchar('company_id', { length: 255 }).references(() => companies.id).notNull(),

    signalType: varchar('signal_type', { length: 50 }).notNull(), // job_posting, funding, news
    title: text('title'),
    content: text('content'),
    metadata: jsonb('metadata'),

    detectedAt: timestamp('detected_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    companyIdx: index('company_signals_idx').on(table.companyId),
    typeIdx: index('signal_type_idx').on(table.signalType),
}));

/**
 * 评级结果表
 */
export const ratings = pgTable('ratings', {
    id: varchar('id', { length: 255 }).primaryKey(),
    companyId: varchar('company_id', { length: 255 }).references(() => companies.id).notNull(),

    totalScore: real('total_score').notNull(),
    breakdown: jsonb('breakdown').notNull(), // { firmographics, intentSignals, painPoints }
    confidence: real('confidence').notNull(),
    reasoning: text('reasoning').notNull(),
    icebreaker: text('icebreaker'),

    model: varchar('model', { length: 50 }),
    tokensUsed: integer('tokens_used'),

    ratedAt: timestamp('rated_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    companyIdx: index('company_ratings_idx').on(table.companyId),
    scoreIdx: index('score_idx').on(table.totalScore),
}));

/**
 * 流转记录表
 */
export const automationLogs = pgTable('automation_logs', {
    id: varchar('id', { length: 255 }).primaryKey(),
    companyId: varchar('company_id', { length: 255 }).references(() => companies.id).notNull(),
    ratingId: varchar('rating_id', { length: 255 }).references(() => ratings.id),

    actionType: varchar('action_type', { length: 50 }).notNull(), // notify, crm_push, email_sequence
    actionData: jsonb('action_data'),
    status: varchar('status', { length: 20 }).notNull(), // success, failed, pending
    error: text('error'),

    executedAt: timestamp('executed_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    companyIdx: index('company_automation_idx').on(table.companyId),
    statusIdx: index('automation_status_idx').on(table.status),
}));

/**
 * 任务队列元数据表（可选，用于追踪）
 */
export const taskMetrics = pgTable('task_metrics', {
    id: varchar('id', { length: 255 }).primaryKey(),
    taskType: varchar('task_type', { length: 50 }).notNull(), // scrape, process, rate, automate

    totalCount: integer('total_count').default(0),
    successCount: integer('success_count').default(0),
    failedCount: integer('failed_count').default(0),

    date: timestamp('date').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    dateIdx: index('metrics_date_idx').on(table.date),
    typeIdx: index('metrics_type_idx').on(table.taskType),
}));

// Relations
export const companiesRelations = relations(companies, ({ many }) => ({
    intentSignals: many(intentSignals),
    ratings: many(ratings),
    automationLogs: many(automationLogs),
}));

export const intentSignalsRelations = relations(intentSignals, ({ one }) => ({
    company: one(companies, {
        fields: [intentSignals.companyId],
        references: [companies.id],
    }),
}));

export const ratingsRelations = relations(ratings, ({ one }) => ({
    company: one(companies, {
        fields: [ratings.companyId],
        references: [companies.id],
    }),
}));
