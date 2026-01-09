/**
 * Rating 服务 - 核心评分逻辑
 * 从 worker 中提取出来，方便测试
 */
import { logger } from '../utils/logger';
import {RatingResult, TaskLead} from "../model/model";
import {db} from "../db";
import {sql} from "drizzle-orm";
import {Task} from "langchain/dist/experimental/babyagi";

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
    return result.rows[0] as TaskLead;
}

/**
 * 构建评分 prompt
 */
export function constructPrompt(taskLead: TaskLead): string {
    const rawData = taskLead.rawData as any;
    const description = rawData?.description || rawData?.about || '';
    const categories = rawData?.categories || [];

    return `
        Company Name: ${taskLead.companyName}
        Website: ${taskLead.website || 'N/A'}
        Industry: ${taskLead.industry || categories.join(', ') || 'Unknown'}
        Region: ${taskLead.region || taskLead.address || 'Unknown'}
        Employee Count: ${taskLead.employeeCount || taskLead.estimatedSize || 'Unknown'}
        Google Rating: ${taskLead.rating || 'N/A'} (${taskLead.reviewCount || 0} reviews)
        
        Description: ${description}
        
        Task Context: We are looking for potential B2B clients in the construction/home decoration industry (e.g., Wall Panels, Flooring).
        `;
}

/**
 * 调用 HiAgent 进行评分
 */
export async function rateLeadWithAI(taskLead: TaskLead): Promise<RatingResult> {
    const prompt = constructPrompt(taskLead);
    logger.info('[prompt]', prompt);
    // 发送post请求，调用HiAgent接口
    const url = 'http://127.0.0.1:7015/tps/hiagent/chat/chatAndGetMessage';

    const requestData = {
        apiKey: "d3jlgsqmr84esluu3veg",
        userId: "R00010119",
        query: prompt,
    };

    let content: RatingResult = {} as RatingResult;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': 'tlU9pmT5OJapL6eOLK'
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`请求失败: ${response.status} - ${errorText}`);
        }

        const result: any = await response.json();
        if (!result?.success) {
            const errorText = JSON.stringify(result?.result);
            throw new Error(`请求失败: ${result?.code} - ${errorText}`);
        }
        content = JSON.parse(result?.result?.messageInfo?.answerInfo?.answer);
        logger.info('[评分结果]', content)
    } catch (error) {
        logger.error('[评分失败]', error)
    }

    if (!content) {
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
