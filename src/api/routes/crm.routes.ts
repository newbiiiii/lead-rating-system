/**
 * CRM 管理路由
 */

import { Router } from 'express';
import { db } from '../../db';
import { leads } from '../../db/schema';
import { sql, eq } from 'drizzle-orm';
import { logger } from '../../utils/logger';
import { crmQueue } from '../../queue';

const router = Router();

// 查询任务的CRM同步统计 (仅统计A/B级线索)
router.get('/tasks', async (req: any, res: any) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const pageSize = parseInt(req.query.pageSize as string) || 20;
        const offset = (page - 1) * pageSize;

        // 查询所有任务及其CRM同步统计 (只统计A/B级线索)
        const tasksResult = await db.execute(sql`
            SELECT 
                t.id,
                t.name,
                t.source,
                t.query,
                t.total_leads as "totalLeads",
                t.created_at as "createdAt",
                COUNT(CASE WHEN l.crm_sync_status = 'pending' AND lr.overall_rating IN ('A', 'B') THEN 1 END) as "pendingCount",
                COUNT(CASE WHEN l.crm_sync_status = 'synced' AND lr.overall_rating IN ('A', 'B') THEN 1 END) as "syncedCount",
                COUNT(CASE WHEN l.crm_sync_status = 'failed' AND lr.overall_rating IN ('A', 'B') THEN 1 END) as "failedCount"
            FROM tasks t
            LEFT JOIN leads l ON t.id = l.task_id
            LEFT JOIN lead_ratings lr ON l.id = lr.lead_id
            GROUP BY t.id, t.name, t.source, t.query, t.total_leads, t.created_at
            ORDER BY t.created_at DESC
            LIMIT ${pageSize} OFFSET ${offset}
        `);

        // 获取总数
        const countResult = await db.execute(sql`
            SELECT COUNT(*) as count FROM tasks
        `);
        const total = parseInt(countResult.rows[0].count as string);

        res.json({
            tasks: tasksResult.rows,
            pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize)
            }
        });
    } catch (error: any) {
        logger.error('查询CRM任务统计失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 按CRM同步状态查询线索
router.get('/leads', async (req: any, res: any) => {
    try {
        const crmStatus = req.query.status as string || 'pending';
        const taskId = req.query.taskId as string;
        const page = parseInt(req.query.page as string) || 1;
        const pageSize = parseInt(req.query.pageSize as string) || 20;
        const offset = (page - 1) * pageSize;

        // 验证状态参数
        const validStatuses = ['pending', 'synced', 'failed'];
        if (!validStatuses.includes(crmStatus)) {
            return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
        }

        // 构建查询条件 (只查询A/B级线索)
        let whereClause = sql`l.crm_sync_status = ${crmStatus} AND lr.overall_rating IN ('A', 'B')`;
        if (taskId) {
            whereClause = sql`${whereClause} AND l.task_id = ${taskId}`;
        }

        // 查询总数
        const countResult = await db.execute(sql`
            SELECT COUNT(*) as count
            FROM leads l
            LEFT JOIN lead_ratings lr ON l.id = lr.lead_id
            WHERE ${whereClause}
        `);
        const total = parseInt(countResult.rows[0].count as string);

        // 查询数据
        const leadsResult = await db.execute(sql`
            SELECT
                l.id,
                l.company_name as "companyName",
                l.website,
                l.domain,
                l.source,
                l.rating_status as "ratingStatus",
                l.crm_sync_status as "crmSyncStatus",
                l.crm_sync_error as "crmSyncError",
                l.crm_synced_at as "crmSyncedAt",
                l.created_at as "createdAt",
                t.id as "taskId",
                t.name as "taskName",
                c.name as "contactName",
                c.email as "contactEmail",
                lr.overall_rating as "overallRating"
            FROM leads l
            JOIN tasks t ON l.task_id = t.id
            LEFT JOIN contacts c ON l.id = c.lead_id AND c.is_primary = true
            LEFT JOIN lead_ratings lr ON l.id = lr.lead_id
            WHERE ${whereClause}
            ORDER BY l.created_at DESC
            LIMIT ${pageSize} OFFSET ${offset}
        `);

        res.json({
            leads: leadsResult.rows,
            status: crmStatus,
            pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize)
            }
        });
    } catch (error: any) {
        logger.error('查询CRM同步线索失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 重试CRM同步（将线索重新加入队列）
router.post('/leads/retry', async (req: any, res: any) => {
    try {
        const { leadIds, status } = req.body;

        // status 参数必填
        if (!status) {
            return res.status(400).json({ error: 'status 参数必填，可选值: pending, failed, synced' });
        }

        // 验证状态参数（只允许 pending 和 failed 状态重新加入队列）
        const validStatuses = ['pending', 'failed', 'synced'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: `status 参数无效，可选值: ${validStatuses.join(', ')}` });
        }

        let leadsToRetry: any[];
        if (leadIds && Array.isArray(leadIds) && leadIds.length > 0) {
            // 查询指定的leads（按status筛选）
            const placeholders = leadIds.map((id: string) => `'${id}'`).join(',');
            const result = await db.execute(sql.raw(`
                SELECT id
                FROM leads
                WHERE id IN (${placeholders}) AND crm_sync_status = '${status}'
            `));
            leadsToRetry = result.rows as any[];
        } else {
            // 查询指定状态的所有leads
            const result = await db.execute(sql`
                SELECT id
                FROM leads
                WHERE crm_sync_status = ${status}
            `);
            leadsToRetry = result.rows as any[];
        }

        if (leadsToRetry.length === 0) {
            return res.json({
                success: true,
                message: '没有找到需要重新同步的线索',
                count: 0
            });
        }

        // 更新状态并加入队列
        for (const lead of leadsToRetry) {
            await db.update(leads)
                .set({
                    crmSyncStatus: 'pending',
                    crmSyncError: null  // 清除之前的错误信息
                })
                .where(eq(leads.id, lead.id));

            await crmQueue.add('saveToCrm', {
                type: 'saveToCrm',
                leadId: lead.id
            });
        }

        logger.info(`成功将 ${leadsToRetry.length} 条线索重新加入CRM同步队列`);

        res.json({
            success: true,
            message: `成功将 ${leadsToRetry.length} 条线索重新加入CRM同步队列`,
            count: leadsToRetry.length
        });
    } catch (error: any) {
        logger.error('重试CRM同步失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// =============== 待配置规则（pending_config）管理 ===============

// 获取待配置规则的线索统计
router.get('/pending-config/summary', async (req: any, res: any) => {
    try {
        const result = await db.execute(sql`
            SELECT COUNT(*) as count
            FROM leads l
            JOIN lead_ratings lr ON l.id = lr.lead_id
            WHERE l.crm_sync_status = 'pending_config'
            AND lr.overall_rating IN ('A', 'B')
        `);
        const count = parseInt(result.rows[0].count as string) || 0;

        res.json({ count });
    } catch (error: any) {
        logger.error('获取待配置规则统计失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 查询待配置规则的线索列表
router.get('/pending-config/leads', async (req: any, res: any) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const pageSize = parseInt(req.query.pageSize as string) || 20;
        const offset = (page - 1) * pageSize;

        // 获取待配置规则的线索
        const leadsResult = await db.execute(sql`
            SELECT 
                l.id,
                l.company_name as "companyName",
                l.domain,
                l.website,
                l.crm_sync_status as "crmSyncStatus",
                l.crm_sync_error as "crmSyncError",
                l.updated_at as "updatedAt",
                t.id as "taskId",
                t.name as "taskName",
                lr.overall_rating as "overallRating"
            FROM leads l
            JOIN tasks t ON l.task_id = t.id
            JOIN lead_ratings lr ON l.id = lr.lead_id
            WHERE l.crm_sync_status = 'pending_config'
            AND lr.overall_rating IN ('A', 'B')
            ORDER BY l.updated_at DESC
            LIMIT ${pageSize} OFFSET ${offset}
        `);

        // 获取总数
        const countResult = await db.execute(sql`
            SELECT COUNT(*) as count
            FROM leads l
            JOIN lead_ratings lr ON l.id = lr.lead_id
            WHERE l.crm_sync_status = 'pending_config'
            AND lr.overall_rating IN ('A', 'B')
        `);
        const total = parseInt(countResult.rows[0].count as string);

        res.json({
            leads: leadsResult.rows,
            pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize)
            }
        });
    } catch (error: any) {
        logger.error('查询待配置规则线索失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 批量重试待配置规则的线索（在配置好规则后）
router.post('/pending-config/retry', async (req: any, res: any) => {
    try {
        const { leadIds, all } = req.body;

        let leadsToRetry: any[] = [];

        if (all) {
            // 重试所有待配置规则的线索
            const result = await db.execute(sql`
                SELECT l.id FROM leads l
                JOIN lead_ratings lr ON l.id = lr.lead_id
                WHERE l.crm_sync_status = 'pending_config'
                AND lr.overall_rating IN ('A', 'B')
            `);
            leadsToRetry = result.rows as any[];
        } else if (leadIds && Array.isArray(leadIds) && leadIds.length > 0) {
            // 重试指定的线索
            const placeholders = leadIds.map(id => `'${id}'`).join(',');
            const result = await db.execute(sql.raw(`
                SELECT l.id FROM leads l
                JOIN lead_ratings lr ON l.id = lr.lead_id
                WHERE l.id IN (${placeholders})
                AND l.crm_sync_status = 'pending_config'
                AND lr.overall_rating IN ('A', 'B')
            `));
            leadsToRetry = result.rows as any[];
        } else {
            return res.status(400).json({ error: '请提供 leadIds 数组或设置 all=true' });
        }

        if (leadsToRetry.length === 0) {
            return res.json({ success: true, message: '没有找到需要重试的线索', count: 0 });
        }

        // 更新状态并加入队列
        for (const lead of leadsToRetry) {
            await db.update(leads)
                .set({
                    crmSyncStatus: 'pending',
                    crmSyncError: null
                })
                .where(eq(leads.id, lead.id));

            await crmQueue.add('saveToCrm', {
                type: 'saveToCrm',
                leadId: lead.id
            });
        }

        logger.info(`待配置规则重试: 成功将 ${leadsToRetry.length} 条线索重新加入CRM同步队列`);

        res.json({
            success: true,
            message: `成功将 ${leadsToRetry.length} 条线索重新加入CRM同步队列`,
            count: leadsToRetry.length
        });
    } catch (error: any) {
        logger.error('重试待配置规则线索失败:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
