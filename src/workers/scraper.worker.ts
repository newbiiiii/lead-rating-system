/**
 * 爬虫 Worker
 * 消费爬取任务并将数据推送到处理队列
 */

import 'dotenv/config';
import { Worker, Job, Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';
import { configLoader } from '../config/config-loader';
import { db } from '../db';
import { tasks, leads, contacts, companies, searchPoints } from '../db/schema';
import { eq, sql, and } from 'drizzle-orm';
import { GoogleMapsAdapter } from '../scraper/adapters/google-maps.adapter';
import type { ScrapeParams } from '../scraper/base.adapter';
import { eventEmitter } from '../utils/event-emitter';

const redisConfig = configLoader.get('database.redis');
const queueConfig = configLoader.get('queue.queues.scrape');

const redis = {
    host: redisConfig.host,
    port: redisConfig.port,
    password: redisConfig.password,
};

interface ScrapeJobData {
    source: 'google_maps' | 'linkedin' | 'qichacha';
    query: string;
    limit: number;
    priority?: number;
    config?: any;  // 包含geolocation等配置
}

class ScraperWorker {
    private worker: Worker;
    private adapters: Record<string, any> = {};
    private scrapeQueue: any;
    private ratingQueue: any;

    constructor() {
        // 初始化适配器
        this.adapters['google_maps'] = new GoogleMapsAdapter();

        // 创建队列引用（用于恢复任务）
        const Queue = require('bullmq').Queue;
        this.scrapeQueue = new Queue('scrape', { connection: redis });

        // 初始化评分队列
        this.ratingQueue = new Queue('rating', { connection: redis });

        // 创建 Worker
        this.worker = new Worker<ScrapeJobData>(
            'scrape',
            async (job: Job<ScrapeJobData>) => {
                return await this.processJob(job);
            },
            {
                connection: redis,
                concurrency: 1,  // 每次只运行一个爬虫任务
                limiter: queueConfig.rate_limit,
                // 重试配置
                settings: {
                    backoffStrategy: (attemptsMade: number) => {
                        // 指数退避: 5s, 10s, 20s
                        return Math.min(5000 * Math.pow(2, attemptsMade - 1), 20000);
                    }
                }
            }
        );

        this.setupEventHandlers();

        // 启动时自动恢复未完成的任务
        this.recoverInterruptedTasks();
    }

    /**
     * 恢复中断的任务 - Worker 启动时自动调用
     */
    private async recoverInterruptedTasks() {
        try {
            // 查找状态为 'running' 的任务
            const runningTasks = await db.select()
                .from(tasks)
                .where(eq(tasks.status, 'running'));

            if (runningTasks.length === 0) {
                logger.info('[任务恢复] 没有发现未完成的任务');
                return;
            }

            logger.info(`[任务恢复] 发现 ${runningTasks.length} 个未完成的任务，正在恢复...`);

            for (const task of runningTasks) {
                // 重新加入队列
                await this.scrapeQueue.add(
                    `${task.source}-recovery-${task.id}`,
                    {
                        source: task.source,
                        query: task.query,
                        limit: task.targetCount || 100,
                        config: task.config
                    },
                    {
                        priority: 1  // 高优先级
                    }
                );

                logger.info(`[任务恢复] 任务 ${task.id} (${task.name}) 已重新加入队列`);
            }
        } catch (error: any) {
            logger.error('[任务恢复] 恢复任务时出错:', error.message);
        }
    }

    private async processJob(job: Job<ScrapeJobData>) {
        const { source, query, limit, config } = job.data;

        // 1. 检查是否有未完成的任务（恢复模式）
        const cityName = config?.geolocation?.city || config?.geolocation?.country || '全国';
        const taskName = `${query} - ${cityName}`;

        let taskId: string;
        let isResume = false;

        // 查找是否存在相同配置的运行中任务
        const existingTasks = await db.select()
            .from(tasks)
            .where(
                and(
                    eq(tasks.source, source),
                    eq(tasks.query, query),
                    eq(tasks.status, 'running')
                )
            )
            .limit(1);

        if (existingTasks.length > 0) {
            // 恢复现有任务
            taskId = existingTasks[0].id;
            isResume = true;
            logger.info(`\n${'='.repeat(60)}`);
            logger.info(`[任务恢复] ${source} - "${query}"`);
            logger.info(`[任务ID] ${taskId}`);
            logger.info(`[恢复模式] 从中断点继续执行`);
            logger.info(`${'='.repeat(60)}\n`);
        } else {
            // 创建新Task记录
            taskId = randomUUID();

            await db.insert(tasks).values({
                id: taskId,
                name: taskName,
                source,
                query,
                targetCount: limit,
                config: config || {},
                status: 'running',
                startedAt: new Date()
            });

            logger.info(`\n${'='.repeat(60)}`);
            logger.info(`[任务开始] ${source} - "${query}"`);
            logger.info(`[任务ID] ${taskId}`);
            logger.info(`[目标数量] ${limit} 条线索`);
            logger.info(`${'='.repeat(60)}\n`);
        }

        const adapter = this.adapters[source];
        if (!adapter) {
            await db.update(tasks)
                .set({ status: 'failed', error: `未找到适配器: ${source}`, completedAt: new Date() })
                .where(eq(tasks.id, taskId));
            throw new Error(`未找到适配器: ${source}`);
        }

        // 2. 如果是网格搜索,预先生成并保存搜索点（仅限新任务）
        if (!isResume && source === 'google_maps' && config?.geolocation) {
            const effectiveConfig = {
                ...adapter.config,
                ...(config || {})
            };
            if (config.geolocation) {
                effectiveConfig.geolocation = {
                    ...(adapter.config?.geolocation || {}),
                    ...config.geolocation
                };
            }

            const searchArea = adapter.getSearchArea(effectiveConfig);
            if (searchArea) {
                logger.info(`[搜索点生成] 开始生成网格搜索点...`);
                const gridPoints = adapter.prepareSearchPoints(searchArea, effectiveConfig);

                // 批量插入搜索点到数据库
                const searchPointsData = gridPoints.map((point: { lat: number; lng: number; sequenceNumber: number }) => ({
                    id: randomUUID(),
                    taskId,
                    latitude: point.lat,
                    longitude: point.lng,
                    sequenceNumber: point.sequenceNumber,
                    status: 'pending' as const,
                    resultsFound: 0,
                    resultsSaved: 0
                }));

                await db.insert(searchPoints).values(searchPointsData);
                logger.info(`[搜索点生成] 已保存 ${gridPoints.length} 个搜索点到数据库`);
            }
        }

        // 发送任务开始事件
        await eventEmitter.emit({
            type: 'task_start',
            jobId: job.id!,
            timestamp: new Date().toISOString(),
            data: { source, query, totalCount: limit }
        });

        let rawData: any[] = [];
        let savedCount = 0;
        let validationFailedCount = 0;

        // 增量保存回调函数
        const onBatchComplete = async (batch: any[]) => {
            for (const raw of batch) {
                if (!adapter.validate(raw)) {
                    validationFailedCount++;
                    await db.update(tasks)
                        .set({ failedLeads: sql`${tasks.failedLeads} + 1` })
                        .where(eq(tasks.id, taskId));
                    continue;
                }

                const standardData = adapter.transform(raw);

                // 辅助函数：截断字符串以适应数据库字段长度
                const truncate = (str: string | undefined, maxLen: number) =>
                    str ? (str.length > maxLen ? str.substring(0, maxLen) : str) : undefined;

                try {
                    // 1. 保存Lead
                    const leadId = randomUUID();

                    await db.insert(leads).values({
                        id: leadId,
                        taskId,
                        companyName: standardData.name,
                        domain: truncate(standardData.domain, 255),
                        website: standardData.website,
                        industry: truncate(standardData.industry, 100),
                        region: truncate(standardData.region, 100),
                        address: standardData.region,  // address is text, no limit
                        employeeCount: standardData.employeeCount,
                        estimatedSize: truncate(standardData.estimatedSize, 20),
                        rating: raw.data.rating ? parseFloat(raw.data.rating) : null,
                        reviewCount: raw.data.reviewCount ? parseInt(raw.data.reviewCount.replace(/[^\d]/g, '')) : null,
                        rawData: raw.data as any,
                        source,
                        sourceUrl: standardData.sourceUrl,
                        ratingStatus: 'pending',
                        scrapedAt: standardData.scrapedAt
                    });

                    // 2. 如果有联系信息，创建Contact
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
                            priority: 10, // 优先级略低，不阻塞爬虫
                            removeOnComplete: true,
                            removeOnFail: { count: 100 } // 保留最近100条失败记录供排查
                        });
                    } catch (err) {
                        logger.warn(`[队列推送失败] 无法将 Lead ${leadId} 推送到评分队列`, err);
                    }

                    savedCount++;

                    // 3. 更新任务进度
                    await db.update(tasks)
                        .set({
                            totalLeads: sql`${tasks.totalLeads} + 1`,
                            successLeads: sql`${tasks.successLeads} + 1`
                        })
                        .where(eq(tasks.id, taskId));

                    // 显示保存的线索关键信息
                    logger.info(`[线索 ${savedCount}] ${standardData.name}`);
                    logger.info(`  ├─ 网站: ${standardData.website || '(无)'}`);
                    logger.info(`  ├─ 地址: ${standardData.region || '(无)'}`);
                    logger.info(`  ├─ 电话: ${standardData.phone || '(无)'}`);
                    logger.info(`  └─ 邮箱: ${standardData.email || '(无)'}`);

                } catch (error: any) {
                    logger.error(`[保存失败] ${standardData.name}:`, error?.message || error?.toString() || 'Unknown error');
                    if (error?.stack) {
                        logger.debug(`错误详情:`, error.stack);
                    }
                    await db.update(tasks)
                        .set({ failedLeads: sql`${tasks.failedLeads} + 1` })
                        .where(eq(tasks.id, taskId));
                }
            }
        };

        try {
            // 执行爬取 - 使用增量保存回调
            rawData = await adapter.scrape({ query, limit, config, onBatchComplete, taskId } as ScrapeParams);

            logger.info(`\n[爬取完成] 共找到 ${rawData.length} 条线索`);
            logger.info(`${'─'.repeat(60)}`);

            // 注意：数据已通过 onBatchComplete 回调增量保存，无需再次保存

            // 4. 标记任务完成（但不覆盖已取消的任务）
            const currentTask = await db.query.tasks.findFirst({
                where: eq(tasks.id, taskId)
            });

            // 只有当任务不是cancelled状态时才更新为completed
            if (currentTask?.status !== 'cancelled') {
                await db.update(tasks)
                    .set({
                        status: 'completed',
                        completedAt: new Date(),
                        progress: 100
                    })
                    .where(eq(tasks.id, taskId));

                logger.info(`[任务完成] 状态已更新为 completed`);
            } else {
                logger.info(`[任务终止] 任务已被用户取消，保持cancelled状态`);
            }

            // 显示统计摘要
            logger.info(`\n${'─'.repeat(60)}`);
            logger.info(`[统计摘要]`);
            logger.info(`  任务ID: ${taskId}`);
            logger.info(`  总计搜索: ${rawData.length} 条`);
            logger.info(`  验证失败: ${validationFailedCount} 条`);
            logger.info(`  成功保存: ${savedCount} 条`);
            logger.info(`  成功率: ${rawData.length > 0 ? ((savedCount / rawData.length) * 100).toFixed(1) : 0}%`);
            logger.info(`${'='.repeat(60)}\n`);

            // 发送任务完成事件
            await eventEmitter.emit({
                type: 'task_complete',
                jobId: job.id!,
                timestamp: new Date().toISOString(),
                data: {
                    message: `任务完成,成功保存 ${savedCount}/${rawData.length} 条`,
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
            // 5. 处理错误 - 区分可恢复和不可恢复的错误
            const attemptsMade = job.attemptsMade || 0;
            const maxAttempts = 3;
            const isLastAttempt = attemptsMade >= maxAttempts - 1;

            if (isLastAttempt) {
                // 所有重试都失败了，标记任务为永久失败
                await db.update(tasks)
                    .set({
                        status: 'failed',
                        error: `Failed after ${maxAttempts} attempts: ${error.message}`,
                        completedAt: new Date()
                    })
                    .where(eq(tasks.id, taskId));

                logger.error(`[任务失败] ${taskId} - 所有重试已用尽:`, error.message);
            } else {
                // 还有重试机会，记录但不标记为失败
                logger.warn(`[任务重试] ${taskId} - 尝试 ${attemptsMade + 1}/${maxAttempts} 失败:`, error.message);
                logger.info(`[任务重试] 将在稍后自动重试...`);
            }

            throw error;  // 重新抛出以触发BullMQ的重试机制
        }
    }

    private setupEventHandlers() {
        this.worker.on('completed', (job) => {
            logger.info(`✓ 任务完成: ${job.id}`);
        });

        this.worker.on('failed', (job, err) => {
            logger.error(`✗ 任务失败: ${job?.id}`, err.message);
        });

        this.worker.on('error', (err) => {
            logger.error('Worker 错误:', err);
        });

        logger.info('✓ Scraper Worker 已启动');
    }

    async close() {
        logger.info('关闭 Scraper Worker...');
        await this.worker.close();
        await this.ratingQueue.close();

        for (const adapter of Object.values(this.adapters)) {
            if (adapter.close) {
                await adapter.close();
            }
        }
    }
}

// 启动 Worker
const worker = new ScraperWorker();

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
