/**
 * Enrich 管理路由
 * 数据增强相关的 API 端点
 */

import { Router } from 'express';
import { db } from '../../db';
import { leads } from '../../db/schema';
import { sql, eq } from 'drizzle-orm';
import { logger } from '../../utils/logger';
import { enrichQueue } from '../../queue';

const router = Router();

// 查询 Enrich 统计
router.get('/stats', async (req: any, res: any) => {
    try {
        // 统计各状态的线索数量（仅 A/B 级）
        const statsResult = await db.execute(sql`
            SELECT 
                l.enrich_status as "status",
                COUNT(*) as "count"
            FROM leads l
            LEFT JOIN lead_ratings lr ON l.id = lr.lead_id
            WHERE lr.overall_rating IN ('A', 'B')
            GROUP BY l.enrich_status
        `);

        const stats = {
            pending: 0,
            enriched: 0,
            failed: 0,
            skipped: 0
        };

        for (const row of statsResult.rows as any[]) {
            if (row.status && stats.hasOwnProperty(row.status)) {
                stats[row.status as keyof typeof stats] = parseInt(row.count);
            }
        }

        res.json({ stats });
    } catch (error: any) {
        logger.error('查询 Enrich 统计失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 按 Enrich 状态查询线索（仅 A/B 级）
router.get('/leads', async (req: any, res: any) => {
    try {
        const enrichStatus = req.query.status as string || 'pending';
        const taskId = req.query.taskId as string;
        const page = parseInt(req.query.page as string) || 1;
        const pageSize = parseInt(req.query.pageSize as string) || 20;
        const offset = (page - 1) * pageSize;

        // 验证状态参数
        const validStatuses = ['pending', 'enriched', 'failed', 'skipped'];
        if (!validStatuses.includes(enrichStatus)) {
            return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
        }

        // 构建查询条件（只查询 A/B 级线索）
        let whereClause = sql`l.enrich_status = ${enrichStatus} AND lr.overall_rating IN ('A', 'B')`;
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
                l.enrich_status as "enrichStatus",
                l.enrich_error as "enrichError",
                l.enriched_at as "enrichedAt",
                l.created_at as "createdAt",
                t.id as "taskId",
                t.name as "taskName",
                lr.overall_rating as "overallRating",
                (SELECT COUNT(*) FROM contacts c WHERE c.lead_id = l.id) as "contactCount"
            FROM leads l
            JOIN tasks t ON l.task_id = t.id
            LEFT JOIN lead_ratings lr ON l.id = lr.lead_id
            WHERE ${whereClause}
            ORDER BY l.created_at DESC
            LIMIT ${pageSize} OFFSET ${offset}
        `);

        res.json({
            leads: leadsResult.rows,
            status: enrichStatus,
            pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize)
            }
        });
    } catch (error: any) {
        logger.error('查询 Enrich 线索失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 重试 Enrich（将线索重新加入队列）
router.post('/leads/retry', async (req: any, res: any) => {
    try {
        const { leadIds, status } = req.body;

        // status 参数必填
        if (!status) {
            return res.status(400).json({ error: 'status 参数必填，可选值: pending, failed' });
        }

        // 验证状态参数
        const validStatuses = ['pending', 'failed'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: `status 参数无效，可选值: ${validStatuses.join(', ')}` });
        }

        let leadsToRetry: any[];
        if (leadIds && Array.isArray(leadIds) && leadIds.length > 0) {
            // 查询指定的 leads（按 status 筛选，仅 A/B 级）
            const placeholders = leadIds.map((id: string) => `'${id}'`).join(',');
            const result = await db.execute(sql.raw(`
                SELECT l.id
                FROM leads l
                LEFT JOIN lead_ratings lr ON l.id = lr.lead_id
                WHERE l.id IN (${placeholders}) 
                  AND l.enrich_status = '${status}'
                  AND lr.overall_rating IN ('A', 'B')
            `));
            leadsToRetry = result.rows as any[];
        } else {
            // 查询指定状态的所有 leads（仅 A/B 级）
            const result = await db.execute(sql`
                SELECT l.id
                FROM leads l
                LEFT JOIN lead_ratings lr ON l.id = lr.lead_id
                WHERE l.enrich_status = ${status}
                  AND lr.overall_rating IN ('A', 'B')
            `);
            leadsToRetry = result.rows as any[];
        }

        if (leadsToRetry.length === 0) {
            return res.json({
                success: true,
                message: '没有找到需要重新增强的线索',
                count: 0
            });
        }

        // 更新状态并加入队列
        for (const lead of leadsToRetry) {
            await db.update(leads)
                .set({
                    enrichStatus: 'pending',
                    enrichError: null  // 清除之前的错误信息
                })
                .where(eq(leads.id, lead.id));

            await enrichQueue.add('enrichLead', {
                leadId: lead.id
            });
        }

        logger.info(`成功将 ${leadsToRetry.length} 条线索重新加入 Enrich 队列`);

        res.json({
            success: true,
            message: `成功将 ${leadsToRetry.length} 条线索重新加入 Enrich 队列`,
            count: leadsToRetry.length
        });
    } catch (error: any) {
        logger.error('重试 Enrich 失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 手动触发单个线索的 Enrich
router.post('/leads/:id/enrich', async (req: any, res: any) => {
    try {
        const { id } = req.params;

        // 查询线索
        const leadResult = await db.execute(sql`
            SELECT l.id, l.company_name, lr.overall_rating
            FROM leads l
            LEFT JOIN lead_ratings lr ON l.id = lr.lead_id
            WHERE l.id = ${id}
        `);

        if (leadResult.rows.length === 0) {
            return res.status(404).json({ error: '线索不存在' });
        }

        const lead = leadResult.rows[0] as any;

        // 更新状态为 pending
        await db.update(leads)
            .set({
                enrichStatus: 'pending',
                enrichError: null
            })
            .where(eq(leads.id, id));

        // 加入队列
        await enrichQueue.add('enrichLead', {
            leadId: id
        });

        logger.info(`手动触发 Enrich: ${lead.company_name}`);

        res.json({
            success: true,
            message: `已将线索 "${lead.company_name}" 加入 Enrich 队列`
        });
    } catch (error: any) {
        logger.error('手动触发 Enrich 失败:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
