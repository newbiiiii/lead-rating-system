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
import multer from 'multer';
import * as XLSX from 'xlsx';
import { logger } from '../utils/logger';
import { TaskScheduler, scrapeQueue, processQueue, ratingQueue, importQueue, crmQueue } from '../queue';
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

// ============ 待配置规则管理 ============
// 查询待配置的线索
app.get('/api/leads/pending-config', async (req, res) => {
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
app.post('/api/leads/retry-rating', async (req, res) => {
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

// ============ 通用状态管理 ============
// 查询指定状态的线索 (支持 pending_config, failed, pending)
app.get('/api/leads/by-status', async (req, res) => {
    try {
        const status = req.query.status as string || 'pending_config';
        const page = parseInt(req.query.page as string) || 1;
        const pageSize = parseInt(req.query.pageSize as string) || 20;
        const offset = (page - 1) * pageSize;

        // 验证状态参数
        const validStatuses = ['pending_config', 'failed', 'pending'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
        }

        // 查询总数
        const countResult = await db.execute(sql`
            SELECT COUNT(*) as count
            FROM leads
            WHERE rating_status = ${status}
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
            WHERE l.rating_status = ${status}
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
        logger.error('查询指定状态线索失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 按状态批量重新入队
app.post('/api/leads/retry-rating-by-status', async (req, res) => {
    try {
        const { leadIds, status } = req.body;
        const targetStatus = status || 'pending_config';

        // 验证状态参数
        const validStatuses = ['pending_config', 'failed', 'pending'];
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

// ============ 数据导入 ============

// 配置 multer 用于文件上传
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB限制
    fileFilter: (req, file, cb) => {
        // 只允许 Excel 文件
        const allowedMimes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
            'application/vnd.ms-excel', // .xls
            'text/csv' // .csv
        ];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('只支持 Excel (.xlsx, .xls) 或 CSV 文件'));
        }
    }
});

// Excel列名映射到字段名
const COLUMN_MAPPING: Record<string, string> = {
    '公司名称': 'companyName',
    '公司': 'companyName',
    'company': 'companyName',
    'companyname': 'companyName',
    '网站': 'website',
    'website': 'website',
    '域名': 'domain',
    'domain': 'domain',
    '行业': 'industry',
    'industry': 'industry',
    '地区': 'region',
    '国家': 'region',
    'region': 'region',
    'country': 'region',
    '地址': 'address',
    'address': 'address',
    '联系人': 'contactName',
    '联系人姓名': 'contactName',
    'contact': 'contactName',
    'contactname': 'contactName',
    '职位': 'contactTitle',
    'title': 'contactTitle',
    'contacttitle': 'contactTitle',
    '邮箱': 'contactEmail',
    'email': 'contactEmail',
    'contactemail': 'contactEmail',
    '电话': 'contactPhone',
    'phone': 'contactPhone',
    'contactphone': 'contactPhone'
};

// 解析Excel数据
function parseExcelData(buffer: Buffer): any[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    // 映射列名
    return rawData.map((row: any) => {
        const mappedRow: any = {};
        for (const [key, value] of Object.entries(row)) {
            const normalizedKey = key.toLowerCase().trim();
            const mappedKey = COLUMN_MAPPING[normalizedKey] || COLUMN_MAPPING[key.trim()];
            if (mappedKey) {
                mappedRow[mappedKey] = String(value).trim();
            }
        }
        return mappedRow;
    }).filter(row => row.companyName); // 过滤掉没有公司名称的行
}

// 导入线索数据格式
interface ImportLeadData {
    companyName: string;
    website?: string;
    domain?: string;
    industry?: string;
    region?: string;
    address?: string;
    contactName?: string;
    contactTitle?: string;
    contactEmail?: string;
    contactPhone?: string;
}

// Excel文件导入线索
app.post('/api/import/leads', upload.single('file'), async (req: any, res: any) => {
    try {
        const file = req.file;
        const taskName = req.body.taskName;
        const source = req.body.source || 'import';  // 来源分类，默认为 import

        if (!file) {
            return res.status(400).json({ error: '请上传 Excel 文件' });
        }

        // 解析 Excel
        const data = parseExcelData(file.buffer) as ImportLeadData[];

        if (data.length === 0) {
            return res.status(400).json({ error: 'Excel 文件中没有有效数据，请确保包含"公司名称"列' });
        }

        const { randomUUID } = await import('crypto');
        const now = new Date();

        // 1. 创建导入任务
        const taskId = randomUUID();
        await db.insert(tasks).values({
            id: taskId,
            name: taskName || `手动导入 ${now.toLocaleDateString('zh-CN')}`,
            description: `导入 ${data.length} 条线索`,
            source: source,
            query: 'manual-import',
            status: 'completed',
            progress: 100,
            totalLeads: data.length,
            successLeads: data.length,
            failedLeads: 0,
            startedAt: now,
            completedAt: now,
            createdAt: now,
            updatedAt: now
        });

        // 2. 批量插入线索和联系人
        const insertedLeads: string[] = [];

        for (const item of data) {
            const leadId = randomUUID();

            // 插入线索 (跳过rating，直接进入CRM流程)
            await db.insert(leads).values({
                id: leadId,
                taskId: taskId,
                companyName: item.companyName,
                domain: item.domain || null,
                website: item.website || null,
                industry: item.industry || null,
                region: item.region || null,
                address: item.address || null,
                source: 'import',
                ratingStatus: 'skipped', // 跳过评分
                crmSyncStatus: 'pending', // 待同步CRM
                scrapedAt: now,
                createdAt: now,
                updatedAt: now
            });

            // 如果有联系人信息，插入联系人
            if (item.contactName || item.contactEmail || item.contactPhone) {
                await db.insert(contacts).values({
                    id: randomUUID(),
                    leadId: leadId,
                    name: item.contactName || null,
                    title: item.contactTitle || null,
                    email: item.contactEmail || null,
                    phone: item.contactPhone || null,
                    source: 'import',
                    isPrimary: true,
                    createdAt: now,
                    updatedAt: now
                });
            }

            insertedLeads.push(leadId);

            // 3. 加入CRM队列
            await crmQueue.add('saveToCrm', {
                type: 'saveToCrm',
                leadId: leadId
            });
        }

        logger.info(`成功导入 ${insertedLeads.length} 条线索，任务ID: ${taskId}`);

        res.json({
            success: true,
            message: `成功导入 ${insertedLeads.length} 条线索`,
            taskId: taskId,
            leadIds: insertedLeads,
            count: insertedLeads.length
        });
    } catch (error: any) {
        logger.error('导入线索失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 查询已导入的线索
app.get('/api/import/leads', async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const pageSize = parseInt(req.query.pageSize as string) || 20;
        const taskId = req.query.taskId as string;
        const offset = (page - 1) * pageSize;

        // 构建查询条件
        let whereClause = sql`l.source = 'import'`;
        if (taskId) {
            whereClause = sql`${whereClause} AND l.task_id = ${taskId}`;
        }

        // 查询总数
        const countResult = await db.execute(sql`
            SELECT COUNT(*) as count
            FROM leads l
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
                l.industry,
                l.region,
                l.address,
                l.crm_sync_status as "crmSyncStatus",
                l.crm_synced_at as "crmSyncedAt",
                l.created_at as "createdAt",
                t.id as "taskId",
                t.name as "taskName",
                c.name as "contactName",
                c.email as "contactEmail",
                c.phone as "contactPhone",
                c.title as "contactTitle"
            FROM leads l
            JOIN tasks t ON l.task_id = t.id
            LEFT JOIN contacts c ON l.id = c.lead_id AND c.is_primary = true
            WHERE ${whereClause}
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
        logger.error('查询导入线索失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 查询导入任务列表
app.get('/api/import/tasks', async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const pageSize = parseInt(req.query.pageSize as string) || 20;
        const offset = (page - 1) * pageSize;

        // 查询import类型的任务
        const tasksList = await db.query.tasks.findMany({
            where: eq(tasks.source, 'import'),
            orderBy: desc(tasks.createdAt),
            limit: pageSize,
            offset
        });

        // 获取总数
        const countResult = await db.execute(sql`
            SELECT COUNT(*) as count
            FROM tasks
            WHERE source = 'import'
        `);
        const total = parseInt(countResult.rows[0].count as string);

        res.json({
            tasks: tasksList,
            pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize)
            }
        });
    } catch (error: any) {
        logger.error('查询导入任务列表失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 批量触发CRM同步
app.post('/api/import/leads/sync-crm', async (req, res) => {
    try {
        const { leadIds } = req.body;

        if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
            return res.status(400).json({ error: '请提供有效的线索ID数组' });
        }

        // 查询指定的import线索
        const placeholders = leadIds.map(id => `'${id}'`).join(',');
        const result = await db.execute(sql.raw(`
            SELECT id
            FROM leads
            WHERE id IN (${placeholders}) AND source = 'import'
        `));

        const validLeads = result.rows as any[];

        if (validLeads.length === 0) {
            return res.json({
                success: true,
                message: '没有找到需要同步的导入线索',
                count: 0
            });
        }

        // 更新状态并加入队列
        for (const lead of validLeads) {
            await db.update(leads)
                .set({ crmSyncStatus: 'pending' })
                .where(eq(leads.id, lead.id));

            await crmQueue.add('saveToCrm', {
                type: 'saveToCrm',
                leadId: lead.id
            });
        }

        logger.info(`成功将 ${validLeads.length} 条导入线索加入CRM同步队列`);

        res.json({
            success: true,
            message: `成功将 ${validLeads.length} 条线索加入CRM同步队列`,
            count: validLeads.length
        });
    } catch (error: any) {
        logger.error('批量触发CRM同步失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ CRM 同步管理 ============

// 查询任务的CRM同步统计
app.get('/api/crm/tasks', async (req: any, res: any) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const pageSize = parseInt(req.query.pageSize as string) || 20;
        const offset = (page - 1) * pageSize;

        // 查询所有任务及其CRM同步统计
        const tasksResult = await db.execute(sql`
            SELECT 
                t.id,
                t.name,
                t.source,
                t.query,
                t.total_leads as "totalLeads",
                t.created_at as "createdAt",
                COUNT(CASE WHEN l.crm_sync_status = 'pending' THEN 1 END) as "pendingCount",
                COUNT(CASE WHEN l.crm_sync_status = 'synced' THEN 1 END) as "syncedCount",
                COUNT(CASE WHEN l.crm_sync_status = 'failed' THEN 1 END) as "failedCount"
            FROM tasks t
            LEFT JOIN leads l ON t.id = l.task_id
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
app.get('/api/crm/leads', async (req: any, res: any) => {
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

        // 构建查询条件
        let whereClause = sql`l.crm_sync_status = ${crmStatus}`;
        if (taskId) {
            whereClause = sql`${whereClause} AND l.task_id = ${taskId}`;
        }

        // 查询总数
        const countResult = await db.execute(sql`
            SELECT COUNT(*) as count
            FROM leads l
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
                c.email as "contactEmail"
            FROM leads l
            JOIN tasks t ON l.task_id = t.id
            LEFT JOIN contacts c ON l.id = c.lead_id AND c.is_primary = true
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
app.post('/api/crm/leads/retry', async (req: any, res: any) => {
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

// ============ Dashboard 统计 ============

// 获取评级分布统计 (A, B, C, D)
app.get('/api/dashboard/grade-stats', async (req, res) => {
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
app.get('/api/dashboard/rating-stats', async (req, res) => {
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

// 获取CRM同步状态统计 (已同步/待同步/同步失败)
app.get('/api/dashboard/crm-stats', async (req, res) => {
    try {
        const result = await db.execute(sql`
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN crm_sync_status = 'synced' THEN 1 END) as synced,
                COUNT(CASE WHEN crm_sync_status = 'pending' THEN 1 END) as pending,
                COUNT(CASE WHEN crm_sync_status = 'failed' THEN 1 END) as failed
            FROM leads
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

// 获取最新优质客户 (支持按评级筛选)
app.get('/api/dashboard/recent-leads', async (req, res) => {
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

// ============ 队列监控 ============

app.get('/api/queues/stats', async (req, res) => {
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
                COUNT(CASE WHEN rating_status = 'completed' THEN 1 END) as completed,
                COUNT(CASE WHEN rating_status IN ('failed', 'pending_config') THEN 1 END) as failed
            FROM leads
        `);
        const ratingStats = ratingResult.rows[0] as any;

        // 从数据库查询CRM队列状态 (基于 leads 表的 crm_sync_status)
        const crmResult = await db.execute(sql`
            SELECT 
                COUNT(CASE WHEN crm_sync_status = 'pending' THEN 1 END) as waiting,
                COUNT(CASE WHEN crm_sync_status = 'processing' THEN 1 END) as active,
                COUNT(CASE WHEN crm_sync_status = 'synced' THEN 1 END) as completed,
                COUNT(CASE WHEN crm_sync_status = 'failed' THEN 1 END) as failed
            FROM leads
        `);
        const crmStats = crmResult.rows[0] as any;

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
            }
        });
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
