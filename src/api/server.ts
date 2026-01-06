/**
 * 简单的 API 服务
 * 用于管理和监控系统
 */

import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { logger } from '../utils/logger';
import { TaskScheduler, scrapeQueue, processQueue, ratingQueue, automationQueue } from '../queue';
import { db } from '../db';
import { companies, ratings } from '../db/schema';
import { desc, sql } from 'drizzle-orm';
import { eventEmitter } from '../utils/event-emitter';

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(express.json());

// 托管静态文件
app.use(express.static(path.join(process.cwd(), 'public')));

const scheduler = new TaskScheduler();

// WebSocket实时推送
io.on('connection', (socket) => {
    logger.info(`[WebSocket] 客户端连接: ${socket.id}`);
    socket.on('disconnect', () => logger.info(`[WebSocket] 客户端断开: ${socket.id}`));
});

// 订阅Redis事件并转发到前端
eventEmitter.subscribe((event) => io.emit('progress', event));

// ============ 健康检查 ============
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============ 任务管理 ============

// 添加爬取任务
app.post('/api/tasks/scrape', async (req, res) => {
    try {
        const { source, query, limit, priority } = req.body;

        await scheduler.scheduleScrapeTask({ source, query, limit, priority });

        res.json({ success: true, message: '任务已添加' });
    } catch (error: any) {
        logger.error('添加任务失败:', error);
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
    await eventEmitter.close();
    io.close();
    process.exit(0);
});
