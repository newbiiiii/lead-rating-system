/**
 * 评分管理路由
 */

import { Router } from 'express';
import { db } from '../../db';
import { leads } from '../../db/schema';
import { sql, eq } from 'drizzle-orm';
import { logger } from '../../utils/logger';
import { ratingQueue } from '../../queue';

const router = Router();

// 查询待配置的线索
router.get('/pending-config', async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const pageSize = parseInt(req.query.pageSize as string) || 20;
        const offset = (page - 1) * pageSize;

        // 查询总数
        const countResult = await db.execute(sql`
            SELECT COUNT(*) as count
            FROM leads
            WHERE rating_status = 'pending_config'
        `);
        const total = parseInt(countResult.rows[0].count as string);

        // 查询数据
        const leadsResult = await db.execute(sql`
            SELECT 
                l.id,
                l.company_name as "companyName",
                l.website,
                l.created_at as "createdAt",
                l.rating_status as "ratingStatus",
                t.id as "taskId",
                t.name as "taskName"
            FROM leads l
            JOIN tasks t ON l.task_id = t.id
            WHERE l.rating_status = 'pending_config'
            ORDER BY l.created_at DESC
            LIMIT ${pageSize} OFFSET ${offset}
        `);

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
        logger.error('查询待配置线索失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 批量重新入队
router.post('/retry-rating', async (req, res) => {
    try {
        const { leadIds } = req.body;
        let leadsToRetry: any[];

        if (leadIds && Array.isArray(leadIds) && leadIds.length > 0) {
            // 查询指定的leads
            const placeholders = leadIds.map(id => `'${id}'`).join(',');
            const result = await db.execute(sql.raw(`
                SELECT l.id, l.task_id as "taskId"
                FROM leads l
                WHERE l.id IN (${placeholders}) AND l.rating_status = 'pending_config'
            `));
            leadsToRetry = result.rows as any[];
        } else {
            // 查询所有pending_config的leads
            const result = await db.execute(sql`
                SELECT l.id, l.task_id as "taskId"
                FROM leads l
                WHERE l.rating_status = 'pending_config'
            `);
            leadsToRetry = result.rows as any[];
        }

        if (leadsToRetry.length === 0) {
            return res.json({
                success: true,
                message: '没有找到需要重新评分的线索',
                count: 0
            });
        }

        // 更新状态为pending
        for (const lead of leadsToRetry) {
            await db.update(leads)
                .set({ ratingStatus: 'pending' })
                .where(eq(leads.id, lead.id));
            // 添加到rating队列
            await ratingQueue.add('rate-lead', {
                leadId: lead.id,
                taskId: lead.taskId
            });
        }

        logger.info(`成功将 ${leadsToRetry.length} 条线索重新加入评分队列`);
        res.json({
            success: true,
            message: `成功将 ${leadsToRetry.length} 条线索重新加入评分队列`,
            count: leadsToRetry.length
        });
    } catch (error: any) {
        logger.error('批量重新入队失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 查询指定状态的线索 (支持 pending_config, failed, pending, completed)
router.get('/by-status', async (req, res) => {
    try {
        const status = req.query.status as string || 'pending_config';
        const page = parseInt(req.query.page as string) || 1;
        const pageSize = parseInt(req.query.pageSize as string) || 20;
        const offset = (page - 1) * pageSize;
        const overallRating = req.query.overallRating as string || '';

        // 验证状态参数
        const validStatuses = ['pending_config', 'failed', 'pending', 'completed'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
        }

        // 构建 WHERE 条件
        let whereClause = `l.rating_status = '${status}'`;
        if (overallRating && ['A', 'B', 'C', 'D'].includes(overallRating)) {
            whereClause += ` AND lr.overall_rating = '${overallRating}'`;
        }

        // 查询总数
        const countResult = await db.execute(sql.raw(`
            SELECT COUNT(*) as count
            FROM leads l
            LEFT JOIN lead_ratings lr ON l.id = lr.lead_id
            WHERE ${whereClause}
        `));
        const total = parseInt(countResult.rows[0].count as string);

        // 查询数据
        const leadsResult = await db.execute(sql.raw(`
            SELECT 
                l.id,
                l.company_name as "companyName",
                l.website,
                l.created_at as "createdAt",
                l.rating_status as "ratingStatus",
                l.rating_error as "ratingError",
                t.id as "taskId",
                t.name as "taskName",
                lr.overall_rating as "overallRating",
                lr.suggestion,
                lr.think,
                lr.rated_at as "ratedAt"
            FROM leads l
            JOIN tasks t ON l.task_id = t.id
            LEFT JOIN lead_ratings lr ON l.id = lr.lead_id
            WHERE ${whereClause}
            ORDER BY l.created_at DESC
            LIMIT ${pageSize} OFFSET ${offset}
        `));

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
        logger.error('查询指定状态线索失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 按状态批量重新入队
router.post('/retry-rating-by-status', async (req, res) => {
    try {
        const { leadIds, status } = req.body;
        const targetStatus = status || 'pending_config';

        // 验证状态参数 - 现在也支持 completed 状态，允许重新评分已完成的线索
        const validStatuses = ['pending_config', 'failed', 'pending', 'completed'];
        if (!validStatuses.includes(targetStatus)) {
            return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
        }

        let leadsToRetry: any[];
        if (leadIds && Array.isArray(leadIds) && leadIds.length > 0) {
            // 查询指定的leads
            const placeholders = leadIds.map(id => `'${id}'`).join(',');
            const result = await db.execute(sql.raw(`
                SELECT l.id, l.task_id as "taskId"
                FROM leads l
                WHERE l.id IN (${placeholders}) AND l.rating_status = '${targetStatus}'
            `));
            leadsToRetry = result.rows as any[];
        } else {
            // 查询所有指定状态的leads
            const result = await db.execute(sql`
                SELECT l.id, l.task_id as "taskId"
                FROM leads l
                WHERE l.rating_status = ${targetStatus}
            `);
            leadsToRetry = result.rows as any[];
        }

        if (leadsToRetry.length === 0) {
            return res.json({
                success: true,
                message: '没有找到需要重新评分的线索',
                count: 0
            });
        }

        // 更新状态为pending并加入队列
        for (const lead of leadsToRetry) {
            await db.update(leads)
                .set({ ratingStatus: 'pending' })
                .where(eq(leads.id, lead.id));
            // 添加到rating队列
            await ratingQueue.add('rate-lead', {
                leadId: lead.id,
                taskId: lead.taskId
            });
        }

        logger.info(`成功将 ${leadsToRetry.length} 条 ${targetStatus} 状态线索重新加入评分队列`);
        res.json({
            success: true,
            message: `成功将 ${leadsToRetry.length} 条线索重新加入评分队列`,
            count: leadsToRetry.length
        });
    } catch (error: any) {
        logger.error('按状态批量重新入队失败:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
