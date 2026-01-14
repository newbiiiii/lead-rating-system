/**
 * Enrich Worker
 * 消费 enrich 队列，调用数据增强服务补充联系人数据
 * 完成后触发 CRM 同步
 */

import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { configLoader } from '../config/config-loader';
import { logger as baseLogger } from '../utils/logger';
import { performEnrich, getLeadForEnrich } from '../services/enrich.service';

const logger = baseLogger.child({ service: 'enrich' });

const redisConfig = configLoader.get('database.redis');

const redis = {
    host: redisConfig.host,
    port: redisConfig.port,
    password: redisConfig.password,
};

interface EnrichJobData {
    leadId: string;
}

class EnrichWorker {
    private worker: Worker;

    constructor() {
        this.worker = new Worker<EnrichJobData>(
            'enrich',
            async (job: Job<EnrichJobData>) => {
                return await this.processJob(job);
            },
            {
                connection: redis,
                concurrency: 2, // 并发处理
                limiter: {
                    max: 30,      // 限制速率
                    duration: 1000
                }
            }
        );

        this.setupEventHandlers();
    }

    private async processJob(job: Job<EnrichJobData>) {
        const { leadId } = job.data;

        logger.info(`[Enrich开始] Lead ID: ${leadId}`);

        // 1. 获取线索数据
        const lead = await getLeadForEnrich(leadId);

        if (!lead) {
            throw new Error(`Lead not found: ${leadId}`);
        }

        // 检查是否已经 Enrich
        if (lead.enrichStatus === 'enriched') {
            logger.info(`[Enrich跳过] 该线索已完成数据增强: ${lead.companyName}`);
            // 仍然触发 CRM 同步（以防之前没有触发）
            await this.triggerCrmSync(leadId, lead.companyName);
            return { skipped: true };
        }

        try {
            // 2. 执行数据增强
            const result = await performEnrich(leadId);

            if (result.success) {
                logger.info(`[Enrich完成] ${lead.companyName}: 获取 ${result.contacts?.length || 0} 个联系人`);

                // 3. 触发 CRM 同步
                await this.triggerCrmSync(leadId, lead.companyName);
            } else {
                logger.warn(`[Enrich失败] ${lead.companyName}: ${result.error}`);
                // 即使 Enrich 失败，仍然触发 CRM 同步（让 CRM 决定是否处理）
                await this.triggerCrmSync(leadId, lead.companyName);
            }

            return result;

        } catch (error: any) {
            logger.error(`[Enrich错误] ${lead.companyName}:`, error.message);
            throw error;
        }
    }

    /**
     * 触发 CRM 同步
     */
    private async triggerCrmSync(leadId: string, companyName: string) {
        const { crmQueue } = await import('../queue');
        await crmQueue.add('saveToCrm', {
            type: 'saveToCrm',
            leadId: leadId
        });
        logger.info(`[自动流程] 已触发 CRM 同步: ${companyName}`);
    }

    private setupEventHandlers() {
        this.worker.on('completed', (job) => {
            logger.debug(`Enrich Job ${job.id} completed`);
        });

        this.worker.on('failed', (job, err) => {
            logger.error(`Enrich Job ${job?.id} failed: ${err?.message || err}`, err);
        });

        logger.info('✓ Enrich Worker 已启动');
    }

    async close() {
        await this.worker.close();
    }
}

// 启动 Worker
const worker = new EnrichWorker();

// 优雅关闭
process.on('SIGTERM', async () => {
    await worker.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    await worker.close();
    process.exit(0);
});
