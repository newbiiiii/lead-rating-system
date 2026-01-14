/**
 * 首页看板路由
 */

import { Router } from 'express';
import { db } from '../../db';
import { companies, ratings } from '../../db/schema';
import { sql, desc } from 'drizzle-orm';
import { logger } from '../../utils/logger';

const router = Router();

// 获取评级分布统计 (A, B, C, D)
router.get('/grade-stats', async (req, res) => {
    try {
        // 统计所有线索总数
        const totalResult = await db.execute(sql`
            SELECT COUNT(*) as total FROM leads
        `);
        const totalCount = parseInt((totalResult.rows[0] as any).total) || 0;

        // 统计各评级分布（只统计已完成评级的）
        const gradeResult = await db.execute(sql`
            SELECT 
                COUNT(CASE WHEN lr.overall_rating = 'A' THEN 1 END) as "A",
                COUNT(CASE WHEN lr.overall_rating = 'B' THEN 1 END) as "B",
                COUNT(CASE WHEN lr.overall_rating = 'C' THEN 1 END) as "C",
                COUNT(CASE WHEN lr.overall_rating = 'D' THEN 1 END) as "D"
            FROM leads l
            LEFT JOIN lead_ratings lr ON l.id = lr.lead_id
            WHERE l.rating_status = 'completed'
        `);

        const stats = gradeResult.rows[0] as any;
        res.json({
            total: totalCount,
            A: parseInt(stats.A) || 0,
            B: parseInt(stats.B) || 0,
            C: parseInt(stats.C) || 0,
            D: parseInt(stats.D) || 0
        });
    } catch (error: any) {
        logger.error('获取评级分布统计失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 获取评级状态统计 (已评级/待评级/评级失败)
router.get('/rating-stats', async (req, res) => {
    try {
        const result = await db.execute(sql`
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN rating_status IN ('completed', 'skipped') THEN 1 END) as rated,
                COUNT(CASE WHEN rating_status = 'pending' THEN 1 END) as pending,
                COUNT(CASE WHEN rating_status IN ('failed', 'pending_config') THEN 1 END) as failed
            FROM leads
        `);

        const stats = result.rows[0] as any;
        res.json({
            total: parseInt(stats.total) || 0,
            rated: parseInt(stats.rated) || 0,
            pending: parseInt(stats.pending) || 0,
            failed: parseInt(stats.failed) || 0
        });
    } catch (error: any) {
        logger.error('获取评级状态统计失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 获取CRM同步状态统计 (已同步/待同步/同步失败) - 仅统计A/B级线索
router.get('/crm-stats', async (req, res) => {
    try {
        // 只统计已评级为A或B的线索的CRM同步状态
        const result = await db.execute(sql`
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN l.crm_sync_status = 'synced' THEN 1 END) as synced,
                COUNT(CASE WHEN l.crm_sync_status = 'pending' THEN 1 END) as pending,
                COUNT(CASE WHEN l.crm_sync_status = 'failed' THEN 1 END) as failed
            FROM leads l
            LEFT JOIN lead_ratings lr ON l.id = lr.lead_id
            WHERE lr.overall_rating IN ('A', 'B')
        `);

        const stats = result.rows[0] as any;
        res.json({
            total: parseInt(stats.total) || 0,
            synced: parseInt(stats.synced) || 0,
            pending: parseInt(stats.pending) || 0,
            failed: parseInt(stats.failed) || 0
        });
    } catch (error: any) {
        logger.error('获取CRM同步状态统计失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 获取数据漏斗统计 (Scrape → Rating → Enrich → CRM)
router.get('/pipeline-funnel', async (req, res) => {
    try {
        // 并行查询各阶段数据
        const [totalResult, ratedResult, enrichedResult, syncedResult] = await Promise.all([
            // 1. 总爬取量
            db.execute(sql`SELECT COUNT(*) as count FROM leads`),
            // 2. 已评级数量（A/B级）
            db.execute(sql`
                SELECT COUNT(*) as count 
                FROM leads l
                JOIN lead_ratings lr ON l.id = lr.lead_id
                WHERE lr.overall_rating IN ('A', 'B')
            `),
            // 3. 已增强数量（A/B级且已enrich）
            db.execute(sql`
                SELECT COUNT(*) as count 
                FROM leads l
                JOIN lead_ratings lr ON l.id = lr.lead_id
                WHERE lr.overall_rating IN ('A', 'B') AND l.enrich_status = 'enriched'
            `),
            // 4. 已同步CRM数量
            db.execute(sql`
                SELECT COUNT(*) as count 
                FROM leads l
                JOIN lead_ratings lr ON l.id = lr.lead_id
                WHERE lr.overall_rating IN ('A', 'B') AND l.crm_sync_status = 'synced'
            `)
        ]);

        const scraped = parseInt((totalResult.rows[0] as any).count) || 0;
        const rated = parseInt((ratedResult.rows[0] as any).count) || 0;
        const enriched = parseInt((enrichedResult.rows[0] as any).count) || 0;
        const synced = parseInt((syncedResult.rows[0] as any).count) || 0;

        res.json({
            stages: [
                {
                    name: '数据采集',
                    key: 'scraped',
                    count: scraped,
                    percentage: 100,
                    color: '#667eea',
                    description: '爬虫/搜索/导入'
                },
                {
                    name: 'AI评级',
                    key: 'rated',
                    count: rated,
                    percentage: scraped > 0 ? Math.round((rated / scraped) * 100) : 0,
                    color: '#f59e0b',
                    description: '筛选 A/B 级线索'
                },
                {
                    name: '数据增强',
                    key: 'enriched',
                    count: enriched,
                    percentage: scraped > 0 ? Math.round((enriched / scraped) * 100) : 0,
                    color: '#06b6d4',
                    description: 'Apollo 联系人补充'
                },
                {
                    name: 'CRM同步',
                    key: 'synced',
                    count: synced,
                    percentage: scraped > 0 ? Math.round((synced / scraped) * 100) : 0,
                    color: '#10b981',
                    description: '销售易 CRM'
                }
            ],
            summary: {
                totalLeads: scraped,
                qualityLeads: rated,
                enrichedLeads: enriched,
                syncedLeads: synced,
                overallConversion: scraped > 0 ? ((synced / scraped) * 100).toFixed(1) : '0'
            }
        });
    } catch (error: any) {
        logger.error('获取漏斗统计失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 获取最新优质客户 (支持按评级筛选)
router.get('/recent-leads', async (req, res) => {
    try {
        const grades = (req.query.grades as string)?.split(',') || ['A', 'B'];
        const limit = parseInt(req.query.limit as string) || 10;

        // 构建 IN 条件
        const gradeList = grades.map(g => `'${g.toUpperCase()}'`).join(',');

        const result = await db.execute(sql.raw(`
            SELECT 
                l.id,
                l.company_name as "companyName",
                l.website,
                l.industry,
                l.region,
                l.created_at as "createdAt",
                t.id as "taskId",
                t.name as "taskName",
                lr.overall_rating as "overallRating",
                lr.suggestion,
                lr.rated_at as "ratedAt"
            FROM leads l
            JOIN tasks t ON l.task_id = t.id
            JOIN lead_ratings lr ON l.id = lr.lead_id
            WHERE lr.overall_rating IN (${gradeList})
            ORDER BY lr.rated_at DESC
            LIMIT ${limit}
        `));

        res.json({
            data: result.rows,
            grades,
            count: result.rows.length
        });
    } catch (error: any) {
        logger.error('获取最新优质客户失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 获取队列状态
router.get('/queues-stats', async (req, res) => {
    try {
        // 从数据库查询爬虫队列状态 (基于 tasks 表)
        const scrapeResult = await db.execute(sql`
            SELECT 
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as waiting,
                COUNT(CASE WHEN status = 'running' THEN 1 END) as active,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
                COUNT(CASE WHEN status IN ('failed', 'cancelled') THEN 1 END) as failed
            FROM tasks
        `);
        const scrapeStats = scrapeResult.rows[0] as any;

        // 从数据库查询评级队列状态 (基于 leads 表的 rating_status)
        const ratingResult = await db.execute(sql`
            SELECT 
                COUNT(CASE WHEN rating_status = 'pending' THEN 1 END) as waiting,
                COUNT(CASE WHEN rating_status = 'processing' THEN 1 END) as active,
                COUNT(CASE WHEN rating_status IN ('completed', 'skipped') THEN 1 END) as completed,
                COUNT(CASE WHEN rating_status IN ('failed', 'pending_config') THEN 1 END) as failed
            FROM leads
        `);
        const ratingStats = ratingResult.rows[0] as any;

        // 从数据库查询CRM队列状态 (只统计A/B级线索)
        const crmResult = await db.execute(sql`
            SELECT 
                COUNT(CASE WHEN l.crm_sync_status = 'pending' THEN 1 END) as waiting,
                COUNT(CASE WHEN l.crm_sync_status = 'processing' THEN 1 END) as active,
                COUNT(CASE WHEN l.crm_sync_status = 'synced' THEN 1 END) as completed,
                COUNT(CASE WHEN l.crm_sync_status = 'failed' THEN 1 END) as failed
            FROM leads l
            LEFT JOIN lead_ratings lr ON l.id = lr.lead_id
            WHERE lr.overall_rating IN ('A', 'B')
        `);
        const crmStats = crmResult.rows[0] as any;

        // 从数据库查询Enrich队列状态 (只统计A/B级线索)
        const enrichResult = await db.execute(sql`
            SELECT 
                COUNT(CASE WHEN l.enrich_status = 'pending' THEN 1 END) as waiting,
                COUNT(CASE WHEN l.enrich_status = 'processing' THEN 1 END) as active,
                COUNT(CASE WHEN l.enrich_status = 'enriched' THEN 1 END) as completed,
                COUNT(CASE WHEN l.enrich_status = 'failed' THEN 1 END) as failed
            FROM leads l
            LEFT JOIN lead_ratings lr ON l.id = lr.lead_id
            WHERE lr.overall_rating IN ('A', 'B')
        `);
        const enrichStats = enrichResult.rows[0] as any;

        res.json({
            scrape: {
                waiting: parseInt(scrapeStats.waiting) || 0,
                active: parseInt(scrapeStats.active) || 0,
                completed: parseInt(scrapeStats.completed) || 0,
                failed: parseInt(scrapeStats.failed) || 0
            },
            rating: {
                waiting: parseInt(ratingStats.waiting) || 0,
                active: parseInt(ratingStats.active) || 0,
                completed: parseInt(ratingStats.completed) || 0,
                failed: parseInt(ratingStats.failed) || 0
            },
            crm: {
                waiting: parseInt(crmStats.waiting) || 0,
                active: parseInt(crmStats.active) || 0,
                completed: parseInt(crmStats.completed) || 0,
                failed: parseInt(crmStats.failed) || 0
            },
            enrich: {
                waiting: parseInt(enrichStats.waiting) || 0,
                active: parseInt(enrichStats.active) || 0,
                completed: parseInt(enrichStats.completed) || 0,
                failed: parseInt(enrichStats.failed) || 0
            }
        });
    } catch (error: any) {
        logger.error('获取队列状态失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 获取公司列表
router.get('/companies', async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;

        const results = await db
            .select()
            .from(companies)
            .orderBy(desc(companies.createdAt))
            .limit(limit)
            .offset(offset);

        res.json({ data: results, page, limit });
    } catch (error: any) {
        logger.error('查询公司失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 获取评级结果
router.get('/ratings', async (req, res) => {
    try {
        const minScore = parseFloat(req.query.minScore as string) || 0;
        const limit = parseInt(req.query.limit as string) || 20;

        const results = await db
            .select({
                rating: ratings,
                company: companies
            })
            .from(ratings)
            .innerJoin(companies, sql`${companies.id} = ${ratings.companyId}`)
            .where(sql`${ratings.totalScore} >= ${minScore}`)
            .orderBy(desc(ratings.totalScore))
            .limit(limit);

        res.json({ data: results });
    } catch (error: any) {
        logger.error('查询评级失败:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
