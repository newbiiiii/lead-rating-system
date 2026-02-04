
import { Router } from 'express';
import { db } from '../../db';
import { leads, leadRatings } from '../../db/schema';
import { sql } from 'drizzle-orm';
import { logger } from '../../utils/logger';
import * as XLSX from 'xlsx';

const router = Router();

/**
 * High Quality Lead Query Endpoint
 * Supports multi-dimensional filtering
 */
router.post('/query', async (req, res) => {
    try {
        const {
            keywords,
            rating, // Array or string: ['S', 'A', 'B', 'C', 'D']
            industry,
            region,
            source,
            startDate,
            endDate,
            ratingStatus, // 'completed', 'pending', 'failed'
            crmSyncStatus, // 'synced', 'pending', 'failed'
            taskName, // Task name filter
            page = 1,
            pageSize = 20
        } = req.body;

        const offset = (page - 1) * pageSize;
        const curPage = parseInt(page as string);
        const curPageSize = parseInt(pageSize as string);

        // Base query conditions
        const conditions = [];

        // 1. Keywords (Company Name, Domain, Industry, Task Name, Address)
        if (keywords) {
            conditions.push(sql`(
                l.company_name ILIKE ${`%${keywords}%`} OR
                l.industry ILIKE ${`%${keywords}%`} OR
                l.domain ILIKE ${`%${keywords}%`} OR
                l.address ILIKE ${`%${keywords}%`} OR
                t.name ILIKE ${`%${keywords}%`}
            )`);
        }

        // 2. Rating (AI Score) - supports multiple selection
        if (rating && Array.isArray(rating) && rating.length > 0) {
            const ratingConditions = rating.map(r => `'${r}'`).join(',');
            conditions.push(sql`lr.overall_rating IN (${sql.raw(ratingConditions)})`);
        }

        // 3. Industry
        if (industry) {
            conditions.push(sql`l.industry = ${industry}`);
        }

        // 4. Region
        if (region) {
            conditions.push(sql`l.region = ${region}`);
        }

        // 5. Source
        if (source) {
            conditions.push(sql`l.source = ${source}`);
        }

        // 6. Rating Status
        if (ratingStatus) {
            conditions.push(sql`l.rating_status = ${ratingStatus}`);
        }

        // 7. CRM Sync Status
        if (crmSyncStatus) {
            conditions.push(sql`l.crm_sync_status = ${crmSyncStatus}`);
        }

        // 8. Task Name
        if (taskName) {
            conditions.push(sql`t.name ILIKE ${`%${taskName}%`}`);
        }

        // 9. Date Range
        if (startDate) {
            conditions.push(sql`l.created_at >= ${startDate}`);
        }
        if (endDate) {
            // If endDate is just a date string (YYYY-MM-DD), add time to include the whole day
            let end = endDate;
            if (end.length === 10) end += ' 23:59:59';
            conditions.push(sql`l.created_at <= ${end}`);
        }

        const whereClause = conditions.length > 0
            ? sql.join(conditions, sql` AND `)
            : sql`1=1`;

        // Count query
        const countQuery = sql`
            SELECT COUNT(*) as count
            FROM leads l
            LEFT JOIN lead_ratings lr ON l.id = lr.lead_id
            LEFT JOIN tasks t ON l.task_id = t.id
            WHERE ${whereClause}
        `;

        const countResult = await db.execute(countQuery);
        const total = parseInt(countResult.rows[0].count as string);

        // Data query
        // Sort by Rating (S -> A -> B -> C -> D) then by Creation Date
        const dataQuery = sql`
            SELECT
                l.id,
                l.company_name as "companyName",
                l.domain,
                l.website,
                l.address,
                l.industry,
                l.region,
                l.source,
                l.created_at as "createdAt",
                l.rating_status as "ratingStatus",
                l.crm_sync_status as "crmSyncStatus",
                lr.overall_rating as "overallRating",
                lr.think,
                lr.suggestion,
                lr.rated_at as "ratedAt",
                t.name as "taskName",
                (
                    SELECT json_agg(json_build_object(
                        'name', c.name,
                        'title', c.title,
                        'email', c.email,
                        'phone', c.phone,
                        'mobile', c.mobile
                    ))
                    FROM contacts c
                    WHERE c.lead_id = l.id
                ) as "contacts"
            FROM leads l
            LEFT JOIN lead_ratings lr ON l.id = lr.lead_id
            LEFT JOIN tasks t ON l.task_id = t.id
            WHERE ${whereClause}
            ORDER BY
                CASE
                    WHEN lr.overall_rating = 'S' THEN 1
                    WHEN lr.overall_rating = 'A' THEN 2
                    WHEN lr.overall_rating = 'B' THEN 3
                    WHEN lr.overall_rating = 'C' THEN 4
                    WHEN lr.overall_rating = 'D' THEN 5
                    ELSE 6
                END ASC,
                l.created_at DESC
            LIMIT ${curPageSize} OFFSET ${offset}
        `;

        const leadsResult = await db.execute(dataQuery);

        res.json({
            leads: leadsResult.rows,
            pagination: {
                page: curPage,
                pageSize: curPageSize,
                total,
                totalPages: Math.ceil(total / curPageSize)
            }
        });

    } catch (error: any) {
        logger.error('High quality lead query failed:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get Filter Options
 * Returns available industries, regions, sources for UI dropdowns
 */
router.get('/filters', async (req, res) => {
    try {
        // Industry
        const indResult = await db.execute(sql`
            SELECT DISTINCT industry 
            FROM leads 
            WHERE industry IS NOT NULL AND industry != '' 
            ORDER BY industry ASC
            LIMIT 100
        `);

        // Region
        const regResult = await db.execute(sql`
            SELECT DISTINCT region 
            FROM leads 
            WHERE region IS NOT NULL AND region != '' 
            ORDER BY region ASC
            LIMIT 100
        `);

        // Source
        const srcResult = await db.execute(sql`
            SELECT DISTINCT source 
            FROM leads 
            WHERE source IS NOT NULL AND source != '' 
            ORDER BY source ASC
        `);

        res.json({
            industries: indResult.rows.map(r => r.industry),
            regions: regResult.rows.map(r => r.region),
            sources: srcResult.rows.map(r => r.source)
        });

    } catch (error: any) {
        logger.error('Failed to fetch filter options:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Export Leads to Excel
 */
router.post('/export', async (req, res) => {
    try {
        const {
            keywords,
            rating,
            industry,
            region,
            source,
            startDate,
            endDate,
            ratingStatus,
            crmSyncStatus,
            taskName
        } = req.body;

        // Base query conditions (Same as query)
        const conditions = [];

        if (keywords) {
            conditions.push(sql`(
                l.company_name ILIKE ${`%${keywords}%`} OR
                l.industry ILIKE ${`%${keywords}%`} OR
                l.domain ILIKE ${`%${keywords}%`} OR
                l.address ILIKE ${`%${keywords}%`} OR
                t.name ILIKE ${`%${keywords}%`}
            )`);
        }

        if (rating && Array.isArray(rating) && rating.length > 0) {
            const ratingConditions = rating.map(r => `'${r}'`).join(',');
            conditions.push(sql`lr.overall_rating IN (${sql.raw(ratingConditions)})`);
        }

        if (industry) conditions.push(sql`l.industry = ${industry}`);
        if (region) conditions.push(sql`l.region = ${region}`);
        if (source) conditions.push(sql`l.source = ${source}`);
        if (ratingStatus) conditions.push(sql`l.rating_status = ${ratingStatus}`);
        if (crmSyncStatus) conditions.push(sql`l.crm_sync_status = ${crmSyncStatus}`);
        if (taskName) conditions.push(sql`t.name ILIKE ${`%${taskName}%`}`);

        if (startDate) conditions.push(sql`l.created_at >= ${startDate}`);
        if (endDate) {
            let end = endDate;
            if (end.length === 10) end += ' 23:59:59';
            conditions.push(sql`l.created_at <= ${end}`);
        }

        const whereClause = conditions.length > 0
            ? sql.join(conditions, sql` AND `)
            : sql`1=1`;

        // Fetch ALL matching data
        const dataQuery = sql`
            SELECT
                l.company_name as "companyName",
                l.domain,
                l.website,
                l.address,
                l.industry,
                l.region,
                l.source,
                l.created_at as "createdAt",
                l.rating_status as "ratingStatus",
                l.crm_sync_status as "crmSyncStatus",
                lr.overall_rating as "overallRating",
                lr.think,
                lr.suggestion,
                lr.rated_at as "ratedAt",
                t.name as "taskName",
                (
                    SELECT json_agg(json_build_object(
                        'name', c.name,
                        'title', c.title,
                        'email', c.email,
                        'phone', c.phone,
                        'mobile', c.mobile
                    ))
                    FROM contacts c
                    WHERE c.lead_id = l.id
                ) as "contacts"
            FROM leads l
            LEFT JOIN lead_ratings lr ON l.id = lr.lead_id
            LEFT JOIN tasks t ON l.task_id = t.id
            WHERE ${whereClause}
            ORDER BY
                CASE
                    WHEN lr.overall_rating = 'S' THEN 1
                    WHEN lr.overall_rating = 'A' THEN 2
                    WHEN lr.overall_rating = 'B' THEN 3
                    WHEN lr.overall_rating = 'C' THEN 4
                    WHEN lr.overall_rating = 'D' THEN 5
                    ELSE 6
                END ASC,
                l.created_at DESC
        `;

        const result = await db.execute(dataQuery);
        const rows = result.rows;

        // Transform for Excel
        const excelData = rows.map((row: any) => {
            // Format contacts
            let contactInfo = '';
            if (row.contacts && Array.isArray(row.contacts)) {
                contactInfo = row.contacts.map((c: any) => {
                    const parts = [];
                    if (c.name) parts.push(c.name);
                    if (c.title) parts.push(`(${c.title})`);
                    if (c.email) parts.push(c.email);
                    if (c.phone || c.mobile) parts.push(c.phone || c.mobile);
                    return parts.join(' ');
                }).join('; \n');
            }

            // Format CRM sync status
            const crmStatusMap: Record<string, string> = {
                'synced': '已同步',
                'pending': '待同步',
                'failed': '失败'
            };

            const ratingStatusMap: Record<string, string> = {
                'completed': '已完成',
                'pending': '待评分',
                'failed': '失败'
            };

            return {
                '公司名称': row.companyName || '',
                '域名': row.domain || '',
                '网站': row.website || '',
                '地址': row.address || '',
                '评分': row.overallRating || '',
                '行业': row.industry || '',
                '地区': row.region || '',
                '联系人': contactInfo,
                'AI分析': row.think || '',
                'AI建议': row.suggestion || '',
                '来源任务': row.taskName || '',
                '数据来源': row.source || '',
                '评分状态': ratingStatusMap[row.ratingStatus] || row.ratingStatus || '',
                'CRM同步状态': crmStatusMap[row.crmSyncStatus] || row.crmSyncStatus || '',
                '创建时间': row.createdAt ? new Date(row.createdAt).toLocaleString('zh-CN') : '',
                '评分时间': row.ratedAt ? new Date(row.ratedAt).toLocaleString('zh-CN') : ''
            };
        });

        // Create Workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(excelData);

        // Auto-width columns
        const colWidths = [
            { wch: 30 }, // 公司名称
            { wch: 20 }, // 域名
            { wch: 30 }, // 网站
            { wch: 40 }, // 地址
            { wch: 8 },  // 评分
            { wch: 15 }, // 行业
            { wch: 15 }, // 地区
            { wch: 50 }, // 联系人
            { wch: 60 }, // AI分析
            { wch: 60 }, // AI建议
            { wch: 25 }, // 来源任务
            { wch: 12 }, // 数据来源
            { wch: 12 }, // 评分状态
            { wch: 12 }, // CRM同步状态
            { wch: 20 }, // 创建时间
            { wch: 20 }  // 评分时间
        ];
        ws['!cols'] = colWidths;

        XLSX.utils.book_append_sheet(wb, ws, "优质线索");

        // Generate Buffer
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        // Send headers
        res.setHeader('Content-Disposition', `attachment; filename="leads_export_${new Date().toISOString().split('T')[0]}.xlsx"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        res.send(buffer);

    } catch (error: any) {
        logger.error('Export failed:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
