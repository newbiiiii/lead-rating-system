/**
 * 爬虫 Worker
 * 消费爬取任务并将数据推送到处理队列
 */

import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';
import { configLoader } from '../config/config-loader';
import { db } from '../db';
import { tasks, leads, contacts, companies } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
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

    constructor() {
        // 初始化适配器
        this.adapters['google_maps'] = new GoogleMapsAdapter();

        // 创建 Worker
        this.worker = new Worker<ScrapeJobData>(
            'scrape',
            async (job: Job<ScrapeJobData>) => {
                return await this.processJob(job);
            },
            {
                connection: redis,
                concurrency: queueConfig.concurrency || 5,
                limiter: queueConfig.rate_limit
            }
        );

        this.setupEventHandlers();
    }

    private async processJob(job: Job<ScrapeJobData>) {
        const { source, query, limit, config } = job.data;

        // 1. 创建Task记录
        const taskId = randomUUID();
        const cityName = config?.geolocation?.city || config?.geolocation?.country || '全国';
        const taskName = `${query} - ${cityName}`;

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

        const adapter = this.adapters[source];
        if (!adapter) {
            await db.update(tasks)
                .set({ status: 'failed', error: `未找到适配器: ${source}`, completedAt: new Date() })
                .where(eq(tasks.id, taskId));
            throw new Error(`未找到适配器: ${source}`);
        }

        // 发送任务开始事件
        await eventEmitter.emit({
            type: 'task_start',
            jobId: job.id!,
            timestamp: new Date().toISOString(),
            data: { source, query, totalCount: limit, taskId }
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
            rawData = await adapter.scrape({ query, limit, config, onBatchComplete } as ScrapeParams);

            logger.info(`\n[爬取完成] 共找到 ${rawData.length} 条线索`);
            logger.info(`${'─'.repeat(60)}`);

            // 注意：数据已通过 onBatchComplete 回调增量保存，无需再次保存

            // 4. 标记任务完成
            await db.update(tasks)
                .set({
                    status: 'completed',
                    completedAt: new Date(),
                    progress: 100
                })
                .where(eq(tasks.id, taskId));

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
                    taskId,
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
            // 5. 处理错误 - 标记任务失败
            await db.update(tasks)
                .set({
                    status: 'failed',
                    error: error.message,
                    completedAt: new Date()
                })
                .where(eq(tasks.id, taskId));

            logger.error(`[任务失败] ${taskId}:`, error.message);
            throw error;
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
