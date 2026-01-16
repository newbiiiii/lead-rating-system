/**
 * API 服务入口
 * 用于管理和监控系统
 */

import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import Redis from 'ioredis';
import path from 'path';
import { logger } from '../utils/logger';
import { configLoader } from '../config/config-loader';

// 路由模块
import citiesRoutes from './cities.routes';
import dashboardRoutes from './routes/dashboard.routes';
import tasksRoutes from './routes/tasks.routes';
import ratingRoutes from './routes/rating.routes';
import crmRoutes from './routes/crm.routes';
import enrichRoutes from './routes/enrich.routes';
import monitoringRoutes from './routes/monitoring.routes';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*',
    }
});

// ============ Redis 订阅 (日志推送) ============
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
            // 推送到特定服务频道或通用频道 (避免重复推送)
            if (logEntry.service) {
                // 有 service 属性时，只推送到特定服务频道
                io.emit(`log:${logEntry.service}`, logEntry);
            } else {
                // 没有 service 属性时，推送到通用频道
                io.emit('log', logEntry);
            }
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

// ============ 中间件 ============
app.use(express.json());

// 托管静态文件
app.use(express.static(path.join(process.cwd(), 'public')));

// ============ 健康检查 ============
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 测试日志推送 (用于调试)
app.get('/api/test-log', (req, res) => {
    const service = req.query.service as string || 'scraper';
    const testLog = {
        level: 'info',
        message: `Test log from ${service} at ${new Date().toISOString()}`,
        timestamp: new Date().toISOString(),
        service: service
    };
    // 只推送到特定服务频道 (避免重复)
    io.emit(`log:${service}`, testLog);
    res.json({ success: true, log: testLog });
});


// ============ 路由注册 ============
// 城市数据
app.use('/api/cities', citiesRoutes);

// 首页看板
app.use('/api/dashboard', dashboardRoutes);
// 兼容旧路径
app.use('/api/queues/stats', (req, res, next) => {
    req.url = '/queues-stats';
    dashboardRoutes(req, res, next);
});
app.use('/api/companies', (req, res, next) => {
    req.url = '/companies' + req.url;
    dashboardRoutes(req, res, next);
});
app.use('/api/ratings', (req, res, next) => {
    req.url = '/ratings' + req.url;
    dashboardRoutes(req, res, next);
});

// 任务管理
app.use('/api/tasks', tasksRoutes);
// 聚合任务 (使用 tasks 路由的 /aggregate 子路径)
app.use('/api/aggregate-tasks', (req, res, next) => {
    req.url = '/aggregate' + req.url;
    tasksRoutes(req, res, next);
});
// 线索管理 (来自 tasks 路由)
app.use('/api/leads', (req, res, next) => {
    // 只处理不属于 rating 路由的请求
    if (req.url.startsWith('/pending-config') ||
        req.url.startsWith('/by-status') ||
        req.url.startsWith('/retry-rating')) {
        return next();
    }
    req.url = '/leads' + req.url;
    tasksRoutes(req, res, next);
});
// 数据导入
app.use('/api/import', (req, res, next) => {
    req.url = '/import' + req.url;
    tasksRoutes(req, res, next);
});

// 评分管理
app.use('/api/leads/pending-config', (req, res, next) => {
    req.url = '/pending-config' + req.url;
    ratingRoutes(req, res, next);
});
app.use('/api/leads/by-status', (req, res, next) => {
    req.url = '/by-status' + req.url;
    ratingRoutes(req, res, next);
});
app.use('/api/leads/retry-rating', (req, res, next) => {
    req.url = '/retry-rating' + req.url;
    ratingRoutes(req, res, next);
});
app.use('/api/leads/retry-rating-by-status', (req, res, next) => {
    req.url = '/retry-rating-by-status' + req.url;
    ratingRoutes(req, res, next);
});

// CRM 管理
app.use('/api/crm', crmRoutes);

// Enrich 管理
app.use('/api/enrich', enrichRoutes);

// 监控中心
app.use('/api/monitoring', monitoringRoutes);

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
