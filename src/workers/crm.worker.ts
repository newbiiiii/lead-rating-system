/**
 * CRM Worker
 * 处理 CRM 同步任务
 */

import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { configLoader } from '../config/config-loader';
import { logger } from '../utils/logger';
import { syncLeadToCrm } from '../services/crm.service';

const redisConfig = configLoader.get('database.redis');

const redis = {
    host: redisConfig.host,
    port: redisConfig.port,
    password: redisConfig.password,
};

interface CrmJobData {
    type: 'saveToCrm';
    leadId: string;
}

class CrmWorker {
    private worker: Worker;

    constructor() {
        this.worker = new Worker<CrmJobData>(
            'crm',
            async (job: Job<CrmJobData>) => {
                return await this.processJob(job);
            },
            {
                connection: redis,
                concurrency: 1,
                limiter: {
                    max: 20,
                    duration: 1000
                }
            }
        );

        this.setupEventHandlers();
    }

    private async processJob(job: Job<CrmJobData>) {
        const { type, leadId } = job.data;

        if (type === 'saveToCrm') {
            const result = await syncLeadToCrm(leadId);
            if (!result.success) {
                throw new Error(result.error);
            }
            return result;
        }
    }

    private setupEventHandlers() {
        this.worker.on('completed', (job) => {
            logger.debug(`CRM Job ${job.id} completed`);
        });

        this.worker.on('failed', (job, err) => {
            logger.error(`CRM Job ${job?.id} failed:`, err.message);
        });

        logger.info('✓ CRM Worker 已启动');
    }

    async close() {
        await this.worker.close();
    }
}

// 启动 Worker
const worker = new CrmWorker();

// 优雅关闭
process.on('SIGTERM', async () => {
    await worker.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    await worker.close();
    process.exit(0);
});
