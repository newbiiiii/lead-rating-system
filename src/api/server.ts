/**
 * 简单的 API 服务
 * 用于管理和监控系统
 */

import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import Redis from 'ioredis';
import path from 'path';
import { logger } from '../utils/logger';
import { TaskScheduler, scrapeQueue, processQueue, ratingQueue, automationQueue } from '../queue';
import { db } from '../db';
import { tasks, leads, contacts, companies, ratings, searchPoints } from '../db/schema';
import { desc, sql, eq, and } from 'drizzle-orm';
import { configLoader } from '../config/config-loader';
import citiesRoutes from './cities.routes';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*',
    }
});

// Redis 订阅客户端
const redisConfig = configLoader.get('database.redis');
const redisSub = new Redis({
    host: redisConfig.host,
    port: redisConfig.port,
    password: redisConfig.password,
});

redisSub.subscribe('logs', (err, count) => {
    if (err) {
        logger.error('Redis 订阅失败:', err);
    } else {
        logger.info(`已订阅 ${count} 个 Redis 频道`);
    }
});

redisSub.on('message', (channel, message) => {
    if (channel === 'logs') {
        try {
            const logEntry = JSON.parse(message);
            io.emit('log', logEntry);
        } catch (e) {
            // 忽略解析错误
        }
    }
});

io.on('connection', (socket) => {
    logger.info(`客户端已连接: ${socket.id}`);
    socket.on('disconnect', () => {
        logger.info(`客户端已断开: ${socket.id}`);
    });
});

app.use(express.json());

// 托管静态文件
app.use(express.static(path.join(process.cwd(), 'public')));

const scheduler = new TaskScheduler();

// ============ 健康检查 ============
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============ 城市数据 ============
app.use('/api/cities', citiesRoutes);

// ============ 任务管理 ============

// 添加爬取任务
app.post('/api/tasks/scrape', async (req, res) => {
    try {
        const { source, query, limit, priority, config } = req.body;

        // 传递config到scheduler
        await scheduler.scheduleScrapeTask({ source, query, limit, priority, config });

        res.json({ success: true, message: '任务已添加' });
    } catch (error: any) {
        logger.error('添加任务失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 查询任务列表
app.get('/api/tasks', async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;
        const status = req.query.status as string;
        const query = req.query.query as string;

        // 构建WHERE条件
        const whereConditions = [];
        if (status) {
            whereConditions.push(eq(tasks.status, status));
        }
        if (query) {
            const lowerQuery = `%${query.toLowerCase()}%`;
            whereConditions.push(
                sql`(LOWER(${tasks.name}) LIKE ${lowerQuery} OR LOWER(${tasks.query}) LIKE ${lowerQuery})`
            );
        }

        const tasksList = await db.query.tasks.findMany({
            where: whereConditions.length > 0 ? and(...whereConditions) : undefined,
            orderBy: desc(tasks.createdAt),
            limit,
            offset,
            with: {
                searchPoints: true  // 包含searchPoints用于计算进度
            }
        });

        // 计算每个任务的searchPoints进度
        const tasksWithProgress = tasksList.map(task => {
            const sp = task.searchPoints || [];
            const totalPoints = sp.length;
            const completedPoints = sp.filter(p => p.status === 'completed').length;
            const failedPoints = sp.filter(p => p.status === 'failed').length;
            const runningPoints = sp.filter(p => p.status === 'running').length;

            // 计算进度: (已完成 + 失败) / 总数 * 100
            const progress = totalPoints > 0
                ? Math.round(((completedPoints + failedPoints) / totalPoints) * 100)
                : task.progress || 0;

            return {
                ...task,
                progress,
                searchPointsStats: {
                    total: totalPoints,
                    completed: completedPoints,
                    failed: failedPoints,
                    running: runningPoints,
                    pending: totalPoints - completedPoints - failedPoints - runningPoints
                },
                searchPoints: undefined  // 不返回完整的searchPoints数组，节省带宽
            };
        });

        // 获取总数（使用相同的WHERE条件）
        const total = await db.select({ count: sql<number>`count(*)` })
            .from(tasks)
            .where(whereConditions.length > 0 ? and(...whereConditions) : undefined);

        res.json({
            tasks: tasksWithProgress,
            total: Number(total[0].count),
            page,
            pageSize: limit
        });
    } catch (error: any) {
        logger.error('查询任务列表失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 终止任务
app.post('/api/tasks/:id/terminate', async (req, res) => {
    try {
        const taskId = req.params.id;
        // 更新任务状态为cancelled
        await db.update(tasks)
            .set({ status: 'cancelled' })
            .where(eq(tasks.id, taskId));
        // 取消所有pending和running状态的search points
        await db.update(searchPoints)
            .set({
                status: 'cancelled',
                error: 'Task terminated by user'
            })
            .where(
                and(
                    eq(searchPoints.taskId, taskId),
                    sql`${searchPoints.status} IN ('pending', 'running')`
                )
            );
        // 获取更新后的任务
        const task = await db.query.tasks.findFirst({
            where: eq(tasks.id, taskId)
        });
        res.json({
            success: true,
            message: '任务已终止',
            task
        });
    } catch (error: any) {
        logger.error('终止任务失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 查询任务详情（带分页和筛选）
app.get('/api/tasks/:id', async (req, res) => {
    try {
        const taskId = req.params.id;
        const page = parseInt(req.query.page as string) || 1;
        const pageSize = parseInt(req.query.pageSize as string) || 20;
        const ratingStatus = req.query.ratingStatus as string;  // pending, completed, failed
        const offset = (page - 1) * pageSize;

        // 查询任务基本信息
        const task = await db.query.tasks.findFirst({
            where: eq(tasks.id, taskId)
        });

        if (!task) {
            return res.status(404).json({ error: '任务未找到' });
        }

        // 构建leads查询条件
        let whereConditions = sql`l.task_id = ${taskId}`;
        if (ratingStatus) {
            whereConditions = sql`${whereConditions} AND l.rating_status = ${ratingStatus}`;
        }

        // 查询leads总数
        const countResult = await db.execute(sql`
            SELECT COUNT(*) as count
            FROM leads l
            WHERE ${whereConditions}
        `);
        const total = parseInt(countResult.rows[0].count as string);

        // 查询leads数据（带分页）
        const leadsResult = await db.execute(sql`
            SELECT 
                l.id,
                l.company_name as "companyName",
                l.domain,
                l.website,
                l.industry,
                l.region,
                l.address,
                l.employee_count as "employeeCount",
                l.estimated_size as "estimatedSize",
                l.rating,
                l.review_count as "reviewCount",
                l.source,
                l.source_url as "sourceUrl",
                l.rating_status as "ratingStatus",
                l.scraped_at as "scrapedAt",
                l.created_at as "createdAt",
                l.updated_at as "updatedAt",
                lr.id as "ratingId",
                lr.overall_rating as "overallRating",
                lr.suggestion,
                lr.think,
                lr.rated_at as "ratedAt"
            FROM leads l
            LEFT JOIN lead_ratings lr ON l.id = lr.lead_id
            WHERE ${whereConditions}
            ORDER BY l.created_at DESC
            LIMIT ${pageSize} OFFSET ${offset}
        `);

        res.json({
            task,
            leads: leadsResult.rows,
            pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize)
            },
            filters: {
                ratingStatus: ratingStatus || null
            }
        });
    } catch (error: any) {
        logger.error('查询任务详情失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 查询线索列表
app.get('/api/leads', async (req, res) => {
    try {
        const taskId = req.query.taskId as string;
        const ratingStatus = req.query.ratingStatus as string;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = (page - 1) * limit;

        const whereConditions = [];
        if (taskId) whereConditions.push(eq(leads.taskId, taskId));
        if (ratingStatus) whereConditions.push(eq(leads.ratingStatus, ratingStatus));

        const leadsList = await db.query.leads.findMany({
            where: whereConditions.length > 0 ? and(...whereConditions) : undefined,
            with: {
                contacts: true,
                rating: true
            },
            limit,
            offset,
            orderBy: desc(leads.createdAt)
        });

        res.json({
            leads: leadsList,
            page,
            pageSize: limit
        });
    } catch (error: any) {
        logger.error('查询线索列表失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 查询单个线索详情
app.get('/api/leads/:id', async (req, res) => {
    try {
        const lead = await db.query.leads.findFirst({
            where: eq(leads.id, req.params.id),
            with: {
                contacts: true,
                rating: true,
                task: true
            }
        });

        if (!lead) {
            return res.status(404).json({ error: '线索未找到' });
        }

        res.json(lead);
    } catch (error: any) {
        logger.error('查询线索详情失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 批量添加任务
app.post('/api/tasks/scrape/batch', async (req, res) => {
    try {
        const { tasks } = req.body;

        await scheduler.scheduleBatchScrape(tasks);

        res.json({ success: true, message: `已添加 ${tasks.length} 个任务` });
    } catch (error: any) {
        logger.error('批量添加任务失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ 队列监控 ============

app.get('/api/queues/stats', async (req, res) => {
    try {
        const queues = {
            scrape: scrapeQueue,
            process: processQueue,
            rating: ratingQueue,
            automation: automationQueue
        };

        const stats: any = {};

        for (const [name, queue] of Object.entries(queues)) {
            const [waiting, active, completed, failed] = await Promise.all([
                queue.getWaitingCount(),
                queue.getActiveCount(),
                queue.getCompletedCount(),
                queue.getFailedCount()
            ]);

            stats[name] = { waiting, active, completed, failed };
        }

        res.json(stats);
    } catch (error: any) {
        logger.error('获取队列状态失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ 数据查询 ============

// 获取公司列表
app.get('/api/companies', async (req, res) => {
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
app.get('/api/ratings', async (req, res) => {
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

// ============ 启动服务 ============

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
    logger.info(`✓ API 服务已启动: http://localhost:${PORT}`);
    logger.info(`✓ WebSocket 服务已启动`);
    logger.info(`  健康检查: http://localhost:${PORT}/health`);
    logger.info(`  队列状态: http://localhost:${PORT}/api/queues/stats`);
});

// 优雅关闭
process.on('SIGTERM', async () => {
    logger.info('收到 SIGTERM，关闭服务...');
    io.close();
    process.exit(0);
});
