/**
 * Rating 服务 - 核心评分逻辑
 * 从 worker 中提取出来，方便测试
 */
import { logger as baseLogger } from '../utils/logger';
const logger = baseLogger.child({ service: 'rating' });
import axios from 'axios';
import { RatingResult, TaskLead } from "../model/model";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { getBusinessContext } from "./business.service";

/**
 * 查找同域名的已有评级结果
 * @param domain 域名
 * @param currentLeadId 当前 lead ID（排除自己）
 * @returns 已有的评级结果，或 null
 */
export interface ExistingRating {
    overallRating: string;
    suggestion: string;
    think: string | null;
    sourceLeadId: string;
    sourceCompanyName: string;
}

export async function findExistingRatingByDomain(
    domain: string,
    currentLeadId: string
): Promise<ExistingRating | null> {
    if (!domain || domain.trim() === '') {
        return null;
    }

    try {
        const result = await db.execute(sql`
            SELECT 
                lr.overall_rating AS "overallRating",
                lr.suggestion,
                lr.think,
                l.id AS "sourceLeadId",
                l.company_name AS "sourceCompanyName"
            FROM leads l
            JOIN lead_ratings lr ON l.id = lr.lead_id
            WHERE l.domain = ${domain}
              AND l.id != ${currentLeadId}
              AND l.rating_status = 'completed'
            ORDER BY lr.rated_at DESC
            LIMIT 1
        `);

        if (result.rows.length > 0) {
            const row = result.rows[0] as any;
            return {
                overallRating: row.overallRating,
                suggestion: row.suggestion,
                think: row.think,
                sourceLeadId: row.sourceLeadId,
                sourceCompanyName: row.sourceCompanyName,
            };
        }

        return null;
    } catch (error) {
        logger.error('[域名查重失败]', error);
        return null;
    }
}

/**
 * 判断错误是否可重试
 */
export function isRetryableError(error: any): boolean {
    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.code?.toLowerCase() || '';

    // API限流错误 - 应该重试
    if (errorMessage.includes('rate limit') ||
        errorMessage.includes('too many requests') ||
        errorCode === 'rate_limit_exceeded') {
        return true;
    }

    // 网络错误 - 应该重试
    if (errorMessage.includes('network') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('econnrefused') ||
        errorCode === 'enotfound') {
        return true;
    }

    // 临时服务器错误 - 应该重试
    if (errorMessage.includes('503') ||
        errorMessage.includes('502') ||
        errorMessage.includes('500')) {
        return true;
    }

    // JSON解析错误 - 不应该重试（AI返回了无效的JSON）
    if (errorMessage.includes('json') ||
        errorMessage.includes('parse')) {
        return false;
    }

    // 验证错误 - 不应该重试
    if (errorMessage.includes('validation') ||
        errorMessage.includes('invalid')) {
        return false;
    }

    // 默认认为可以重试
    return true;
}

export const getTaskLead = async (leadId: string): Promise<TaskLead> => {
    const result = await db.execute(sql`
        SELECT t.id AS "taskId",
               t.name AS "taskName",
               t.source,
               t.query,
               t.config#>>'{"geolocation","country"}' country,
               t.config#>>'{"geolocation","city"}' city,
               t.progress,
               l.id AS "leadId",
               l.company_name AS "companyName",
               l.domain,
               l.website,
               l.industry,
               l.region,
               l.address,
               l.source_url AS "sourceUrl",
               l.rating_status AS "ratingStatus",
               l.scraped_at AS "scrapedAt",
               t.config,
               l.employee_count AS "employeeCount",
               l.estimated_size AS "estimatedSize",
               l.rating AS rating,
               l.review_count AS "reviewCount",
               l.raw_data AS "rawData"
        FROM leads l
            JOIN tasks t ON l.task_id = t.id
        WHERE l.id = ${leadId}
        ORDER BY l.created_at DESC
    `);
    if (!result.rows.length) {
        throw new Error('Lead not found');
    }
    logger.info('[taskLead]', result.rows[0])
    return result.rows[0] as unknown as TaskLead;
}

/**
 * 构建评分 prompt
 * 改为异步函数以支持从数据库读取客户画像配置
 */
export async function constructPrompt(taskLead: TaskLead): Promise<string | null> {
    const rawData = taskLead.rawData as any;
    const description = rawData?.description || rawData?.about || '';
    const categories = rawData?.categories || [];

    // 使用异步版本，正确从数据库读取客户画像配置
    const businessContext = await getBusinessContext(taskLead.taskName);
    const ratingContext = businessContext?.ratingPrompt || null;

    // 如果没有配置评分规则，抛出503错误（可重试）
    if (ratingContext === null) {
        logger.warn(`评分规则未配置: ${taskLead.taskName}`);
        return null;
    }

    return `
        Company Name: ${taskLead.companyName}
        Website: ${taskLead.website || 'N/A'}
        Industry: ${taskLead.industry || categories.join(', ') || 'Unknown'}
        Region: ${taskLead.region || taskLead.address || 'Unknown'}
        Employee Count: ${taskLead.employeeCount || taskLead.estimatedSize || 'Unknown'}
        Google Rating: ${taskLead.rating || 'N/A'} (${taskLead.reviewCount || 0} reviews)
        
        Description: ${description}
        
        # Evaluation Task
        ${ratingContext}
        
        # Output Requirement
        Please provide the evaluation in the following format:
        - Rating: [A, B, or C]
        - Reason: [Briefly explain why based on the criteria]
        `;
}

/**
 * 调用 HiAgent 进行评分
 */
export async function rateLeadWithAI(taskLead: TaskLead): Promise<RatingResult | null> {
    const prompt = await constructPrompt(taskLead);
    logger.info('[prompt]', { 'prompt': prompt });
    if (prompt === null) {
        // 未配置评分规则，标记为pending_config
        await db.execute(sql`
            UPDATE leads SET rating_status = 'pending_config', updated_at = ${new Date()} WHERE id = ${taskLead.leadId}
        `);
        logger.info(`Lead ${taskLead.leadId} 标记为待配置状态`);
        return null;
    }
    // 发送post请求，调用HiAgent接口
    const url = 'http://wechatapp.intco.com.cn:8090/jeecgboot/tps/hiagent/chat/chatAndGetMessage';

    const requestData = {
        apiKey: "d3jlgsqmr84esluu3veg",
        userId: "R00010119",
        query: prompt,
    };

    let content: RatingResult = {} as RatingResult;
    try {
        const response = await axios.post(url, requestData, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': 'dasjfnreiugnreiun'
            },
            timeout: 600000 // 10分钟超时
        });

        const result = response.data;
        if (!result?.success) {
            const errorText = JSON.stringify(result?.result);
            throw new Error(`请求失败: ${result?.code} - ${errorText}`);
        }
        content = JSON.parse(result?.result?.messageInfo?.answerInfo?.answer?.replace(/^```json\s*/i, '')?.replace(/\s*```$/, ''));
        logger.info('[评分结果]', content)
    } catch (error: any) {
        // Axios error handling
        if (error.code === 'ECONNABORTED') {
            logger.error(`[评分超时] 请求超过 10 分钟: ${error.message}`);
        } else {
            logger.error('[评分失败]', error.message || error);
        }
        throw error;  // 重新抛出错误，让 worker 的重试机制处理
    }

    if (!content || Object.keys(content).length === 0) {
        throw new Error('AI returned empty response');
    }

    return { ...content, };
}

/**
 * 处理评分逻辑（包含重试判断）
 */
export function shouldRetry(error: any, attemptsMade: number, maxAttempts: number = 3): {
    shouldRetry: boolean;
    reason: string;
} {
    const isLastAttempt = attemptsMade >= maxAttempts - 1;
    const isRetryable = isRetryableError(error);

    if (isLastAttempt) {
        return {
            shouldRetry: false,
            reason: '所有重试已用尽'
        };
    }

    if (!isRetryable) {
        return {
            shouldRetry: false,
            reason: '不可恢复的错误'
        };
    }

    return {
        shouldRetry: true,
        reason: `可重试错误，尝试 ${attemptsMade + 1}/${maxAttempts}`
    };
}

