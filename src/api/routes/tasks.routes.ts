/**
 * 任务管理路由
 */

import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { db } from '../../db';
import { tasks, leads, contacts, searchPoints, aggregateTasks } from '../../db/schema';
import { sql, eq, and, desc } from 'drizzle-orm';
import { logger } from '../../utils/logger';
import { TaskScheduler, scrapeQueue, crmQueue } from '../../queue';

const router = Router();
const scheduler = new TaskScheduler();

// 配置 multer 用于文件上传
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB限制
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv'
        ];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('只支持 Excel (.xlsx, .xls) 或 CSV 文件'));
        }
    }
});

// Excel列名映射
const COLUMN_MAPPING: Record<string, string> = {
    '公司名称': 'companyName', '公司': 'companyName', 'company': 'companyName', 'companyname': 'companyName',
    '网站': 'website', 'website': 'website',
    '域名': 'domain', 'domain': 'domain',
    '行业': 'industry', 'industry': 'industry',
    '地区': 'region', '国家': 'region', 'region': 'region', 'country': 'region',
    '地址': 'address', 'address': 'address',
    '联系人': 'contactName', '联系人姓名': 'contactName', 'contact': 'contactName', 'contactname': 'contactName',
    '职位': 'contactTitle', 'title': 'contactTitle', 'contacttitle': 'contactTitle',
    '邮箱': 'contactEmail', 'email': 'contactEmail', 'contactemail': 'contactEmail',
    '电话': 'contactPhone', 'phone': 'contactPhone', 'contactphone': 'contactPhone'
};

function parseExcelData(buffer: Buffer): any[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet, { defval: '' });

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
    }).filter(row => row.companyName);
}

// ============ 任务管理 ============

// 添加爬取任务
router.post('/scrape', async (req, res) => {
    try {
        const { source, query, limit, priority, config } = req.body;
        await scheduler.scheduleScrapeTask({ source, query, limit, priority, config });
        res.json({ success: true, message: '任务已添加' });
    } catch (error: any) {
        logger.error('添加任务失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 批量添加任务
router.post('/scrape/batch', async (req, res) => {
    try {
        const { tasks } = req.body;
        await scheduler.scheduleBatchScrape(tasks);
        res.json({ success: true, message: `已添加 ${tasks.length} 个任务` });
    } catch (error: any) {
        logger.error('批量添加任务失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 添加 Google 搜索任务
router.post('/search-scrape', async (req, res) => {
    try {
        const { query, limit = 50, config = {} } = req.body;

        if (!query || query.trim() === '') {
            return res.status(400).json({ error: '请提供搜索关键词' });
        }

        const { randomUUID } = await import('crypto');
        const { Queue } = await import('bullmq');

        const redisConfig = {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD || undefined
        };

        const searchScrapeQueue = new Queue('search-scrape', { connection: redisConfig });

        const taskId = randomUUID();
        const now = new Date();
        const taskName = `Google Search - ${query}`;

        // 创建任务记录
        await db.insert(tasks).values({
            id: taskId,
            name: taskName,
            source: 'google_search',
            query: query.trim(),
            targetCount: limit,
            config: config,
            status: 'pending',
            progress: 0,
            totalLeads: 0,
            successLeads: 0,
            failedLeads: 0,
            createdAt: now,
            updatedAt: now
        });

        // 添加到队列
        await searchScrapeQueue.add('search-scrape', {
            query: query.trim(),
            limit,
            config,
            taskId
        }, {
            priority: 5,
            jobId: `search-${taskId}`
        });

        await searchScrapeQueue.close();

        logger.info(`创建 Google 搜索任务成功: ${taskId}, 关键词: ${query}`);

        res.json({
            success: true,
            message: '搜索任务创建成功',
            taskId,
            query: query.trim(),
            limit
        });
    } catch (error: any) {
        logger.error('创建搜索任务失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 查询任务列表
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;
        const status = req.query.status as string;
        const query = req.query.query as string;

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
                searchPoints: true
            }
        });

        const tasksWithProgress = tasksList.map(task => {
            const sp = task.searchPoints || [];
            const totalPoints = sp.length;
            const completedPoints = sp.filter(p => p.status === 'completed').length;
            const failedPoints = sp.filter(p => p.status === 'failed').length;
            const runningPoints = sp.filter(p => p.status === 'running').length;
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
                searchPoints: undefined
            };
        });

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

// ============ 聚合任务管理 ============
// 注意：聚合任务路由必须在 /:id 之前定义，否则 /aggregate 会被匹配为任务ID

// 创建聚合任务
router.post('/aggregate', async (req, res) => {
    try {
        const { name, description, keywords, countries, cities } = req.body;

        if (!name || !keywords || !Array.isArray(keywords) || keywords.length === 0) {
            return res.status(400).json({ error: '请提供任务名称和至少一个关键词' });
        }
        if (!countries || !Array.isArray(countries) || countries.length === 0) {
            return res.status(400).json({ error: '请选择至少一个国家/地区' });
        }

        const { randomUUID } = await import('crypto');
        const aggregateTaskId = randomUUID();
        const now = new Date();
        const citiesArray = cities || [];
        const totalSubTasks = keywords.length * citiesArray.length;

        await db.insert(aggregateTasks).values({
            id: aggregateTaskId,
            name,
            description,
            keywords: keywords,
            countries: countries,
            totalSubTasks,
            completedSubTasks: 0,
            failedSubTasks: 0,
            status: 'pending',
            createdAt: now,
            updatedAt: now
        });

        const subTasksToCreate: any[] = [];
        const scrapeJobs: any[] = [];

        for (const keyword of keywords) {
            for (const cityInfo of citiesArray) {
                const taskId = randomUUID();
                const taskName = `${keyword} - ${cityInfo.city}, ${cityInfo.country}`;

                subTasksToCreate.push({
                    id: taskId, aggregateTaskId, name: taskName, description: `聚合任务子任务: ${name}`,
                    source: 'google_maps', query: keyword,
                    config: {
                        geolocation: {
                            country: cityInfo.country, city: cityInfo.city,
                            latitude: cityInfo.lat, longitude: cityInfo.lng,
                            radius: cityInfo.radius || 0.2, step: 0.1, zoom: 15
                        }
                    },
                    status: 'pending', progress: 0, totalLeads: 0, successLeads: 0, failedLeads: 0,
                    createdAt: now, updatedAt: now
                });

                scrapeJobs.push({
                    name: 'scrape',
                    data: {
                        source: 'google_maps', query: keyword, limit: 99, priority: 5,
                        taskId, aggregateTaskId,
                        config: {
                            geolocation: {
                                country: cityInfo.country, city: cityInfo.city,
                                latitude: cityInfo.lat, longitude: cityInfo.lng,
                                radius: cityInfo.radius || 0.2, step: 0.1, zoom: 15
                            }
                        }
                    },
                    opts: { priority: 5, jobId: `aggregate-${aggregateTaskId}-${taskId}` }
                });
            }
        }

        if (subTasksToCreate.length > 0) {
            await db.insert(tasks).values(subTasksToCreate);
        }

        await db.update(aggregateTasks)
            .set({ status: 'running', startedAt: now, updatedAt: now })
            .where(eq(aggregateTasks.id, aggregateTaskId));

        if (scrapeJobs.length > 0) {
            await scrapeQueue.addBulk(scrapeJobs);
        }

        logger.info(`创建聚合任务成功: ${aggregateTaskId}, 子任务数: ${totalSubTasks}`);

        res.json({
            success: true,
            message: `聚合任务创建成功，共创建 ${totalSubTasks} 个子任务`,
            aggregateTaskId, totalSubTasks, keywords: keywords.length, cities: citiesArray.length
        });
    } catch (error: any) {
        logger.error('创建聚合任务失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 查询聚合任务列表
router.get('/aggregate', async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;
        const status = req.query.status as string;

        const whereConditions = [];
        if (status) {
            whereConditions.push(eq(aggregateTasks.status, status));
        }

        const tasksList = await db.query.aggregateTasks.findMany({
            where: whereConditions.length > 0 ? and(...whereConditions) : undefined,
            orderBy: desc(aggregateTasks.createdAt),
            limit, offset
        });

        const total = await db.select({ count: sql<number>`count(*)` })
            .from(aggregateTasks)
            .where(whereConditions.length > 0 ? and(...whereConditions) : undefined);

        res.json({
            aggregateTasks: tasksList,
            total: Number(total[0].count),
            page, pageSize: limit
        });
    } catch (error: any) {
        logger.error('查询聚合任务列表失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 查询聚合任务详情
router.get('/aggregate/:id', async (req, res) => {
    try {
        const aggregateTaskId = req.params.id;
        const page = parseInt(req.query.page as string) || 1;
        const pageSize = parseInt(req.query.pageSize as string) || 20;
        const offset = (page - 1) * pageSize;

        const aggregateTask = await db.query.aggregateTasks.findFirst({
            where: eq(aggregateTasks.id, aggregateTaskId)
        });

        if (!aggregateTask) {
            return res.status(404).json({ error: '聚合任务未找到' });
        }

        const countResult = await db.select({ count: sql<number>`count(*)` })
            .from(tasks)
            .where(eq(tasks.aggregateTaskId, aggregateTaskId));
        const total = Number(countResult[0].count);

        const subTasks = await db.query.tasks.findMany({
            where: eq(tasks.aggregateTaskId, aggregateTaskId),
            orderBy: desc(tasks.createdAt),
            limit: pageSize, offset,
            with: { searchPoints: true }
        });

        const subTasksWithProgress = subTasks.map(task => {
            const sp = task.searchPoints || [];
            const totalPoints = sp.length;
            const completedPoints = sp.filter(p => p.status === 'completed').length;
            const failedPoints = sp.filter(p => p.status === 'failed').length;
            const progress = totalPoints > 0
                ? Math.round(((completedPoints + failedPoints) / totalPoints) * 100)
                : task.progress || 0;
            return { ...task, progress, searchPoints: undefined };
        });

        const statsResult = await db.execute(sql`
            SELECT 
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
                COUNT(CASE WHEN status = 'running' THEN 1 END) as running,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
                COUNT(CASE WHEN status IN ('failed', 'cancelled') THEN 1 END) as failed,
                COALESCE(SUM(total_leads), 0) as "totalLeads",
                COALESCE(SUM(success_leads), 0) as "successLeads"
            FROM tasks WHERE aggregate_task_id = ${aggregateTaskId}
        `);
        const stats = statsResult.rows[0] as any;

        res.json({
            aggregateTask,
            subTasks: subTasksWithProgress,
            stats: {
                pending: parseInt(stats.pending) || 0,
                running: parseInt(stats.running) || 0,
                completed: parseInt(stats.completed) || 0,
                failed: parseInt(stats.failed) || 0,
                totalLeads: parseInt(stats.totalLeads) || 0,
                successLeads: parseInt(stats.successLeads) || 0
            },
            pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
        });
    } catch (error: any) {
        logger.error('查询聚合任务详情失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 终止聚合任务
router.post('/aggregate/:id/terminate', async (req, res) => {
    try {
        const aggregateTaskId = req.params.id;

        await db.update(aggregateTasks)
            .set({ status: 'cancelled', updatedAt: new Date() })
            .where(eq(aggregateTasks.id, aggregateTaskId));

        await db.update(tasks)
            .set({ status: 'cancelled', error: 'Aggregate task terminated by user' })
            .where(and(eq(tasks.aggregateTaskId, aggregateTaskId), sql`${tasks.status} IN ('pending', 'running')`));

        await db.execute(sql`
            UPDATE search_points 
            SET status = 'cancelled', error = 'Aggregate task terminated by user'
            WHERE task_id IN (SELECT id FROM tasks WHERE aggregate_task_id = ${aggregateTaskId}) 
            AND status IN ('pending', 'running')
        `);

        res.json({ success: true, message: '聚合任务已终止' });
    } catch (error: any) {
        logger.error('终止聚合任务失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 生成搜索关键词
router.post('/aggregate/generate-keywords', async (req, res) => {
    try {
        const { description, count = 10 } = req.body;
        if (!description) {
            return res.status(400).json({ error: '请提供需求描述' });
        }

        const baseKeywords = description.split(/[,，、\s]+/).filter((k: string) => k.trim());
        const suffixes = ['manufacturer', 'supplier', 'factory', 'wholesale', 'company', 'exporter'];
        const generatedKeywords: string[] = [];

        for (const base of baseKeywords) {
            generatedKeywords.push(base.trim());
            for (const suffix of suffixes) {
                if (generatedKeywords.length < count) {
                    generatedKeywords.push(`${base.trim()} ${suffix}`);
                }
            }
        }

        const uniqueKeywords = [...new Set(generatedKeywords)].slice(0, count);

        res.json({ success: true, keywords: uniqueKeywords, count: uniqueKeywords.length });
    } catch (error: any) {
        logger.error('生成关键词失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ 任务详情 (放在聚合任务之后) ============

// 终止任务
router.post('/:id/terminate', async (req, res) => {
    try {
        const taskId = req.params.id;
        await db.update(tasks)
            .set({ status: 'cancelled' })
            .where(eq(tasks.id, taskId));
        await db.update(searchPoints)
            .set({ status: 'cancelled', error: 'Task terminated by user' })
            .where(and(eq(searchPoints.taskId, taskId), sql`${searchPoints.status} IN ('pending', 'running')`));
        const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
        res.json({ success: true, message: '任务已终止', task });
    } catch (error: any) {
        logger.error('终止任务失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 查询任务详情
router.get('/:id', async (req, res) => {
    try {
        const taskId = req.params.id;
        const page = parseInt(req.query.page as string) || 1;
        const pageSize = parseInt(req.query.pageSize as string) || 20;
        const ratingStatus = req.query.ratingStatus as string;
        const offset = (page - 1) * pageSize;

        const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
        if (!task) {
            return res.status(404).json({ error: '任务未找到' });
        }

        let whereConditions = sql`l.task_id = ${taskId}`;
        if (ratingStatus) {
            whereConditions = sql`${whereConditions} AND l.rating_status = ${ratingStatus}`;
        }

        const countResult = await db.execute(sql`SELECT COUNT(*) as count FROM leads l WHERE ${whereConditions}`);
        const total = parseInt(countResult.rows[0].count as string);

        const leadsResult = await db.execute(sql`
            SELECT 
                l.id, l.company_name as "companyName", l.domain, l.website, l.industry, l.region, l.address,
                l.employee_count as "employeeCount", l.estimated_size as "estimatedSize", l.rating, l.review_count as "reviewCount",
                l.source, l.source_url as "sourceUrl", l.rating_status as "ratingStatus", l.scraped_at as "scrapedAt",
                l.created_at as "createdAt", l.updated_at as "updatedAt",
                lr.id as "ratingId", lr.overall_rating as "overallRating", lr.suggestion, lr.think, lr.rated_at as "ratedAt"
            FROM leads l
            LEFT JOIN lead_ratings lr ON l.id = lr.lead_id
            WHERE ${whereConditions}
            ORDER BY l.created_at DESC
            LIMIT ${pageSize} OFFSET ${offset}
        `);

        res.json({
            task,
            leads: leadsResult.rows,
            pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
            filters: { ratingStatus: ratingStatus || null }
        });
    } catch (error: any) {
        logger.error('查询任务详情失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ 线索管理 ============

// 查询线索列表
router.get('/leads', async (req, res) => {
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
            with: { contacts: true, rating: true },
            limit, offset,
            orderBy: desc(leads.createdAt)
        });

        res.json({ leads: leadsList, page, pageSize: limit });
    } catch (error: any) {
        logger.error('查询线索列表失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 查询单个线索详情
router.get('/leads/:id', async (req, res) => {
    try {
        const lead = await db.query.leads.findFirst({
            where: eq(leads.id, req.params.id),
            with: { contacts: true, rating: true, task: true }
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

// ============ 数据导入 ============

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
router.post('/import/leads', upload.single('file'), async (req: any, res: any) => {
    try {
        const file = req.file;
        const taskName = req.body.taskName;
        const source = req.body.source || 'import';

        if (!file) {
            return res.status(400).json({ error: '请上传 Excel 文件' });
        }

        const data = parseExcelData(file.buffer) as ImportLeadData[];

        if (data.length === 0) {
            return res.status(400).json({ error: 'Excel 文件中没有有效数据，请确保包含"公司名称"列' });
        }

        // 验证每行数据
        const errors: string[] = [];
        const validData: ImportLeadData[] = [];

        data.forEach((row, index) => {
            const rowNum = index + 2; // Excel 行号（第一行是表头）
            const rowErrors: string[] = [];

            // 1. 公司名称必填
            if (!row.companyName || row.companyName.trim() === '') {
                rowErrors.push('公司名称为空');
            }

            // 2. 域名必填（如果没有 domain，尝试从 website 提取）
            if (!row.domain || row.domain.trim() === '') {
                if (row.website && row.website.trim() !== '') {
                    // 尝试从 website 提取 domain
                    try {
                        const url = new URL(row.website.startsWith('http') ? row.website : `https://${row.website}`);
                        row.domain = url.hostname.replace(/^www\./, '');
                    } catch {
                        rowErrors.push('域名为空且无法从网站提取');
                    }
                } else {
                    rowErrors.push('域名为空');
                }
            }

            // 3. 邮箱或电话至少填一个
            const hasEmail = row.contactEmail && row.contactEmail.trim() !== '';
            const hasPhone = row.contactPhone && row.contactPhone.trim() !== '';
            if (!hasEmail && !hasPhone) {
                rowErrors.push('邮箱和电话至少填一个');
            }

            if (rowErrors.length > 0) {
                errors.push(`第 ${rowNum} 行: ${rowErrors.join(', ')}`);
            } else {
                validData.push(row);
            }
        });

        // 如果有错误，返回详细信息
        if (errors.length > 0) {
            const maxErrors = 10; // 最多显示10条错误
            const errorMessage = errors.length > maxErrors
                ? `发现 ${errors.length} 条数据不符合要求，前 ${maxErrors} 条错误：\n${errors.slice(0, maxErrors).join('\n')}\n...还有 ${errors.length - maxErrors} 条`
                : `发现 ${errors.length} 条数据不符合要求：\n${errors.join('\n')}`;

            return res.status(400).json({
                error: errorMessage,
                validCount: validData.length,
                invalidCount: errors.length
            });
        }

        const { randomUUID } = await import('crypto');
        const now = new Date();
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

        const insertedLeads: string[] = [];

        for (const item of data) {
            const leadId = randomUUID();

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
                ratingStatus: 'skipped',
                crmSyncStatus: 'pending',
                scrapedAt: now,
                createdAt: now,
                updatedAt: now
            });

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

            await crmQueue.add('saveToCrm', { type: 'saveToCrm', leadId: leadId });
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
router.get('/import/leads', async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const pageSize = parseInt(req.query.pageSize as string) || 20;
        const taskId = req.query.taskId as string;
        const offset = (page - 1) * pageSize;

        let whereClause = sql`l.source = 'import'`;
        if (taskId) {
            whereClause = sql`${whereClause} AND l.task_id = ${taskId}`;
        }

        const countResult = await db.execute(sql`SELECT COUNT(*) as count FROM leads l WHERE ${whereClause}`);
        const total = parseInt(countResult.rows[0].count as string);

        const leadsResult = await db.execute(sql`
            SELECT
                l.id, l.company_name as "companyName", l.website, l.domain, l.industry, l.region, l.address,
                l.crm_sync_status as "crmSyncStatus", l.crm_synced_at as "crmSyncedAt", l.created_at as "createdAt",
                t.id as "taskId", t.name as "taskName",
                c.name as "contactName", c.email as "contactEmail", c.phone as "contactPhone", c.title as "contactTitle"
            FROM leads l
            JOIN tasks t ON l.task_id = t.id
            LEFT JOIN contacts c ON l.id = c.lead_id AND c.is_primary = true
            WHERE ${whereClause}
            ORDER BY l.created_at DESC
            LIMIT ${pageSize} OFFSET ${offset}
        `);

        res.json({
            leads: leadsResult.rows,
            pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
        });
    } catch (error: any) {
        logger.error('查询导入线索失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 查询导入任务列表
router.get('/import/tasks', async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const pageSize = parseInt(req.query.pageSize as string) || 20;
        const offset = (page - 1) * pageSize;

        const tasksList = await db.query.tasks.findMany({
            where: eq(tasks.source, 'import'),
            orderBy: desc(tasks.createdAt),
            limit: pageSize, offset
        });

        const countResult = await db.execute(sql`SELECT COUNT(*) as count FROM tasks WHERE source = 'import'`);
        const total = parseInt(countResult.rows[0].count as string);

        res.json({
            tasks: tasksList,
            pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
        });
    } catch (error: any) {
        logger.error('查询导入任务列表失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 批量触发CRM同步
router.post('/import/leads/sync-crm', async (req, res) => {
    try {
        const { leadIds } = req.body;

        if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
            return res.status(400).json({ error: '请提供有效的线索ID数组' });
        }

        const placeholders = leadIds.map(id => `'${id}'`).join(',');
        const result = await db.execute(sql.raw(`SELECT id FROM leads WHERE id IN (${placeholders}) AND source = 'import'`));
        const validLeads = result.rows as any[];

        if (validLeads.length === 0) {
            return res.json({ success: true, message: '没有找到需要同步的导入线索', count: 0 });
        }

        for (const lead of validLeads) {
            await db.update(leads).set({ crmSyncStatus: 'pending' }).where(eq(leads.id, lead.id));
            await crmQueue.add('saveToCrm', { type: 'saveToCrm', leadId: lead.id });
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

export default router;
