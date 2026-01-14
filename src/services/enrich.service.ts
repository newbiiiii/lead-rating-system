/**
 * Enrich Service
 * 数据增强服务 - 调用外部 API 补充联系人数据
 * 
 * 注意：enrichLeadContacts 方法需要用户自行实现 Apollo API 调用逻辑
 */

import { db } from '../db';
import { leads, contacts } from '../db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { logger as baseLogger } from '../utils/logger';

const logger = baseLogger.child({ service: 'enrich' });

/**
 * 联系人数据接口
 */
export interface ContactData {
    name: string;
    title?: string;
    email?: string;
    phone?: string;
    mobile?: string;
    linkedinUrl?: string;
    isPrimary?: boolean;
}

/**
 * Enrich 结果接口
 */
export interface EnrichResult {
    success: boolean;
    contacts?: ContactData[];
    error?: string;
}

/**
 * 获取待 Enrich 的线索
 */
export async function getLeadForEnrich(leadId: string) {
    const result = await db.query.leads.findFirst({
        where: eq(leads.id, leadId),
        with: {
            rating: true,
        }
    });
    return result;
}

/**
 * 调用外部 API 获取联系人数据
 * 
 * TODO: 用户需要实现此方法，对接 Apollo 或其他数据增强服务
 * 
 * @param domain - 公司域名
 * @param companyName - 公司名称
 * @returns EnrichResult - 包含联系人列表或错误信息
 */
export async function enrichLeadContacts(
    domain: string | null,
    companyName: string
): Promise<EnrichResult> {
    // ============================================
    // TODO: 用户自行实现 Apollo API 调用
    // ============================================
    // 
    // 示例实现：
    // 
    // try {
    //     const response = await fetch('YOUR_APOLLO_API_ENDPOINT', {
    //         method: 'POST',
    //         headers: { 'Content-Type': 'application/json' },
    //         body: JSON.stringify({ domain, companyName })
    //     });
    //     
    //     const data = await response.json();
    //     
    //     return {
    //         success: true,
    //         contacts: data.contacts.map((c: any) => ({
    //             name: c.name,
    //             title: c.title,
    //             email: c.email,
    //             phone: c.phone,
    //             mobile: c.mobile,
    //             linkedinUrl: c.linkedin_url,
    //             isPrimary: c.is_primary
    //         }))
    //     };
    // } catch (error: any) {
    //     return {
    //         success: false,
    //         error: error.message
    //     };
    // }
    // 
    // ============================================

    logger.warn(`[Enrich] enrichLeadContacts 方法尚未实现，请补充 Apollo API 调用逻辑`);

    // 暂时返回跳过状态，等待用户实现
    return {
        success: false,
        error: 'enrichLeadContacts 方法尚未实现'
    };
}

/**
 * 保存联系人到数据库
 */
export async function saveContacts(leadId: string, contactList: ContactData[]): Promise<void> {
    if (!contactList || contactList.length === 0) {
        return;
    }

    const contactRecords = contactList.map((contact, index) => ({
        id: randomUUID(),
        leadId,
        name: contact.name || null,
        title: contact.title || null,
        email: contact.email || null,
        phone: contact.phone || null,
        mobile: contact.mobile || null,
        linkedinUrl: contact.linkedinUrl || null,
        source: 'apollo',
        isPrimary: contact.isPrimary || index === 0, // 第一个默认为主要联系人
        createdAt: new Date(),
        updatedAt: new Date()
    }));

    await db.insert(contacts).values(contactRecords);

    logger.info(`[Enrich] 已保存 ${contactRecords.length} 个联系人到 Lead ${leadId}`);
}

/**
 * 更新线索的 Enrich 状态
 */
export async function updateEnrichStatus(
    leadId: string,
    status: 'pending' | 'enriched' | 'failed' | 'skipped',
    error?: string
): Promise<void> {
    const updateData: Record<string, any> = {
        enrichStatus: status,
        updatedAt: new Date()
    };

    if (status === 'enriched') {
        updateData.enrichedAt = new Date();
        updateData.enrichError = null;
    } else if (status === 'failed') {
        updateData.enrichError = error?.substring(0, 2000) || 'Unknown error';
    }

    await db.update(leads)
        .set(updateData)
        .where(eq(leads.id, leadId));
}

/**
 * 执行完整的 Enrich 流程
 */
export async function performEnrich(leadId: string): Promise<EnrichResult> {
    const lead = await getLeadForEnrich(leadId);

    if (!lead) {
        throw new Error(`Lead not found: ${leadId}`);
    }

    // 检查是否已经 Enrich
    if (lead.enrichStatus === 'enriched') {
        logger.info(`[Enrich] Lead ${leadId} 已经完成数据增强，跳过`);
        return { success: true, contacts: [] };
    }

    // 调用 Enrich API
    const result = await enrichLeadContacts(lead.domain, lead.companyName);

    if (result.success && result.contacts && result.contacts.length > 0) {
        // 保存联系人
        await saveContacts(leadId, result.contacts);
        // 更新状态为已完成
        await updateEnrichStatus(leadId, 'enriched');

        logger.info(`[Enrich] 完成数据增强: ${lead.companyName}, 获取 ${result.contacts.length} 个联系人`);
    } else if (result.success) {
        // API 成功但没有找到联系人
        await updateEnrichStatus(leadId, 'enriched');
        logger.info(`[Enrich] 完成数据增强: ${lead.companyName}, 未找到联系人`);
    } else {
        // 失败
        await updateEnrichStatus(leadId, 'failed', result.error);
        logger.error(`[Enrich] 数据增强失败: ${lead.companyName} - ${result.error}`);
    }

    return result;
}
