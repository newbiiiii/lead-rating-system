/**
 * Automation Worker
 * 处理自动化任务，如 CRM 同步、邮件发送等
 */

import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { db } from '../db';
import { leads, automationLogs } from '../db/schema';
import { eq } from 'drizzle-orm';
import { configLoader } from '../config/config-loader';
import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';

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
            await this.handleSaveToCrm(leadId);
        }
    }

    private async handleSaveToCrm(leadId: string) {
        logger.info(`[CRM同步] 开始同步 Lead ID: ${leadId}`);

        // 1. 获取 Lead 数据
        const lead = await db.query.leads.findFirst({
            where: eq(leads.id, leadId),
            with: {
                rating: true,
                contacts: true
            }
        });

        if (!lead) {
            throw new Error(`Lead not found: ${leadId}`);
        }

        try {
            // 2. 模拟调用 CRM API
            // TODO: 替换为实际的 CRM API 调用
            await new Promise(resolve => setTimeout(resolve, 1000)); // 模拟延迟

            logger.info(`[CRM同步] 模拟推送成功: ${lead.companyName}`);

            // 3. 更新数据库状态
            await db.transaction(async (tx) => {
                // 更新 Lead 状态
                await tx.update(leads)
                    .set({
                        crmSyncStatus: 'synced',
                        crmSyncedAt: new Date(),
                        updatedAt: new Date()
                    })
                    .where(eq(leads.id, leadId));

                // 记录日志
                await tx.insert(automationLogs).values({
                    id: randomUUID(),
                    leadId: lead.id,
                    actionType: 'crm_push',
                    status: 'success',
                    executedAt: new Date()
                });
            });

        } catch (error: any) {
            logger.error(`[CRM同步] 失败: ${error.message}`);

            // 记录失败日志
            await db.insert(automationLogs).values({
                id: randomUUID(),
                leadId: lead.id,
                actionType: 'crm_push',
                status: 'failed',
                error: error.message,
                executedAt: new Date()
            });

            // 更新 Lead 状态为失败
            await db.update(leads)
                .set({
                    crmSyncStatus: 'failed',
                    updatedAt: new Date()
                })
                .where(eq(leads.id, leadId));

            throw error;
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
