/**
 * AI Rating Worker
 * 消费 rating 队列，调用 AI 对线索进行评分
 */

import 'dotenv/config';
import { Worker, Job, Queue } from 'bullmq';
import { db } from '../db';
import { leads, leadRatings } from '../db/schema';
import { eq } from 'drizzle-orm';
import OpenAI from 'openai';
import { configLoader } from '../config/config-loader';
import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';

const redisConfig = configLoader.get('database.redis');
const aiConfig = configLoader.get('integrations.openai') || {
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_API_BASE_URL,
    model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo'
};

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
    private openai: OpenAI;

    constructor() {
        // 初始化 OpenAI 客户端
        this.openai = new OpenAI({
            apiKey: aiConfig.apiKey,
            baseURL: aiConfig.baseURL,
        });

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
                }
            }
        );

        this.setupEventHandlers();
    }

    private async processJob(job: Job<RatingJobData>) {
        const { leadId } = job.data;

        logger.info(`[评分开始] Lead ID: ${leadId}`);

        // 1. 获取线索数据
        const lead = await db.query.leads.findFirst({
            where: eq(leads.id, leadId)
        });

        if (!lead) {
            throw new Error(`Lead not found: ${leadId}`);
        }

        // 检查是否已评分
        if (lead.ratingStatus === 'completed' && !job.data.force) {
            logger.info(`[评分跳过] 该线索已评分: ${lead.companyName}`);
            return;
        }

        try {
            // 2. 构建 Prompt
            const prompt = this.constructPrompt(lead);

            // 3. 调用 AI
            const completion = await this.openai.chat.completions.create({
                model: aiConfig.model,
                messages: [
                    {
                        role: 'system',
                        content: `You are an expert B2B sales analyst. Evaluate the following company lead based on the provided data. 
                        Output strictly in JSON format with the following structure:
                        {
                            "totalScore": number (0-100),
                            "confidence": number (0-1),
                            "reasoning": "string (concise explanation)",
                            "breakdown": {
                                "industryFit": number (0-100),
                                "scale": number (0-100),
                                "contactQuality": number (0-100)
                            },
                            "icebreaker": "string (a personalized opening sentence for cold email)"
                        }`
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                response_format: { type: 'json_object' },
                temperature: 0.3
            });

            const content = completion.choices[0].message.content;
            if (!content) {
                throw new Error('AI returned empty response');
            }

            const result = JSON.parse(content);

            // 4. 保存结果
            // 使用事务确保原子性
            await db.transaction(async (tx) => {
                // 插入评分结果
                await tx.insert(leadRatings).values({
                    id: randomUUID(),
                    leadId: lead.id,
                    totalScore: result.totalScore,
                    breakdown: result.breakdown,
                    confidence: result.confidence,
                    reasoning: result.reasoning,
                    icebreaker: result.icebreaker,
                    model: aiConfig.model,
                    tokensUsed: completion.usage?.total_tokens,
                    ratedAt: new Date()
                });

                // 更新线索状态
                await tx.update(leads)
                    .set({
                        ratingStatus: 'completed',
                        updatedAt: new Date()
                    })
                    .where(eq(leads.id, leadId));
            });

            logger.info(`[评分完成] ${lead.companyName}: ${result.totalScore}分`);

            return result;

        } catch (error: any) {
            logger.error(`[评分失败] ${lead.companyName}:`, error.message);

            // 更新状态为失败
            await db.update(leads)
                .set({
                    ratingStatus: 'failed',
                    updatedAt: new Date()
                })
                .where(eq(leads.id, leadId));

            throw error;
        }
    }

    private constructPrompt(lead: any): string {
        // 提取原始数据中的描述信息（如果有）
        const rawData = lead.rawData as any;
        const description = rawData?.description || rawData?.about || '';
        const categories = rawData?.categories || [];

        return `
        Company Name: ${lead.companyName}
        Website: ${lead.website || 'N/A'}
        Industry: ${lead.industry || categories.join(', ') || 'Unknown'}
        Region: ${lead.region || lead.address || 'Unknown'}
        Employee Count: ${lead.employeeCount || lead.estimatedSize || 'Unknown'}
        Google Rating: ${lead.rating || 'N/A'} (${lead.reviewCount || 0} reviews)
        
        Description: ${description}
        
        Task Context: We are looking for potential B2B clients in the construction/home decoration industry (e.g., Wall Panels, Flooring).
        `;
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
