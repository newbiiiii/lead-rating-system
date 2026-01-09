/**
 * Rating 服务 - 核心评分逻辑
 * 从 worker 中提取出来，方便测试
 */
import { logger } from '../utils/logger';
import { RatingResult, TaskLead } from "../model/model";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { Task } from "langchain/dist/experimental/babyagi";

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
export function constructPrompt(taskLead: TaskLead): string | null {
    const rawData = taskLead.rawData as any;
    const description = rawData?.description || rawData?.about || '';
    const categories = rawData?.categories || [];
    const ratingContext = getDynamicRatingContext(taskLead.taskName);

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
    const prompt = constructPrompt(taskLead);
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

/**
 * 根据任务名称或查询词动态生成任务上下文
 */
function getDynamicRatingContext(taskName: string): string | null {
    const name = taskName.toLowerCase();

    // 1. 建材墙板类
    if (name.includes('wall panel') || name.includes('flooring') || name.includes('decoration')) {
        return `
        Task Context: We are looking for potential B2B clients in the construction/home decoration industry (e.g., Wall Panels, Flooring). Focus on their wholesale capacity and project experience.
        
        Please classify this company into Tier A, B, or C based on the following strict criteria:
        
        ### Tier A (Must meet ALL):
        1. **Product**: Explicitly sells Flat Wall Panel, Acoustic Wall Panel, or Wall Panel.
        2. **Material**: Made of PS, PVC, SPC, WPC, MDF, PE, PET, or Aluminum Alloy.
        3. **Role**: Is a distributor, wholesaler, or retailer (Sales Channel).
        4. **Non-Manufacturer**: Does not produce these panels in their own local factory.
        5. **Origin**: Is NOT a Chinese company.
        
        ### Tier B (Must meet ALL):
        1. **Industry Synergy**: Does not explicitly list wall panels, but is a large/strong player in related sectors: Flooring, Doors/Windows, Furniture, Sanitary Ware, Ceramics, Ceilings, or Acoustic Systems.
        2. **Potential**: High potential to become a distributor, importer, or strategic partner.
        3. **Capability**: Has importer, wholesaler, or distributor qualifications.
        4. **Origin**: Is NOT a Chinese company.
        
        ### Tier C (Meets ANY):
        1. **Chinese Entity**: Is a Chinese factory or trading company (based on address, domain, or phone).
        2. **Irrelevant**: Main business is unrelated to construction or home decor (e.g., electronics, apparel, food).
        3. **Invalid Source**: The page is not a corporate official website (e.g., B2B platform like Indiamart/Alibaba, directory site).
        `;
    }

    // 2. 包装与制造业 (Packaging & Manufacturing)
    if (name.includes('garbage bag') || name.includes('trash bag') || name.includes('packaging')) {
        return `
        Task Context: We are identifying high-quality B2B leads in the plastic packaging and waste management industry, specifically focusing on Garbage Bags/Bin Liners.
        
        Please classify this company into Tier A, B, or C based on the following strict criteria:
        
        ### Tier A (Must meet ALL):
        1. **Product**: Explicitly sells or distributes Garbage Bags, Trash Bags, Bin Liners, or Refuse Sacks.
        2. **Material/Specialty**: Offers standard PE bags or specialized bags (e.g., Biodegradable, Compostable, or Heavy-duty Industrial bags).
        3. **Role**: Functions as a professional Distributor, Wholesaler, or Cleaning Supply Provider.
        4. **Target Market**: Serves B2B sectors like facility management, hospitality, hospitals, or large-scale retail.
        5. **Origin**: Is NOT a Chinese company.
        
        ### Tier B (Must meet ALL):
        1. **Industry Synergy**: Does not focus primarily on garbage bags, but is a major player in General Plastic Packaging, Professional Cleaning Chemicals, or Janitorial Supplies.
        2. **Potential**: Strong potential to add garbage bags to their existing product portfolio as a key distributor or importer.
        3. **Scale**: Shows significant business scale (e.g., large warehouse, multiple branches, or high employee count).
        4. **Origin**: Is NOT a Chinese company.
        
        ### Tier C (Meets ANY):
        1. **Chinese Entity**: Is a Chinese manufacturer or trading company (based on address, domain, or phone).
        2. **Irrelevant**: Main business is unrelated to packaging or cleaning supplies (e.g., software, food ingredients, textiles).
        3. **End User Only**: Is merely a consumer of bags (like a single restaurant or a small office) rather than a reseller/distributor.
        4. **Invalid Source**: The link is a B2B directory (Indiamart, Justdial) or a social media profile, not an official corporate website.
        `;
    }

    // 默认兜底 (Default)
    // 如果没有命中关键词，根据 query 动态生成一段话，保证不重复
    // return `We are currently evaluating businesses related to "${taskName}" to determine their suitability for B2B collaboration`;
    return null;
}