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
 * 流程：
 * 1. 如果有域名，直接调用【根据公司域名补全联系人】
 * 2. 如果没有域名，先调用【根据公司名称查询域名】，再调用【根据公司域名补全联系人】
 * 3. 如果获取不到域名，返回失败
 * 
 * @param domain - 公司域名
 * @param companyName - 公司名称
 * @returns EnrichResult - 包含联系人列表或错误信息
 */
export async function enrichLeadContacts(
    domain: string | null,
    companyName: string
): Promise<EnrichResult> {
    const API_BASE = 'http://wechatapp.intco.com.cn:8090/jeecgboot/dcs/apollo';
    const API_KEY = 'QArbpOWRV0BmyVHRv9n';

    const headers = {
        'x-api-key': API_KEY,
        'Cookie': 'cookiesession1=678ADA7117856B8028B0CE2C17DC7F0C'
    };

    try {
        let domainToUse = domain;

        // 如果没有域名，先通过公司名称查询域名
        if (!domainToUse) {
            logger.info(`[Enrich] 公司 "${companyName}" 无域名，尝试通过名称查询...`);

            const searchUrl = `${API_BASE}/searchCompanyDomainByCompanyName?companyName=${encodeURIComponent(companyName)}`;
            const searchResponse = await fetch(searchUrl, {
                method: 'GET',
                headers
            });

            if (!searchResponse.ok) {
                return {
                    success: false,
                    error: `查询域名失败: HTTP ${searchResponse.status}`
                };
            }

            const searchResult = await searchResponse.json() as any;

            // 解析域名查询结果
            // SearchCompanyRecord: res=0 成功, companyWebsite 是域名
            if (searchResult && searchResult.res === 0 && searchResult.companyWebsite) {
                domainToUse = searchResult.companyWebsite;
                logger.info(`[Enrich] 通过公司名称查询到域名: ${domainToUse}`);
            } else if (searchResult && searchResult.companyWebsite) {
                // 兼容没有 res 字段的情况
                domainToUse = searchResult.companyWebsite;
                logger.info(`[Enrich] 通过公司名称查询到域名: ${domainToUse}`);
            } else {
                const errMsg = searchResult?.remark || `无法获取公司域名`;
                logger.warn(`[Enrich] 无法通过公司名称 "${companyName}" 查询到域名: ${errMsg}`);
                return {
                    success: false,
                    error: `无法获取公司域名: ${companyName} - ${errMsg}`
                };
            }
        }

        // 调用【根据公司域名补全联系人】接口
        logger.info(`[Enrich] 开始通过域名 "${domainToUse}" 补充联系人...`);

        const contactUrl = `${API_BASE}/completeAndGetContactByDomain?companyDomain=${encodeURIComponent(domainToUse!)}`;
        const contactResponse = await fetch(contactUrl, {
            method: 'GET',
            headers
        });

        if (!contactResponse.ok) {
            return {
                success: false,
                error: `补充联系人失败: HTTP ${contactResponse.status}`
            };
        }

        const contactResult = await contactResponse.json() as any;

        // 解析联系人结果
        // 返回格式为 List<ApolloPeopleVO>，直接是数组
        const rawContacts = Array.isArray(contactResult) ? contactResult :
            (contactResult?.result && Array.isArray(contactResult.result) ? contactResult.result : []);

        if (rawContacts.length > 0) {
            const contactList: ContactData[] = [];

            for (const c of rawContacts) {
                // ApolloPeopleVO 字段: id, keywordDomain, name, linkedinUrl, email, country, title, phoneNumber
                contactList.push({
                    name: c.name || '',
                    title: c.title || '',
                    email: c.email || '',
                    phone: c.phoneNumber || '',
                    mobile: '',
                    linkedinUrl: c.linkedinUrl || '',
                    isPrimary: false
                });
            }

            // 设置第一个为主要联系人
            if (contactList.length > 0) {
                contactList[0].isPrimary = true;
            }

            logger.info(`[Enrich] 成功获取 ${contactList.length} 个联系人`);

            return {
                success: true,
                contacts: contactList
            };
        } else {
            // 没有联系人也算成功，只是没找到
            logger.info(`[Enrich] 域名 "${domainToUse}" 未找到联系人`);
            return {
                success: true,
                contacts: []
            };
        }

    } catch (error: any) {
        logger.error(`[Enrich] API 调用异常:`, error.message);
        return {
            success: false,
            error: `API 调用异常: ${error.message}`
        };
    }
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
