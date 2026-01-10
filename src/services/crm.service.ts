/**
 * CRM Service - CRM 同步核心逻辑
 * 从 worker 中提取出来，方便测试
 */

import { db } from '../db';
import { leads, automationLogs } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';

/**
 * Lead 数据类型（从数据库查询后的结构）
 */
export interface CrmLead {
    taskId: string;
    taskName: string;
    source: string;
    country: string;
    city: string;
    leadId: string;
    companyName: string;
    domain: string | null;
    website: string | null;
    industry: string | null;
    scrapedAt: Date;
    rating: string;
    overallRating: string | null;
    suggestion: string | null;
    think: string | null;
    name: string;
    title: string;
    email: string;
    phone: string;
    mobile: string;
    linkedinUrl: string;
    crmSyncStatus: string | null;
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
 * CRM 认证接口
 */
export interface XiaoshouyiAuthResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    tenant_id: string;
    instance_uri: string;
}

/**
 * 获取 Lead 数据用于 CRM 同步
 */
export async function getLeadForCrm(leadId: string): Promise<CrmLead | null> {
    const leadsData = await db.execute(sql`
        SELECT t.id AS "taskId",
               t.name AS "taskName",
               t.source,
               t.config #>> '{"geolocation","country"}' AS country,
               t.config #>> '{"geolocation","city"}'AS city,
               l.id AS "leadId",
               l.company_name AS "companyName",
               l.domain,
               l.website,
               l.industry,
               l.scraped_at AS "scrapedAt",
               l.rating,
               lr.overall_rating AS "overallRating",
               lr.suggestion,
               lr.think,
               c.name,
               c.title,
               c.email,
               c.phone,
               c.mobile,
               c.linkedin_url AS "linkedinUrl"
        FROM leads l
            JOIN tasks t ON l.task_id = t.id
            JOIN lead_ratings lr ON l.id = lr.lead_id
            JOIN contacts c ON l.id = c.lead_id
        WHERE l.id = ${leadId}
        ORDER BY l.created_at DESC
            `);

    const lead = leadsData?.rows?.[0];
    if (!lead) {
        return null;
    }

    return lead as unknown as CrmLead;
}

/**
 * 调用 CRM API
 */
export async function callCrmApi(lead: CrmLead): Promise<{ success: boolean; message: string }> {
    // 1.1. 获取token
    const accessToken = await getAccessToken();
    logger.info(`[CRM同步] 获取token: ${accessToken}`);

    // 1.2. 查询lead描述
    const leadDescResponse = await fetch('https://api.xiaoshouyi.com/rest/data/v2.0/xobjects/lead/description', {
        method: 'GET',
        headers: {
            'Authorization': accessToken as string,
        },
    });
    const leadDescResult: any = await leadDescResponse.json();

    // 1.3. 根据国家映射国家
    const leadCountrySelectItem = leadDescResult.data.fields.find((field: any) => field.apiKey === 'dbcSelect2').selectitem;
    logger.info(`[CRM同步] lead描述-国家选项: ${leadCountrySelectItem.length}`)
    const leadCountryValue = leadCountrySelectItem.find((item: any) => item.label.slice(0, -2).endsWith(lead.country))?.value;
    logger.info(`[CRM同步] lead描述-国家值: ${leadCountryValue}`)

    // 1.4. 根据线索等级映射线索等级
    const ratingSelectItem = leadDescResult.data.fields.find((field: any) => field.apiKey === 'customItem211__c').selectitem;
    logger.info(`[CRM同步] lead描述-线索等级选项: ${ratingSelectItem.length}`)
    const ratingValue = ratingSelectItem.find((item: any) => item.label === lead.overallRating)?.value;
    logger.info(`[CRM同步] lead描述-线索等级值: ${ratingValue}`)


    // 2. 封装请求参数
    const createLeadBody = {
        "data": {
            "entityType": 3112761,                                                  // 写死即可
            "dbcSelect4": 30,                                                       // 线索来源,固定为30-AI数字营销
            "companyName": cleanCompanyName(lead.companyName),                      // 公司名称
            "dbcTextarea1": "AI数字营销获客",                                         // 线索描述,固定为 AI数字营销获客
            "name": !!lead.name ? lead.name : lead.companyName,                     // 联系人姓名
            "territoryHighSeaId": 3392360243429516,                                 // 所属区域公海,暂时固定为 RPA线索公海池[线索]
            "email": lead.email?.replace(/\s+/g, ""),                               // 联系人邮箱
            "customItem200__c": lead.domain,                                        // 线索官网
            "dbcSelect2": leadCountryValue,                                         // 国家/地区
            "customItem211__c": ratingValue,                                        // 线索等级
            "phone": lead.phone?.replace(/\s+/g, ""),                               // 联系人电话
        }
    }
    logger.info(`[CRM同步] 封装推送数据: ${JSON.stringify(createLeadBody)}`);

    // 3. 调用接口
    const response = await fetch('https://api.xiaoshouyi.com/rest/data/v2.0/xobjects/lead', {
        method: 'POST',
        headers: {
            'Authorization': accessToken as string,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(createLeadBody)
    });
    const result: any = await response.json();

    logger.info(`[CRM同步] 状态码: ${response.status}, 成功: ${response.ok}`);
    logger.info(`[CRM同步] 接口返回内容: ${JSON.stringify(result, null, 2)}`);

    // 如果API返回失败，返回失败结果，以便之后标记为同步失败
    if (!response.ok || (result?.code !== 200 && result?.code !== '200')) {
        const errorMsg = result?.message || result?.msg || `CRM API 返回错误码: ${result?.code || response.status}`;
        logger.error(`[CRM同步] 错误详情: ${JSON.stringify(result)}`);
        return {
            success: false,
            message: errorMsg
        };
    }

    logger.info(`[CRM同步] 线索创建成功: ${lead.companyName}`);
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
        // 更新 Lead 状态，清除错误信息
        await tx.update(leads)
            .set({
                crmSyncStatus: 'synced',
                crmSyncedAt: new Date(),
                crmSyncError: null,
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

    // 更新 Lead 状态为失败，并保存错误原因
    await db.update(leads)
        .set({
            crmSyncStatus: 'failed',
            crmSyncError: errorMessage,
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

        // 如果API调用失败，标记为同步失败
        if (!apiResult.success) {
            await markLeadAsFailed(leadId, apiResult.message);
            return {
                success: false,
                leadId: leadId,
                message: apiResult.message,
                error: apiResult.message
            };
        }

        // 3. 更新数据库状态为成功
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


export async function getAccessToken() {
    const url = 'https://login.xiaoshouyi.com/auc/oauth2/token';

    // 使用 URLSearchParams 模拟 --data-urlencode
    const params = new URLSearchParams();
    params.append('grant_type', 'password');
    params.append('client_id', '9b01d1b3df5784a361f08dc4bc5202fb');
    params.append('client_secret', '32bcb52f2d38bd6306e04b9df7e8aea1');
    params.append('username', 'lishiqi@intco.com.cn');
    params.append('password', 'intco2813e19a5X99');

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`HTTP Error: ${response.status} - ${JSON.stringify(errorData)}`);
        }

        const data = await response.json();
        const authData = data as XiaoshouyiAuthResponse;

        return authData.access_token;
    } catch (error) {
        console.error('请求出错:', error);
    }
}

const cleanCompanyName = (rawCompanyName: string) => {
    return rawCompanyName.replace("LTD.", 'LTD')
        .replace("INC.", "INC")
        .replace("PLC.", "PLC")
        .replace("LLC.", "LLC")
        .replace("LLP.", "LLP")
        .replace("PVT.", "PVT")
        .replace("BHD.", "BHD")
        .replace("PT.", "PT")
        .replace("TBK.", "TBK")
        .replace("GMBH.", "GMBH")
        .replace("A.G", "AG")
        .replace("S.A.", "SA")
        .replace("S.A.R.L.", "SARL")
        .replace("B.V.", "BV")
        .replace("N.V.", "NV")
        .replace("S.P.A.", "SPA")
        .replace("S.R.L.", "SRL")
        .replace("AB.", "AB")
        .replace("OY.", "OY")
        .replace("S.R.O.", "SRO")
        .toUpperCase()
        .trim();
}