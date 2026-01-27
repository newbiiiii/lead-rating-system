
import { Router } from 'express';
import { db } from '../../db';
import { leads, leadRatings } from '../../db/schema';
import { sql } from 'drizzle-orm';
import { logger } from '../../utils/logger';

const router = Router();

/**
 * High Quality Lead Query Endpoint
 * Supports multi-dimensional filtering
 */
router.post('/query', async (req, res) => {
    try {
        const {
            keywords,
            rating, // Array or string: ['S', 'A'] or 'S'
            industry,
            region,
            source,
            startDate,
            endDate,
            ratingStatus, // 'completed', 'pending', etc.
            page = 1,
            pageSize = 20
        } = req.body;

        const offset = (page - 1) * pageSize;
        const curPage = parseInt(page as string);
        const curPageSize = parseInt(pageSize as string);

        // Base query conditions
        const conditions = [];

        // 1. Keywords (Company Name, Domain, Industry, Task Name)
        if (keywords) {
            conditions.push(sql`(
                l.company_name ILIKE ${`%${keywords}%`} OR 
                l.industry ILIKE ${`%${keywords}%`} OR
                l.domain ILIKE ${`%${keywords}%`} OR
                t.name ILIKE ${`%${keywords}%`}
            )`);
        }

        // 2. Rating (AI Score)
        if (rating) {
            const ratings = Array.isArray(rating) ? rating : [rating];
            if (ratings.length > 0) {
                const ratingConditions = ratings.map(r => `'${r}'`).join(',');
                conditions.push(sql`lr.overall_rating IN (${sql.raw(ratingConditions)})`);
            }
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

        // 7. Date Range
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
        // Sort by Rating (A -> B -> C...) then by Creation Date
        const dataQuery = sql`
            SELECT 
                l.id,
                l.company_name as "companyName",
                l.domain,
                l.website,
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

export default router;
