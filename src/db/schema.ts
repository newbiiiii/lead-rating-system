import { pgTable, text, varchar, integer, timestamp, jsonb, real, boolean, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * 聚合任务表 - 用于批量管理多个子任务
 */
export const aggregateTasks = pgTable('aggregate_tasks', {
    id: varchar('id', { length: 255 }).primaryKey(),

    // 聚合任务基本信息
    name: text('name').notNull(),
    description: text('description'),        // 用户输入的需求描述
    keywords: jsonb('keywords'),              // 生成的关键词列表 string[]
    countries: jsonb('countries'),            // 选择的国家列表 string[]

    // 统计信息
    totalSubTasks: integer('total_sub_tasks').default(0),
    completedSubTasks: integer('completed_sub_tasks').default(0),
    failedSubTasks: integer('failed_sub_tasks').default(0),

    // 状态管理: pending, running, completed, failed, cancelled
    status: varchar('status', { length: 20 }).notNull().default('pending'),

    // 时间戳
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    statusIdx: index('aggregate_tasks_status_idx').on(table.status),
    createdIdx: index('aggregate_tasks_created_idx').on(table.createdAt),
}));

/**
 * 任务表 - 用于追溯所有爬取任务
 */
export const tasks = pgTable('tasks', {
    id: varchar('id', { length: 255 }).primaryKey(),

    // 聚合任务关联
    aggregateTaskId: varchar('aggregate_task_id', { length: 255 }).references(() => aggregateTasks.id),

    // 任务基本信息
    name: text('name').notNull(),
    description: text('description'),
    source: varchar('source', { length: 50 }).notNull(),

    // 搜索配置
    query: text('query').notNull(),
    targetCount: integer('target_count'),
    config: jsonb('config'),

    // 状态管理
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    progress: integer('progress').default(0),

    // 统计信息
    totalLeads: integer('total_leads').default(0),
    successLeads: integer('success_leads').default(0),
    failedLeads: integer('failed_leads').default(0),

    // 错误信息
    error: text('error'),

    // 时间戳
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    statusIdx: index('tasks_status_idx').on(table.status),
    sourceIdx: index('tasks_source_idx').on(table.source),
    createdIdx: index('tasks_created_idx').on(table.createdAt),
    aggregateTaskIdx: index('tasks_aggregate_task_idx').on(table.aggregateTaskId),
}));

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
 * 线索表 - 新架构，替代companies，支持任务关联
 */
export const leads = pgTable('leads', {
    id: varchar('id', { length: 255 }).primaryKey(),
    taskId: varchar('task_id', { length: 255 }).references(() => tasks.id),

    // 公司基本信息
    companyName: text('company_name').notNull(),
    domain: varchar('domain', { length: 255 }),
    website: text('website'),
    industry: varchar('industry', { length: 100 }),
    region: varchar('region', { length: 100 }),
    address: text('address'),

    // 公司规模
    employeeCount: integer('employee_count'),
    estimatedSize: varchar('estimated_size', { length: 20 }),

    // 评分（Google Maps）
    rating: real('rating'),
    reviewCount: integer('review_count'),

    // 原始数据
    rawData: jsonb('raw_data'),

    // 元数据
    source: varchar('source', { length: 50 }).notNull(),
    sourceUrl: text('source_url'),

    // AI评级状态
    ratingStatus: varchar('rating_status', { length: 20 }).default('pending'),
    ratingError: text('rating_error'), // 评分失败原因

    // CRM同步状态
    crmSyncStatus: varchar('crm_sync_status', { length: 20 }).default('pending'), // pending, synced, failed
    crmLeadId: varchar('crm_lead_id', { length: 50 }), // CRM系统返回的线索ID，存在则表示已同步
    crmSyncedAt: timestamp('crm_synced_at'),
    crmSyncError: text('crm_sync_error'), // 同步失败原因

    // Enrich（数据增强）状态
    enrichStatus: varchar('enrich_status', { length: 20 }).default('pending'), // pending, enriched, failed, skipped
    enrichedAt: timestamp('enriched_at'),
    enrichError: text('enrich_error'), // 增强失败原因

    // 时间戳
    scrapedAt: timestamp('scraped_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    taskIdx: index('leads_task_idx').on(table.taskId),
    domainIdx: index('leads_domain_idx').on(table.domain),
    ratingStatusIdx: index('leads_rating_status_idx').on(table.ratingStatus),
    enrichStatusIdx: index('leads_enrich_status_idx').on(table.enrichStatus),
}));

/**
 * 联系人表 - 支持一个公司多个联系人
 */
export const contacts = pgTable('contacts', {
    id: varchar('id', { length: 255 }).primaryKey(),
    leadId: varchar('lead_id', { length: 255 }).references(() => leads.id).notNull(),

    // 联系人信息
    name: varchar('name', { length: 255 }),
    title: varchar('title', { length: 255 }),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 100 }),
    mobile: varchar('mobile', { length: 100 }),

    // 社交媒体
    linkedinUrl: text('linkedin_url'),

    // 元数据
    source: varchar('source', { length: 50 }),
    isPrimary: boolean('is_primary').default(false),

    // 时间戳
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    leadIdx: index('contacts_lead_idx').on(table.leadId),
    emailIdx: index('contacts_email_idx').on(table.email),
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
 * 评级结果表 - 重命名为leadRatings，关联到leads
 */
export const leadRatings = pgTable('lead_ratings', {
    id: varchar('id', { length: 255 }).primaryKey(),
    leadId: varchar('lead_id', { length: 255 }).references(() => leads.id).notNull().unique(),

    overallRating: text('overall_rating').notNull(),
    suggestion: text('suggestion').notNull(),
    think: text('think'),

    ratedAt: timestamp('rated_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    leadIdx: index('lead_ratings_lead_idx').on(table.leadId),
    scoreIdx: index('lead_ratings_score_idx').on(table.overallRating),
}));

// 保留原ratings表用于向后兼容
export const ratings = pgTable('ratings', {
    id: varchar('id', { length: 255 }).primaryKey(),
    companyId: varchar('company_id', { length: 255 }).references(() => companies.id).notNull(),

    totalScore: real('total_score').notNull(),
    breakdown: jsonb('breakdown').notNull(),
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
    companyId: varchar('company_id', { length: 255 }).references(() => companies.id), // 可选，兼容旧数据
    leadId: varchar('lead_id', { length: 255 }).references(() => leads.id), // 新增关联
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

/**
 * 搜索点表 - 用于断点续传
 * 保存每个网格搜索点的坐标和执行状态
 */
export const searchPoints = pgTable('search_points', {
    id: varchar('id', { length: 255 }).primaryKey(),
    taskId: varchar('task_id', { length: 255 }).references(() => tasks.id).notNull(),

    // 搜索点坐标 (使用 numeric 类型以保持精度)
    latitude: real('latitude').notNull(),
    longitude: real('longitude').notNull(),

    // 位置信息
    sequenceNumber: integer('sequence_number').notNull(), // 在任务中的序号

    // 执行状态: pending, running, completed, failed, skipped
    status: varchar('status', { length: 20 }).notNull().default('pending'),

    // 结果统计
    resultsFound: integer('results_found').default(0),   // 本点找到的总结果数
    resultsSaved: integer('results_saved').default(0),   // 成功保存的结果数
    error: text('error'),                                 // 错误信息

    // 时间戳
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    taskIdx: index('search_points_task_idx').on(table.taskId),
    statusIdx: index('search_points_status_idx').on(table.taskId, table.status),
    sequenceIdx: index('search_points_sequence_idx').on(table.taskId, table.sequenceNumber),
}));


// Relations for new tables
export const aggregateTasksRelations = relations(aggregateTasks, ({ many }) => ({
    tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
    aggregateTask: one(aggregateTasks, {
        fields: [tasks.aggregateTaskId],
        references: [aggregateTasks.id],
    }),
    leads: many(leads),
    searchPoints: many(searchPoints),
}));

export const searchPointsRelations = relations(searchPoints, ({ one }) => ({
    task: one(tasks, {
        fields: [searchPoints.taskId],
        references: [tasks.id],
    }),
}));

export const leadsRelations = relations(leads, ({ one, many }) => ({
    task: one(tasks, {
        fields: [leads.taskId],
        references: [tasks.id],
    }),
    contacts: many(contacts),
    rating: one(leadRatings, {
        fields: [leads.id],
        references: [leadRatings.leadId],
    }),
}));

export const contactsRelations = relations(contacts, ({ one }) => ({
    lead: one(leads, {
        fields: [contacts.leadId],
        references: [leads.id],
    }),
}));

export const leadRatingsRelations = relations(leadRatings, ({ one }) => ({
    lead: one(leads, {
        fields: [leadRatings.leadId],
        references: [leads.id],
    }),
}));

// 原有Relations
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

// ============================================================
// 客户画像管理表
// ============================================================

/**
 * 业务线表 - 存储业务线分类（建材、成品、原料、机械等）
 */
export const businessLines = pgTable('business_lines', {
    id: varchar('id', { length: 255 }).primaryKey(),
    name: varchar('name', { length: 100 }).notNull().unique(), // 业务线标识名称
    displayName: varchar('display_name', { length: 100 }).notNull(), // 显示名称
    description: text('description'),
    apiKey: integer('api_key'), // 对应的API密钥ID
    sortOrder: integer('sort_order').default(0),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    nameIdx: index('business_lines_name_idx').on(table.name),
    activeIdx: index('business_lines_active_idx').on(table.isActive),
}));

/**
 * 客户画像表 - 存储每个业务线下的客户画像配置
 * 包含匹配关键词和评级提示词
 */
export const customerProfiles = pgTable('customer_profiles', {
    id: varchar('id', { length: 255 }).primaryKey(),
    businessLineId: varchar('business_line_id', { length: 255 }).references(() => businessLines.id).notNull(),

    // 画像基本信息
    name: varchar('name', { length: 100 }).notNull(), // 画像名称，如"墙板"、"地板"
    displayName: varchar('display_name', { length: 200 }), // 显示名称，如"墙板经销商"
    description: text('description'),

    // 匹配规则 - 用于从任务名称识别客户画像
    keywords: jsonb('keywords').notNull(), // string[] 匹配关键词数组

    // 评级提示词 - 用于AI评分
    ratingPrompt: text('rating_prompt').notNull(),

    // 状态控制
    isActive: boolean('is_active').default(true),
    sortOrder: integer('sort_order').default(0),

    // 时间戳
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    businessLineIdx: index('customer_profiles_business_line_idx').on(table.businessLineId),
    nameIdx: index('customer_profiles_name_idx').on(table.name),
    activeIdx: index('customer_profiles_active_idx').on(table.isActive),
}));

// 业务线关系
export const businessLinesRelations = relations(businessLines, ({ many }) => ({
    profiles: many(customerProfiles),
}));

// 客户画像关系
export const customerProfilesRelations = relations(customerProfiles, ({ one }) => ({
    businessLine: one(businessLines, {
        fields: [customerProfiles.businessLineId],
        references: [businessLines.id],
    }),
}));
