/**
 * AI Rating Worker
 * 消费 rating 队列，调用 AI 对线索进行评分
 */

import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { db } from '../db';
import { leads, leadRatings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { configLoader } from '../config/config-loader';
import { logger as baseLogger } from '../utils/logger';
const logger = baseLogger.child({ service: 'rating' });
import { randomUUID } from 'crypto';
import { getTaskLead, rateLeadWithAI, shouldRetry, findExistingRatingByDomain } from '../services/rating.service';
import { RatingResult } from "../model/model";

const redisConfig = configLoader.get('database.redis');

const redis = {
    host: redisConfig.host,
    port: redisConfig.port,
    password: redisConfig.password,
};

interface RatingJobData {
    leadId: string;
    force?: boolean;
}

class RatingWorker {
    private worker: Worker;

    constructor() {
        // 创建 Worker
        this.worker = new Worker<RatingJobData>(
            'rating',
            async (job: Job<RatingJobData>) => {
                return await this.processJob(job);
            },
            {
                connection: redis,
                concurrency: 1, // 并发处理评分
                limiter: {
                    max: 10,      // 限制速率，避免 API 超限
                    duration: 1000
                },
                // 重试配置
                settings: {
                    backoffStrategy: (attemptsMade: number) => {
                        // 指数退避: 2s, 4s, 8s
                        return Math.min(2000 * Math.pow(2, attemptsMade - 1), 8000);
                    }
                }
            }
        );

        this.setupEventHandlers();
    }

    private async processJob(job: Job<RatingJobData>) {
        const { leadId } = job.data;

        logger.info(`[评分开始] Lead ID: ${leadId}`);

        // 1. 获取线索数据
        const lead = await getTaskLead(leadId)

        if (!lead) {
            throw new Error(`Lead not found: ${leadId}`);
        }

        // 检查是否已评分
        if (lead.ratingStatus === 'completed' && !job.data.force) {
            logger.info(`[评分跳过] 该线索已评分: ${lead.companyName}`);
            return;
        }

        // 2. 域名去重：检查是否有同域名的已评级记录
        if (lead.domain && !job.data.force) {
            const existingRating = await findExistingRatingByDomain(lead.domain, leadId);
            if (existingRating) {
                logger.info(`[域名重复] 找到同域名已评级记录: ${lead.domain}, 来源: ${existingRating.sourceCompanyName}`);

                // 复制评级结果，标记为重复（如果原本没有duplicate标记）
                const duplicateRating = existingRating.overallRating.includes('(duplicate)')
                    ? existingRating.overallRating
                    : `${existingRating.overallRating}(duplicate)`;

                await db.transaction(async (tx) => {
                    // 插入复制的评分结果
                    await tx.insert(leadRatings).values({
                        id: randomUUID(),
                        leadId: lead.leadId,
                        overallRating: duplicateRating,
                        suggestion: existingRating.suggestion,
                        think: existingRating.think || `复制自同域名线索: ${existingRating.sourceCompanyName}`,
                        ratedAt: new Date()
                    });

                    // 更新线索状态为已完成
                    await tx.update(leads)
                        .set({
                            ratingStatus: 'completed',
                            ratingError: null,
                            updatedAt: new Date()
                        })
                        .where(eq(leads.id, leadId));
                });

                logger.info(`[评分完成-复制] ${lead.companyName}: ${duplicateRating}`);

                // 同样触发CRM同步（如果是A或B）
                const originalRating = existingRating.overallRating.replace('(duplicate)', '').trim();
                if (['A', 'B'].includes(originalRating)) {
                    const { crmQueue } = await import('../queue');
                    await crmQueue.add('saveToCrm', {
                        type: 'saveToCrm',
                        leadId: lead.leadId
                    });
                    logger.info(`[自动流程] 已触发 CRM 同步: ${lead.companyName}`);
                }

                return { overallRating: duplicateRating, suggestion: existingRating.suggestion, think: existingRating.think };
            }
        }

        try {
            // 3. 调用评分服务
            const result: RatingResult | null = await rateLeadWithAI(lead);
            if (!!result) {
                // 3. 保存结果
                // 使用事务确保原子性
                await db.transaction(async (tx) => {
                    // 插入评分结果
                    await tx.insert(leadRatings).values({
                        id: randomUUID(),
                        leadId: lead.leadId,
                        overallRating: result.overallRating,
                        suggestion: result.suggestion,
                        think: result.think,
                        ratedAt: new Date()
                    });

                    // 更新线索状态，清除之前的错误信息
                    await tx.update(leads)
                        .set({
                            ratingStatus: 'completed',
                            ratingError: null,
                            updatedAt: new Date()
                        })
                        .where(eq(leads.id, leadId));
                });

                logger.info(`[评分完成] ${lead.companyName}: ${result.overallRating}分`);

                // 4. 如果评分是 A 或 B，触发 CRM 同步
                if (['A', 'B'].includes(result.overallRating)) {
                    const { crmQueue } = await import('../queue');
                    await crmQueue.add('saveToCrm', {
                        type: 'saveToCrm',
                        leadId: lead.leadId
                    });
                    logger.info(`[自动流程] 已触发 CRM 同步: ${lead.companyName}`);
                }
            }

            return result;

        } catch (error: any) {
            const attemptsMade = job.attemptsMade || 0;
            const maxAttempts = 3;

            // 判断是否应该重试
            const retryDecision = shouldRetry(error, attemptsMade, maxAttempts);

            if (!retryDecision.shouldRetry) {
                // 标记为永久失败，保存错误信息
                const errorMessage = error.message || String(error);
                await db.update(leads)
                    .set({
                        ratingStatus: 'failed',
                        ratingError: errorMessage.substring(0, 2000), // 限制长度
                        updatedAt: new Date()
                    })
                    .where(eq(leads.id, leadId));

                logger.error(`[评分失败] ${lead.companyName} - ${retryDecision.reason}:`, error.message);
            } else {
                // 还有重试机会
                logger.warn(`[评分重试] ${lead.companyName} - ${retryDecision.reason}:`, error.message);
                logger.info(`[评分重试] 将在稍后自动重试...`);
            }

            throw error;  // 重新抛出以触发BullMQ的重试机制
        }
    }

    private setupEventHandlers() {
        this.worker.on('completed', (job) => {
            logger.debug(`Rating Job ${job.id} completed`);
        });

        this.worker.on('failed', (job, err) => {
            logger.error(`Rating Job ${job?.id} failed:`, err.message);
        });

        logger.info('✓ Rating Worker 已启动');
    }

    async close() {
        await this.worker.close();
    }
}

// 启动 Worker
const worker = new RatingWorker();

// 优雅关闭
process.on('SIGTERM', async () => {
    await worker.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    await worker.close();
    process.exit(0);
});
