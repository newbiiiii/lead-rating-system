/**
 * CRM Service - CRM 同步核心逻辑
 * 从 worker 中提取出来，方便测试
 */

import { db } from '../db';
import { leads, automationLogs } from '../db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';

/**
 * Lead 数据类型（从数据库查询后的结构）
 */
export interface CrmLead {
    id: string;
    companyName: string;
    domain: string | null;
    website: string | null;
    industry: string | null;
    region: string | null;
    address: string | null;
    crmSyncStatus: string | null;
    rating?: {
        overallRating: string;
        suggestion: string;
    } | null;
    contacts?: Array<{
        name: string | null;
        email: string | null;
        phone: string | null;
    }>;
}

/**
 * CRM 同步结果
 */
export interface CrmSyncResult {
    success: boolean;
    leadId: string;
    message: string;
    syncedAt?: Date;
    error?: string;
}

/**
 * 获取 Lead 数据用于 CRM 同步
 */
export async function getLeadForCrm(leadId: string): Promise<CrmLead | null> {
    const lead = await db.query.leads.findFirst({
        where: eq(leads.id, leadId),
        with: {
            rating: true,
            contacts: true
        }
    });

    if (!lead) {
        return null;
    }

    return lead as unknown as CrmLead;
}

/**
 * 模拟调用 CRM API
 * TODO: 替换为实际的 CRM API 调用
 */
export async function callCrmApi(lead: CrmLead): Promise<{ success: boolean; message: string }> {
    // 模拟 API 调用延迟
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 模拟成功响应
    logger.info(`[CRM同步] 模拟推送成功: ${lead.companyName}`);
    return {
        success: true,
        message: `Lead ${lead.companyName} synced successfully`
    };
}

/**
 * 更新 Lead 同步状态为成功
 */
export async function markLeadAsSynced(leadId: string): Promise<void> {
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
            leadId: leadId,
            actionType: 'crm_push',
            status: 'success',
            executedAt: new Date()
        });
    });
}

/**
 * 更新 Lead 同步状态为失败
 */
export async function markLeadAsFailed(leadId: string, errorMessage: string): Promise<void> {
    // 记录失败日志
    await db.insert(automationLogs).values({
        id: randomUUID(),
        leadId: leadId,
        actionType: 'crm_push',
        status: 'failed',
        error: errorMessage,
        executedAt: new Date()
    });

    // 更新 Lead 状态为失败
    await db.update(leads)
        .set({
            crmSyncStatus: 'failed',
            updatedAt: new Date()
        })
        .where(eq(leads.id, leadId));
}

/**
 * 执行 CRM 同步（核心逻辑）
 */
export async function syncLeadToCrm(leadId: string): Promise<CrmSyncResult> {
    logger.info(`[CRM同步] 开始同步 Lead ID: ${leadId}`);

    // 1. 获取 Lead 数据
    const lead = await getLeadForCrm(leadId);

    if (!lead) {
        throw new Error(`Lead not found: ${leadId}`);
    }

    try {
        // 2. 调用 CRM API
        const apiResult = await callCrmApi(lead);

        if (!apiResult.success) {
            throw new Error(apiResult.message);
        }

        // 3. 更新数据库状态
        await markLeadAsSynced(leadId);

        return {
            success: true,
            leadId: leadId,
            message: apiResult.message,
            syncedAt: new Date()
        };

    } catch (error: any) {
        logger.error(`[CRM同步] 失败: ${error.message}`);

        // 记录失败状态
        await markLeadAsFailed(leadId, error.message);

        return {
            success: false,
            leadId: leadId,
            message: error.message,
            error: error.message
        };
    }
}
