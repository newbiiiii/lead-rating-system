/**
 * CRM Service 单元测试
 * 测试 CRM 同步逻辑
 */
import 'dotenv/config';
import {
    getLeadForCrm,
    callCrmApi,
    syncLeadToCrm,
    CrmLead
} from '../../src/services/crm.service';
import { db } from '../../src/db';
import { eq } from 'drizzle-orm';
import { leads } from '../../src/db/schema';
import {getBusinessContext} from "../../src/services/business.service";

// ============ 测试数据工厂 ============
const getTestLeadId = async (): Promise<string | null> => {
    // 查询一个已评分且等级为 A 或 B 的 lead
    const lead = await db.query.leads.findFirst({
        where: eq(leads.ratingStatus, 'completed')
    });

    if (!lead) {
        console.log('[警告] 没有找到已评分的 Lead，请先运行评分任务');
        return null;
    }

    console.log('[测试 Lead]', {
        id: lead.id,
        companyName: lead.companyName,
        crmSyncStatus: lead.crmSyncStatus
    });

    return lead.id;
};

// ============ 测试用例 ============

// 测试1: 获取 Lead 数据
console.log('测试1: 获取 Lead 数据');
const testGetLeadForCrm = async () => {
    // const leadId = await getTestLeadId();
    const leadId = '';
    if (!leadId) return;

    const lead = await getLeadForCrm(leadId);
    if (lead) {
        console.log('✓ 通过 - Lead 数据获取成功');
        console.log('  公司名称:', lead.companyName);
        console.log('  网站:', lead.website);
        console.log('  CRM状态:', lead.crmSyncStatus);
    } else {
        console.log('✗ 失败 - Lead 未找到');
    }
};

// 测试2: 模拟 CRM API 调用
console.log('\n测试2: 模拟 CRM API 调用');
const testCallCrmApi = async () => {
    // const leadId = await getTestLeadId();
    const leadId = 'a9477611-be97-4374-ad34-691b926051bb';
    if (!leadId) return;
    const crmLead: CrmLead | null = await getLeadForCrm(leadId);
    if (!crmLead) {
        console.log('✗ 获取 Lead 数据失败');
        return;
    }
    console.log('Crm Lead测试数据', crmLead)
    const result = await callCrmApi(crmLead, getBusinessContext(crmLead.taskName)?.apiKey);
    if (result.success) {
        console.log('✓ 通过 - CRM API 模拟调用成功');
        console.log('  消息:', result.message);
    } else {
        console.log('✗ 失败 - CRM API 模拟调用失败');
    }
};

// 测试3: 完整同步流程
console.log('\n测试3: 完整同步流程');
const testSyncLeadToCrm = async () => {
    const leadId = await getTestLeadId();
    if (!leadId) return;

    // 先重置状态为 pending 以便测试
    await db.update(leads)
        .set({ crmSyncStatus: 'pending' })
        .where(eq(leads.id, leadId));

    console.log('  重置 CRM 状态为 pending');

    const result = await syncLeadToCrm(leadId);
    if (result.success) {
        console.log('✓ 通过 - CRM 同步成功');
        console.log('  消息:', result.message);
        console.log('  同步时间:', result.syncedAt);
    } else {
        console.log('✗ 失败 - CRM 同步失败');
        console.log('  错误:', result.error);
    }

    // 验证数据库状态
    const updatedLead = await getLeadForCrm(leadId);
    if (updatedLead?.crmSyncStatus === 'synced') {
        console.log('✓ 数据库状态已更新为 synced');
    } else {
        console.log('✗ 数据库状态未更新:', updatedLead?.crmSyncStatus);
    }
};

// ============ 运行测试 ============
const runTests = async () => {
    console.log('=== CRM Service 测试开始 ===\n');

    // await testGetLeadForCrm();
    await testCallCrmApi();
    // await testSyncLeadToCrm();

    console.log('\n=== CRM Service 测试完成 ===');
    process.exit(0);
};

runTests();
