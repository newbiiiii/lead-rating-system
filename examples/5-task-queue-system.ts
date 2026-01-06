/**
 * BullMQ 任务队列系统
 * 实现爬虫任务的生产、消费和编排
 */

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { GoogleMapsAdapter } from './2-google-maps-adapter';
import { ProcessorPipelineBuilder } from './3-data-processor-pipeline';
import { RatingEngine } from './4-ai-rating-engine';
import type { StandardData } from './1-scraper-adapter-base';
import type { RatingResult } from './4-ai-rating-engine';

// ============ 配置 ============

const redisConnection = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: null
});

// ============ 任务数据类型 ============

interface ScrapeJobData {
    source: 'google_maps' | 'linkedin' | 'qichacha';
    query: string;
    limit: number;
    priority?: number;
}

interface ProcessJobData {
    rawDataId: string;
    data: StandardData;
}

interface RatingJobData {
    leadId: string;
    data: StandardData;
}

interface AutomationJobData {
    leadId: string;
    rating: RatingResult;
}

// ============ 队列定义 ============

export const scrapeQueue = new Queue<ScrapeJobData>('scrape', {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000
        },
        removeOnComplete: {
            count: 100 // 保留最近 100 个成功任务
        },
        removeOnFail: {
            count: 500 // 保留最近 500 个失败任务
        }
    }
});

export const processQueue = new Queue<ProcessJobData>('process', {
    connection: redisConnection
});

export const ratingQueue = new Queue<RatingJobData>('rating', {
    connection: redisConnection
});

export const automationQueue = new Queue<AutomationJobData>('automation', {
    connection: redisConnection
});

// ============ 生产者（任务调度器） ============

export class TaskScheduler {
    /**
     * 添加爬取任务
     */
    async scheduleScrapeTask(params: ScrapeJobData) {
        await scrapeQueue.add('scrape', params, {
            priority: params.priority || 5,
            jobId: `${params.source}-${Date.now()}` // 防止重复任务
        });

        console.log(`已添加爬取任务: ${params.source} - ${params.query}`);
    }

    /**
     * 批量添加爬取任务
     */
    async scheduleBatchScrape(sources: ScrapeJobData[]) {
        const jobs = sources.map((params, idx) => ({
            name: 'scrape',
            data: params,
            opts: {
                priority: params.priority || 5,
                jobId: `${params.source}-${Date.now()}-${idx}`
            }
        }));

        await scrapeQueue.addBulk(jobs);
        console.log(`已添加 ${jobs.length} 个爬取任务`);
    }

    /**
     * 定时任务 - 每天自动爬取
     */
    async setupRecurringTasks() {
        await scrapeQueue.add(
            'daily-scrape',
            {
                source: 'google_maps',
                query: '上海 软件开发公司',
                limit: 50
            },
            {
                repeat: {
                    pattern: '0 9 * * *', // 每天 9:00
                    tz: 'Asia/Shanghai'
                }
            }
        );

        console.log('已设置定时爬取任务: 每天 9:00');
    }
}

// ============ 消费者（Workers） ============

/**
 * 爬虫 Worker
 */
export class ScrapeWorker {
    private worker: Worker;
    private adapters: Record<string, any> = {};

    constructor() {
        // 初始化适配器
        this.adapters['google_maps'] = new GoogleMapsAdapter();

        this.worker = new Worker<ScrapeJobData>(
            'scrape',
            async (job: Job<ScrapeJobData>) => {
                return await this.processJob(job);
            },
            {
                connection: redisConnection,
                concurrency: 5, // 同时处理 5 个任务
                limiter: {
                    max: 100,  // 每个时间窗口最多 100 个任务
                    duration: 60000 // 时间窗口 1 分钟
                }
            }
        );

        this.setupEventHandlers();
    }

    private async processJob(job: Job<ScrapeJobData>) {
        const { source, query, limit } = job.data;

        console.log(`[${job.id}] 开始爬取: ${source} - ${query}`);

        const adapter = this.adapters[source];
        if (!adapter) {
            throw new Error(`未找到适配器: ${source}`);
        }

        // 执行爬取
        const rawData = await adapter.scrape({ query, limit });

        console.log(`[${job.id}] 爬取完成: 获取 ${rawData.length} 条数据`);

        // 推送到处理队列
        for (const raw of rawData) {
            if (adapter.validate(raw)) {
                const standardData = adapter.transform(raw);
                await processQueue.add('process', {
                    rawDataId: `${source}-${Date.now()}`,
                    data: standardData
                });
            }
        }

        return { scraped: rawData.length };
    }

    private setupEventHandlers() {
        this.worker.on('completed', (job) => {
            console.log(`✓ 任务完成: ${job.id}`);
        });

        this.worker.on('failed', (job, err) => {
            console.error(`✗ 任务失败: ${job?.id}`, err.message);
        });

        this.worker.on('error', (err) => {
            console.error('Worker 错误:', err);
        });
    }

    async close() {
        await this.worker.close();
        await this.adapters['google_maps']?.close();
    }
}

/**
 * 数据处理 Worker
 */
export class ProcessWorker {
    private worker: Worker;
    private pipeline: any;

    constructor() {
        const builder = new ProcessorPipelineBuilder(redisConnection);
        this.pipeline = builder.buildStandardPipeline();

        this.worker = new Worker<ProcessJobData>(
            'process',
            async (job: Job<ProcessJobData>) => {
                return await this.processJob(job);
            },
            {
                connection: redisConnection,
                concurrency: 10
            }
        );
    }

    private async processJob(job: Job<ProcessJobData>) {
        const { rawDataId, data } = job.data;

        try {
            // 数据清洗与去重
            const processed = await this.pipeline.process(data);

            console.log(`[${rawDataId}] 数据处理完成`);

            // 推送到评级队列
            await ratingQueue.add('rate', {
                leadId: processed.domain || processed.name,
                data: processed
            });

            return { success: true };
        } catch (error: any) {
            if (error.message.includes('域名已存在')) {
                console.log(`[${rawDataId}] 重复数据，已跳过`);
                return { success: false, reason: 'duplicate' };
            }
            throw error;
        }
    }

    async close() {
        await this.worker.close();
    }
}

/**
 * AI 评级 Worker
 */
export class RatingWorker {
    private worker: Worker;
    private engine: RatingEngine;

    constructor(ratingEngine: RatingEngine) {
        this.engine = ratingEngine;

        this.worker = new Worker<RatingJobData>(
            'rating',
            async (job: Job<RatingJobData>) => {
                return await this.processJob(job);
            },
            {
                connection: redisConnection,
                concurrency: 3, // 控制 API 并发
                limiter: {
                    max: 60,    // 每分钟最多 60 个请求
                    duration: 60000
                }
            }
        );
    }

    private async processJob(job: Job<RatingJobData>) {
        const { leadId, data } = job.data;

        console.log(`[${leadId}] 开始评级...`);

        // 执行 AI 评分
        const rating = await this.engine.rate(data);

        console.log(`[${leadId}] 评级完成: ${rating.totalScore} 分`);

        // 保存到数据库（此处省略）
        // await db.saveRating(rating);

        // 推送到自动化流转队列
        await automationQueue.add('automate', {
            leadId,
            rating
        });

        return rating;
    }

    async close() {
        await this.worker.close();
    }
}

// ============ 队列监控 ============

export class QueueMonitor {
    private events: QueueEvents;

    constructor(queueName: string) {
        this.events = new QueueEvents(queueName, {
            connection: redisConnection
        });

        this.events.on('completed', ({ jobId }) => {
            console.log(`[Monitor] ${queueName} - 任务完成: ${jobId}`);
        });

        this.events.on('failed', ({ jobId, failedReason }) => {
            console.error(`[Monitor] ${queueName} - 任务失败: ${jobId}`, failedReason);
        });
    }

    async getMetrics(queue: Queue) {
        const [waiting, active, completed, failed] = await Promise.all([
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getCompletedCount(),
            queue.getFailedCount()
        ]);

        return {
            waiting,
            active,
            completed,
            failed,
            total: waiting + active + completed + failed
        };
    }

    async close() {
        await this.events.close();
    }
}

// ============ 使用示例 ============

/*
async function main() {
  // 1. 启动 Workers
  const scrapeWorker = new ScrapeWorker();
  const processWorker = new ProcessWorker();
  const ratingWorker = new RatingWorker(ratingEngine);
  
  // 2. 调度任务
  const scheduler = new TaskScheduler();
  
  await scheduler.scheduleScrapeTask({
    source: 'google_maps',
    query: '北京 电商公司',
    limit: 30,
    priority: 1 // 高优先级
  });
  
  // 3. 监控队列
  const monitor = new QueueMonitor('scrape');
  setInterval(async () => {
    const metrics = await monitor.getMetrics(scrapeQueue);
    console.log('队列状态:', metrics);
  }, 10000);
  
  // 优雅关闭
  process.on('SIGTERM', async () => {
    await Promise.all([
      scrapeWorker.close(),
      processWorker.close(),
      ratingWorker.close(),
      monitor.close()
    ]);
    process.exit(0);
  });
}
*/
