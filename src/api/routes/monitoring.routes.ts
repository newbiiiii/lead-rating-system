/**
 * 监控中心路由
 */

import { Router } from 'express';
import { db } from '../../db';
import { sql } from 'drizzle-orm';
import { logger } from '../../utils/logger';

const router = Router();

// 获取监控状态
router.get('/status', async (req, res) => {
    try {
        // Scraper Stats: 对应 Task 的状态
        const scraperResult = await db.execute(sql`
            SELECT 
                COUNT(CASE WHEN status = 'running' THEN 1 END) as active,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as waiting,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
            FROM tasks
        `);
        const scraperStats = scraperResult.rows[0] as any;

        // Rating Stats: 对应 api/dashboard/rating-stats
        const ratingResult = await db.execute(sql`
            SELECT 
                COUNT(CASE WHEN rating_status = 'processing' THEN 1 END) as active,
                COUNT(CASE WHEN rating_status = 'pending' THEN 1 END) as waiting,
                COUNT(CASE WHEN rating_status IN ('completed', 'skipped') THEN 1 END) as completed,
                COUNT(CASE WHEN rating_status IN ('failed', 'pending_config') THEN 1 END) as failed
            FROM leads
        `);
        const ratingStats = ratingResult.rows[0] as any;

        // CRM Stats: 对应 api/dashboard/crm-stats (只统计 A/B 级)
        const crmResult = await db.execute(sql`
            SELECT 
                COUNT(CASE WHEN l.crm_sync_status = 'processing' THEN 1 END) as active,
                COUNT(CASE WHEN l.crm_sync_status = 'pending' THEN 1 END) as waiting,
                COUNT(CASE WHEN l.crm_sync_status = 'synced' THEN 1 END) as completed,
                COUNT(CASE WHEN l.crm_sync_status = 'failed' THEN 1 END) as failed
            FROM leads l
            LEFT JOIN lead_ratings lr ON l.id = lr.lead_id
            WHERE lr.overall_rating IN ('A', 'B')
        `);
        const crmStats = crmResult.rows[0] as any;

        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            stats: {
                scraper: {
                    active: parseInt(scraperStats.active) || 0,
                    waiting: parseInt(scraperStats.waiting) || 0,
                    completed: parseInt(scraperStats.completed) || 0,
                    failed: parseInt(scraperStats.failed) || 0
                },
                rating: {
                    active: parseInt(ratingStats.active) || 0,
                    waiting: parseInt(ratingStats.waiting) || 0,
                    completed: parseInt(ratingStats.completed) || 0,
                    failed: parseInt(ratingStats.failed) || 0
                },
                crm: {
                    active: parseInt(crmStats.active) || 0,
                    waiting: parseInt(crmStats.waiting) || 0,
                    completed: parseInt(crmStats.completed) || 0,
                    failed: parseInt(crmStats.failed) || 0
                }
            }
        });
    } catch (error: any) {
        logger.error('获取监控状态失败:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
