/**
 * 队列管理器
 * 统一管理所有队列实例
 */

import { Queue } from 'bullmq';
import { configLoader } from '../config/config-loader';

const redisConfig = configLoader.get('database.redis');

const redisConnection = {
    host: redisConfig.host,
    port: redisConfig.port,
    password: redisConfig.password,
};

// 队列实例
export const scrapeQueue = new Queue('scrape', {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000
        },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 }
    }
});

export const processQueue = new Queue('process', {
    connection: redisConnection
});

export const ratingQueue = new Queue('rating', {
    connection: redisConnection
});

export const automationQueue = new Queue('automation', {
    connection: redisConnection
});

/**
 * 任务调度器
 */
export class TaskScheduler {
    async scheduleScrapeTask(params: {
        source: string;
        query: string;
        limit: number;
        priority?: number;
        config?: any;  // 支持geolocation等配置
    }) {
        await scrapeQueue.add('scrape', params, {
            priority: params.priority || 5,
            jobId: `${params.source}-${Date.now()}`
        });
    }

    async scheduleBatchScrape(sources: any[]) {
        const jobs = sources.map((params, idx) => ({
            name: 'scrape',
            data: params,
            opts: {
                priority: params.priority || 5,
                jobId: `${params.source}-${Date.now()}-${idx}`
            }
        }));

        await scrapeQueue.addBulk(jobs);
    }

    async setupRecurringTasks() {
        const cronTasks = configLoader.get('cron', []);

        for (const task of cronTasks) {
            if (task.task === 'scrape') {
                await scrapeQueue.add(
                    task.name,
                    task.params,
                    {
                        repeat: {
                            pattern: task.schedule,
                            tz: task.timezone
                        }
                    }
                );
            }
        }
    }
}
