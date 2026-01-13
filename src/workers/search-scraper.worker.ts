/**
 * Google Search Scraper Worker
 * 消费 search-scrape 队列，从 Google 搜索结果中获取公司信息
 */

import 'dotenv/config';
import { Worker, Job, Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { logger as baseLogger } from '../utils/logger';
const logger = baseLogger.child({ service: 'search-scraper' });
import { configLoader } from '../config/config-loader';
import { db } from '../db';
import { tasks, leads, contacts, aggregateTasks } from '../db/schema';
import { eq, sql, and } from 'drizzle-orm';
import { GoogleSearchAdapter } from '../scraper/adapters/google-search.adapter';
import type { ScrapeParams } from '../scraper/base.adapter';
import { eventEmitter } from '../utils/event-emitter';

const redisConfig = configLoader.get('database.redis');

const redis = {
    host: redisConfig.host,
    port: redisConfig.port,
    password: redisConfig.password,
};

interface SearchScrapeJobData {
    query: string;
    limit?: number;
    priority?: number;
    config?: {
        maxPages?: number;
        region?: string;
        language?: string;
        searchOperator?: string;
    };
    taskId?: string;
    aggregateTaskId?: string;
}

class SearchScraperWorker {
    private worker: Worker;
    private adapter: GoogleSearchAdapter;
    private searchScrapeQueue: Queue;
    private ratingQueue: Queue;

    constructor() {
        // 初始化适配器
        this.adapter = new GoogleSearchAdapter();

        // 创建队列引用
        this.searchScrapeQueue = new Queue('search-scrape', { connection: redis });
        this.ratingQueue = new Queue('rating', { connection: redis });

        // 创建 Worker
        this.worker = new Worker<SearchScrapeJobData>(
            'search-scrape',
            async (job: Job<SearchScrapeJobData>) => {
                return await this.processJob(job);
            },
            {
                connection: redis,
                concurrency: 1,  // 每次只运行一个搜索任务
                settings: {
                    backoffStrategy: (attemptsMade: number) => {
                        return Math.min(5000 * Math.pow(2, attemptsMade - 1), 20000);
                    }
                }
            }
        );

        this.setupEventHandlers();
        this.recoverInterruptedTasks();
    }

    /**
     * 恢复中断的任务
     */
    private async recoverInterruptedTasks() {
        try {
            const runningTasks = await db.select()
                .from(tasks)
                .where(
                    and(
                        eq(tasks.source, 'google_search'),
                        eq(tasks.status, 'running')
                    )
                );

            if (runningTasks.length === 0) {
                logger.info('[任务恢复] 没有发现未完成的搜索任务');
                return;
            }

            logger.info(`[任务恢复] 发现 ${runningTasks.length} 个未完成的搜索任务，正在恢复...`);

            for (const task of runningTasks) {
                await this.searchScrapeQueue.add(
                    `search-recovery-${task.id}`,
                    {
                        query: task.query,
                        limit: task.targetCount || 50,
                        config: task.config as any,
                        taskId: task.id
                    },
                    { priority: 1 }
                );
                logger.info(`[任务恢复] 任务 ${task.id} (${task.name}) 已重新加入队列`);
            }
        } catch (error: any) {
            logger.error('[任务恢复] 恢复任务时出错:', error.message);
        }
    }

    /**
     * 更新聚合任务进度
     */
    private async updateAggregateTaskProgress(aggregateTaskId: string, type: 'completed' | 'failed') {
        try {
            if (type === 'completed') {
                await db.update(aggregateTasks)
                    .set({
                        completedSubTasks: sql`${aggregateTasks.completedSubTasks} + 1`,
                        updatedAt: new Date()
                    })
                    .where(eq(aggregateTasks.id, aggregateTaskId));
            } else {
                await db.update(aggregateTasks)
                    .set({
                        failedSubTasks: sql`${aggregateTasks.failedSubTasks} + 1`,
                        updatedAt: new Date()
                    })
                    .where(eq(aggregateTasks.id, aggregateTaskId));
            }

            // 检查是否全部完成
            const aggTask = await db.query.aggregateTasks.findFirst({
                where: eq(aggregateTasks.id, aggregateTaskId)
            });

            if (aggTask) {
                const total = aggTask.totalSubTasks || 0;
                const completed = aggTask.completedSubTasks || 0;
                const failed = aggTask.failedSubTasks || 0;

                if (completed + failed >= total) {
                    const finalStatus = completed > 0 ? 'completed' : 'failed';
                    if (!['completed', 'failed', 'cancelled'].includes(aggTask.status)) {
                        await db.update(aggregateTasks)
                            .set({
                                status: finalStatus,
                                completedAt: new Date(),
                                updatedAt: new Date()
                            })
                            .where(eq(aggregateTasks.id, aggregateTaskId));
                        logger.info(`[聚合任务结束] ${aggTask.name} - ${finalStatus}`);
                    }
                }
            }
        } catch (error) {
            logger.error(`[聚合任务更新失败] ${aggregateTaskId}:`, error);
        }
    }

    /**
     * 处理搜索任务
     */
    private async processJob(job: Job<SearchScrapeJobData>) {
        const { query, limit = 50, config, taskId: providedTaskId } = job.data;

        logger.info(`[DEBUG] SearchScraperWorker received job ${job.id}`);
        logger.info(`[DEBUG] Job Data: ${JSON.stringify(job.data)}`);

        // 任务管理
        const taskName = `Google Search - ${query}`;
        let taskId: string;
        let isResume = false;

        if (providedTaskId) {
            taskId = providedTaskId;

            const existingTask = await db.query.tasks.findFirst({
                where: eq(tasks.id, taskId)
            });

            if (existingTask) {
                // 检查任务状态
                if (['cancelled', 'completed', 'failed'].includes(existingTask.status)) {
                    logger.warn(`[任务跳过] 任务 ${taskId} 处于 ${existingTask.status} 状态`);
                    return { skipped: true, reason: `Task status is ${existingTask.status}` };
                }

                // 检查聚合任务状态
                if (existingTask.aggregateTaskId) {
                    const aggTask = await db.query.aggregateTasks.findFirst({
                        where: eq(aggregateTasks.id, existingTask.aggregateTaskId)
                    });
                    if (aggTask && ['cancelled', 'completed'].includes(aggTask.status)) {
                        logger.warn(`[任务跳过] 聚合任务已终止`);
                        await db.update(tasks)
                            .set({ status: 'cancelled', error: 'Parent aggregate task terminated' })
                            .where(eq(tasks.id, taskId));
                        return { skipped: true, reason: 'Aggregate task terminated' };
                    }
                }

                if (existingTask.status !== 'running') {
                    await db.update(tasks)
                        .set({ status: 'running', startedAt: new Date() })
                        .where(eq(tasks.id, taskId));
                } else {
                    isResume = true;
                }

                logger.info(`\n${'='.repeat(60)}`);
                logger.info(`[搜索任务启动] ${existingTask.name}`);
                logger.info(`[任务ID] ${taskId}`);
                logger.info(`${'='.repeat(60)}\n`);
            } else {
                // 创建新任务记录
                await db.insert(tasks).values({
                    id: taskId,
                    name: taskName,
                    source: 'google_search',
                    query,
                    targetCount: limit,
                    config: config || {},
                    status: 'running',
                    startedAt: new Date(),
                    aggregateTaskId: job.data.aggregateTaskId
                });
            }
        } else {
            // 创建新任务
            taskId = randomUUID();
            await db.insert(tasks).values({
                id: taskId,
                name: taskName,
                source: 'google_search',
                query,
                targetCount: limit,
                config: config || {},
                status: 'running',
                startedAt: new Date()
            });

            logger.info(`\n${'='.repeat(60)}`);
            logger.info(`[搜索任务开始] ${taskName}`);
            logger.info(`[任务ID] ${taskId}`);
            logger.info(`[目标数量] ${limit} 条`);
            logger.info(`${'='.repeat(60)}\n`);
        }

        // 发送任务开始事件
        await eventEmitter.emit({
            type: 'task_start',
            jobId: job.id!,
            timestamp: new Date().toISOString(),
            data: { source: 'google_search', query, totalCount: limit }
        });

        let rawData: any[] = [];
        let savedCount = 0;
        let validationFailedCount = 0;

        // 增量保存回调
        const onBatchComplete = async (batch: any[]) => {
            for (const raw of batch) {
                if (!this.adapter.validate(raw)) {
                    validationFailedCount++;
                    await db.update(tasks)
                        .set({ failedLeads: sql`${tasks.failedLeads} + 1` })
                        .where(eq(tasks.id, taskId));
                    continue;
                }

                const standardData = this.adapter.transform(raw);

                // 辅助函数
                const truncate = (str: string | undefined, maxLen: number) =>
                    str ? (str.length > maxLen ? str.substring(0, maxLen) : str) : undefined;

                try {
                    const leadId = randomUUID();

                    await db.insert(leads).values({
                        id: leadId,
                        taskId,
                        companyName: standardData.name,
                        domain: truncate(standardData.domain, 255),
                        website: standardData.website,
                        industry: truncate(standardData.industry, 100),
                        region: truncate(standardData.region, 100),
                        rawData: raw.data as any,
                        source: 'google_search',
                        sourceUrl: standardData.sourceUrl,
                        ratingStatus: 'pending',
                        scrapedAt: standardData.scrapedAt
                    });

                    // 如果有联系信息
                    if (standardData.phone || standardData.email) {
                        await db.insert(contacts).values({
                            id: randomUUID(),
                            leadId,
                            phone: standardData.phone,
                            email: standardData.email,
                            isPrimary: true,
                            source: 'scraped'
                        });
                    }

                    // 推送到评分队列
                    try {
                        await this.ratingQueue.add('rate-lead', {
                            leadId: leadId
                        }, {
                            priority: 10,
                            removeOnComplete: true,
                            removeOnFail: { count: 100 }
                        });
                    } catch (err) {
                        logger.warn(`[队列推送失败] 无法推送到评分队列`, err);
                    }

                    savedCount++;

                    await db.update(tasks)
                        .set({
                            totalLeads: sql`${tasks.totalLeads} + 1`,
                            successLeads: sql`${tasks.successLeads} + 1`
                        })
                        .where(eq(tasks.id, taskId));

                    logger.info(`[线索 ${savedCount}] ${standardData.name}`);
                    logger.info(`  └─ 网站: ${standardData.website || '(无)'}`);

                } catch (error: any) {
                    logger.error(`[保存失败] ${standardData.name} - ${error?.message}`);
                    await db.update(tasks)
                        .set({ failedLeads: sql`${tasks.failedLeads} + 1` })
                        .where(eq(tasks.id, taskId));
                }
            }
        };

        try {
            // 执行搜索
            rawData = await this.adapter.scrape({
                query,
                limit,
                config,
                onBatchComplete,
                taskId
            } as ScrapeParams);

            logger.info(`\n[搜索完成] 共找到 ${rawData.length} 条结果`);

            // 更新任务状态
            const currentTask = await db.query.tasks.findFirst({
                where: eq(tasks.id, taskId)
            });

            if (currentTask?.status !== 'cancelled') {
                await db.update(tasks)
                    .set({
                        status: 'completed',
                        completedAt: new Date(),
                        progress: 100
                    })
                    .where(eq(tasks.id, taskId));

                if (currentTask?.aggregateTaskId) {
                    await this.updateAggregateTaskProgress(currentTask.aggregateTaskId, 'completed');
                }

                logger.info(`[任务完成] 状态已更新为 completed`);
            }

            // 统计摘要
            logger.info(`\n${'─'.repeat(60)}`);
            logger.info(`[统计摘要]`);
            logger.info(`  任务ID: ${taskId}`);
            logger.info(`  总计搜索: ${rawData.length} 条`);
            logger.info(`  验证失败: ${validationFailedCount} 条`);
            logger.info(`  成功保存: ${savedCount} 条`);
            logger.info(`${'='.repeat(60)}\n`);

            await eventEmitter.emit({
                type: 'task_complete',
                jobId: job.id!,
                timestamp: new Date().toISOString(),
                data: {
                    message: `任务完成, 成功保存 ${savedCount}/${rawData.length} 条`,
                    stats: {
                        scraped: rawData.length,
                        saved: savedCount,
                        failed: validationFailedCount
                    }
                }
            });

            return {
                taskId,
                scraped: rawData.length,
                saved: savedCount,
                failed: validationFailedCount
            };

        } catch (error: any) {
            const attemptsMade = job.attemptsMade || 0;
            const maxAttempts = 3;
            const isLastAttempt = attemptsMade >= maxAttempts - 1;

            if (isLastAttempt) {
                await db.update(tasks)
                    .set({
                        status: 'failed',
                        error: `Failed after ${maxAttempts} attempts: ${error.message}`,
                        completedAt: new Date()
                    })
                    .where(eq(tasks.id, taskId));

                const currentTask = await db.query.tasks.findFirst({
                    where: eq(tasks.id, taskId)
                });
                if (currentTask?.aggregateTaskId) {
                    await this.updateAggregateTaskProgress(currentTask.aggregateTaskId, 'failed');
                }

                logger.error(`[任务失败] ${taskId} - 所有重试已用尽:`, error.message);
            } else {
                logger.warn(`[任务重试] ${taskId} - 尝试 ${attemptsMade + 1}/${maxAttempts} 失败:`, error.message);
            }

            throw error;
        }
    }

    private setupEventHandlers() {
        this.worker.on('completed', (job) => {
            logger.info(`✓ 搜索任务完成: ${job.id}`);
        });

        this.worker.on('failed', (job, err) => {
            logger.error(`✗ 搜索任务失败: ${job?.id}`, err.message);
        });

        this.worker.on('error', (err) => {
            logger.error('Search Worker 错误:', err);
        });

        logger.info('✓ Search Scraper Worker 已启动');
    }

    async close() {
        logger.info('关闭 Search Scraper Worker...');
        await this.worker.close();
        await this.ratingQueue.close();
        await this.searchScrapeQueue.close();
        await this.adapter.close();
    }
}

// 启动 Worker
const worker = new SearchScraperWorker();

// 优雅关闭
process.on('SIGTERM', async () => {
    logger.info('收到 SIGTERM 信号');
    await worker.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    logger.info('收到 SIGINT 信号');
    await worker.close();
    process.exit(0);
});
