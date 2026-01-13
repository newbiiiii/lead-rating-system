/**
 * Google Maps 爬虫适配器 - 完整版
 * 功能: 全球城市网格搜索 + 深度滚动最大化数据采集
 */

import { chromium, Browser, Page } from 'playwright';
import { BaseScraperAdapter, ScrapeParams, RawData, StandardData } from '../base.adapter';
import { logger } from '../../utils/logger';
import { configLoader } from '../../config/config-loader';
import { GLOBAL_CITIES, CityData } from '../../data/cities';
import { db } from '../../db';
import { searchPoints, tasks } from '../../db/schema';
import { eq, and, or } from 'drizzle-orm';

interface GoogleMapsAdapterConfig {
    headless?: boolean;
    timeout?: number;
    geolocation?: {
        // 方式1: 使用全球城市数据库中的城市
        city?: string;
        country?: string;

        // 方式2: 中心点 + 半径
        latitude?: number;
        longitude?: number;
        radius?: number;

        // 方式3: 矩形边界
        bounds?: {
            north: number;
            south: number;
            east: number;
            west: number;
        };

        zoom?: number;
        step?: number;
    };
}

export class GoogleMapsAdapter extends BaseScraperAdapter {
    readonly source = 'google_maps';
    private browser?: Browser;
    private config: GoogleMapsAdapterConfig;

    constructor() {
        super();
        const sourceConfigs: any[] = configLoader.get('scraper.sources', []);
        const sourceConfig = sourceConfigs.find((s: any) => s.name === 'google_maps');
        this.config = (sourceConfig?.config || {}) as GoogleMapsAdapterConfig;
    }

    async initialize() {
        logger.info('[GoogleMaps] 初始化浏览器...');
        try {
            this.browser = await chromium.launch({
                headless: this.config.headless !== false,
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-setuid-sandbox'
                ]
            });
            logger.info('[GoogleMaps] 浏览器初始化成功');
        } catch (error: any) {
            logger.error('[GoogleMaps] 浏览器启动失败详细信息:', error);
            // 尝试打印环境变量以辅助调试
            logger.error(`[GoogleMaps] PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: ${process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}`);
            throw error;
        }
    }

    async scrape(params: ScrapeParams): Promise<RawData[]> {
        if (!this.browser) await this.initialize();

        // 合并请求级配置
        const effectiveConfig: GoogleMapsAdapterConfig = {
            ...this.config,
            ...(params.config || {})
        };

        // 确保geolocation也被正确合并
        if (params.config?.geolocation) {
            effectiveConfig.geolocation = {
                ...(this.config.geolocation || {}),
                ...params.config.geolocation
            };
            const geo = effectiveConfig.geolocation!;
            logger.info(`[GoogleMaps] 收到地理位置配置: country="${geo.country}", city="${geo.city}", lat=${geo.latitude}, lng=${geo.longitude}`);
        }

        const searchArea = this.getSearchArea(effectiveConfig);

        // 如果配置了地理位置，使用网格搜索
        if (searchArea) {
            return await this.gridScrape(params, searchArea, effectiveConfig);
        }

        // 否则使用原有的单次搜索（带深度滚动）
        return await this.singlePointScrape(params, effectiveConfig);
    }

    /**
     * 准备搜索点 - 在任务创建时调用
     * 生成网格点并返回,供worker保存到数据库
     */
    public prepareSearchPoints(
        area: { center: { lat: number; lng: number }; radius: number },
        config: GoogleMapsAdapterConfig
    ): Array<{ lat: number; lng: number; sequenceNumber: number }> {
        const step = config.geolocation?.step || 0.01;
        const points = this.generateGridPoints(area.center.lat, area.center.lng, area.radius, step);

        return points.map((p, index) => ({
            lat: p.lat,
            lng: p.lng,
            sequenceNumber: index + 1
        }));
    }

    /**
     * 解析搜索区域配置 - 支持全球城市数据库
     */
    public getSearchArea(config: GoogleMapsAdapterConfig): { center: { lat: number; lng: number }; radius: number } | null {
        const geo = config.geolocation;
        if (!geo) return null;

        // 方式1: 使用全球城市数据库
        if (geo.country && geo.city) {
            const countryData = GLOBAL_CITIES[geo.country];
            if (!countryData) {
                logger.warn(`[GoogleMaps] 未找到国家 "${geo.country}" 的数据`);
                return null;
            }

            const cityData = countryData.find(c => c.name === geo.city);
            if (!cityData) {
                logger.warn(`[GoogleMaps] 未找到城市 "${geo.country} - ${geo.city}" 的数据`);
                return null;
            }

            logger.info(`[GoogleMaps] 使用全球城市: ${geo.country} - ${geo.city}, 坐标 (${cityData.lat}, ${cityData.lng}), 半径 ${cityData.radius}度`);
            return {
                center: { lat: cityData.lat, lng: cityData.lng },
                radius: cityData.radius
            };
        }

        // 方式2: 中心点 + 半径
        if (geo.latitude !== undefined && geo.longitude !== undefined) {
            const radius = geo.radius || 0.1;
            logger.info(`[GoogleMaps] 使用自定义中心点: (${geo.latitude}, ${geo.longitude}), 半径 ${radius}度`);
            return {
                center: { lat: geo.latitude, lng: geo.longitude },
                radius
            };
        }

        // 方式3: 矩形边界转换为中心点 + 半径
        if (geo.bounds) {
            const center = {
                lat: (geo.bounds.north + geo.bounds.south) / 2,
                lng: (geo.bounds.east + geo.bounds.west) / 2
            };
            const radius = Math.max(
                geo.bounds.north - geo.bounds.south,
                geo.bounds.east - geo.bounds.west
            ) / 2;
            logger.info(`[GoogleMaps] 使用矩形边界: 中心点 (${center.lat}, ${center.lng}), 半径 ${radius}度`);
            return { center, radius };
        }

        return null;
    }

    /**
     * 网格搜索 - 覆盖整个城市区域（支持断点续传）
     */
    private async gridScrape(
        params: ScrapeParams,
        area: { center: { lat: number; lng: number }; radius: number },
        config: GoogleMapsAdapterConfig
    ): Promise<RawData[]> {
        const zoom = config.geolocation?.zoom || 15;
        const cityName = config.geolocation?.city || '';
        const optimizedQuery = cityName ? `${params.query} ${cityName}` : params.query;

        logger.info(`[GoogleMaps] ========== 开始网格搜索 ==========`);
        logger.info(`[GoogleMaps] 原始查询: "${params.query}"`);
        if (cityName) {
            logger.info(`[GoogleMaps] 优化查询: "${optimizedQuery}" (添加城市名以强制本地化)`);
        }

        // 从数据库读取待处理的搜索点
        let pendingPoints;
        if (params.taskId) {
            pendingPoints = await db.select()
                .from(searchPoints)
                .where(
                    and(
                        eq(searchPoints.taskId, params.taskId),
                        or(
                            eq(searchPoints.status, 'pending'),
                            eq(searchPoints.status, 'failed')  // 重试失败的点
                        )
                    )
                )
                .orderBy(searchPoints.sequenceNumber);

            logger.info(`[GoogleMaps] 从数据库读取到 ${pendingPoints.length} 个待处理搜索点`);
        } else {
            // 向后兼容：如果没有 taskId,使用旧方式生成网格点
            const step = config.geolocation?.step || 0.01;
            const gridPoints = this.generateGridPoints(
                area.center.lat,
                area.center.lng,
                area.radius,
                step
            );
            pendingPoints = gridPoints.map((p, index) => ({
                id: '',
                taskId: '',
                latitude: p.lat,
                longitude: p.lng,
                sequenceNumber: index + 1,
                status: 'pending' as const,
                resultsFound: 0,
                resultsSaved: 0,
                error: null,
                startedAt: null,
                completedAt: null,
                createdAt: new Date()
            }));
            logger.info(`[GoogleMaps] 内存模式: 生成 ${pendingPoints.length} 个搜索点`);
        }

        logger.info(`[GoogleMaps] 缩放级别: ${zoom}z`);
        logger.info(`[GoogleMaps] 预计耗时: ${Math.ceil(pendingPoints.length * 60 / 60)} 分钟`);
        logger.info(`[GoogleMaps] ========================================`);

        const allResults: RawData[] = [];
        const page = await this.browser!.newPage();
        const seenKeys = new Set<string>();  // 用于去重

        // 获取总搜索点数（用于显示进度）
        let totalPoints = pendingPoints.length;
        if (params.taskId) {
            const allPoints = await db.select()
                .from(searchPoints)
                .where(eq(searchPoints.taskId, params.taskId));
            totalPoints = allPoints.length;
        }

        try {
            for (const [index, point] of pendingPoints.entries()) {
                // 检查任务是否被取消
                if (params.taskId) {
                    const currentTask = await db.query.tasks.findFirst({
                        where: eq(tasks.id, params.taskId)
                    });

                    if (currentTask?.status === 'cancelled') {
                        logger.info(`[GoogleMaps] 任务 ${params.taskId} 已被取消，停止执行`);
                        break;
                    }
                }

                logger.info(`[GoogleMaps] [#${point.sequenceNumber}/${totalPoints}] 处理搜索点 #${point.sequenceNumber}: (${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)})`);

                // 更新搜索点状态为 running
                if (params.taskId && point.id) {
                    await db.update(searchPoints)
                        .set({ status: 'running', startedAt: new Date() })
                        .where(eq(searchPoints.id, point.id));
                }

                const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(optimizedQuery)}/@${point.latitude},${point.longitude},${zoom}z`;

                try {
                    await page.goto(searchUrl, {
                        waitUntil: 'domcontentloaded',
                        timeout: this.config.timeout || 60000
                    });

                    await page.waitForSelector('[role="feed"]', { timeout: 15000 });
                    await page.waitForSelector('[role="article"]', { timeout: 15000 });

                    // 深度滚动
                    const limit = params.limit && params.limit > 0 ? params.limit : 1000;
                    await this.scrollResults(page, limit);

                    const listings = await page.$$('[role="article"]');
                    let newCount = 0;
                    const batchResults: RawData[] = [];  // 本点新增的数据

                    for (const listing of listings) {
                        try {
                            await listing.click();
                            await page.waitForTimeout(3000);

                            const data = await this.extractDetailData(page);

                            // 去重
                            const uniqueKey = `${data.name}|${data.phone || 'no-phone'}`;
                            if (seenKeys.has(uniqueKey)) {
                                continue;
                            }

                            seenKeys.add(uniqueKey);
                            const rawData: RawData = {
                                source: this.source,
                                url: page.url(),
                                scrapedAt: new Date(),
                                data
                            };
                            allResults.push(rawData);
                            batchResults.push(rawData);
                            newCount++;
                        } catch (error: any) {
                            logger.debug(`[GoogleMaps] 提取详情失败:`, error.message);
                        }
                    }

                    logger.info(`[GoogleMaps] [#${point.sequenceNumber}/${totalPoints}] 完成，本点找到 ${listings.length} 个列表项，新增 ${newCount} 条数据，总计 ${allResults.length} 条`);

                    // 更新搜索点状态为completed
                    if (params.taskId && point.id) {
                        await db.update(searchPoints)
                            .set({
                                status: 'completed',
                                resultsFound: listings.length,
                                resultsSaved: newCount,
                                completedAt: new Date()
                            })
                            .where(eq(searchPoints.id, point.id));
                    }

                    // 增量保存：每个点完成后立即保存新数据
                    if (params.onBatchComplete && batchResults.length > 0) {
                        await params.onBatchComplete(batchResults);
                        logger.info(`[GoogleMaps] [#${point.sequenceNumber}/${totalPoints}] 已增量保存 ${batchResults.length} 条数据`);
                    }

                    // 添加延迟避免被封
                    if (index < pendingPoints.length - 1) {
                        await page.waitForTimeout(2000);
                    }

                } catch (error: any) {
                    logger.error(`[GoogleMaps] [#${point.sequenceNumber}/${totalPoints}] 搜索失败:`, error.message);

                    // 标记搜索点失败
                    if (params.taskId && point.id) {
                        await db.update(searchPoints)
                            .set({
                                status: 'failed',
                                error: error.message,
                                completedAt: new Date()
                            })
                            .where(eq(searchPoints.id, point.id));
                    }
                }
            }

            logger.info(`[GoogleMaps] ========== 网格搜索完成 ==========`);
            logger.info(`[GoogleMaps] 总采集数据: ${allResults.length} 条`);
            logger.info(`[GoogleMaps] ========================================`);
            return allResults;

        } finally {
            await page.close();
        }
    }

    /**
     * 单点搜索 - 带深度滚动
     */
    private async singlePointScrape(params: ScrapeParams, config: GoogleMapsAdapterConfig): Promise<RawData[]> {
        const page = await this.browser!.newPage();
        const results: RawData[] = [];

        try {
            logger.info(`[GoogleMaps] 搜索: ${params.query}`);

            let searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(params.query)}`;

            // Fix: Append coordinates if available to force location
            if (config.geolocation?.latitude && config.geolocation?.longitude) {
                const { latitude, longitude, zoom = 14, city } = config.geolocation;

                // Double Fix: Append city name to query to prevent Google from jumping to other locations
                let query = params.query;
                if (city) {
                    query = `${query} ${city}`;
                    logger.info(`[GoogleMaps] 优化搜索词: "${query}"`);
                }

                searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${latitude},${longitude},${zoom}z`;
                logger.info(`[GoogleMaps] 使用指定坐标定位: ${latitude}, ${longitude} (Zoom: ${zoom})`);
            }

            logger.info(`[GoogleMaps] 访问 URL: ${searchUrl}`);

            await page.goto(searchUrl, {
                waitUntil: 'domcontentloaded',
                timeout: config.timeout || 60000
            });

            await page.waitForSelector('[role="feed"]', { timeout: 15000 });
            logger.info('[GoogleMaps] 搜索结果容器已加载');
            await page.waitForSelector('[role="article"]', { timeout: 15000 });

            // 深度滚动 - 获取尽可能多的结果
            const limit = params.limit && params.limit > 0 ? params.limit : 1000;
            await this.scrollResults(page, limit);

            const listings = await page.$$('[role="article"]');
            logger.info(`[GoogleMaps] 找到 ${listings.length} 个结果`);

            for (const [index, listing] of listings.entries()) {
                try {
                    await listing.click();
                    await page.waitForTimeout(3000);

                    const data = await this.extractDetailData(page);

                    results.push({
                        source: this.source,
                        url: page.url(),
                        scrapedAt: new Date(),
                        data
                    });

                    logger.info(`[GoogleMaps] 提取 ${index + 1}/${listings.length}: name="${data.name}", category="${data.category}"`);
                } catch (error: any) {
                    logger.warn(`[GoogleMaps] 提取详情失败 [${index + 1}]:`, error.message || error);
                }
            }

            logger.info(`[GoogleMaps] 完成，共提取 ${results.length} 条数据`);
            return results;

        } catch (error: any) {
            logger.error('[GoogleMaps] 爬取失败:', error);
            throw error;
        } finally {
            await page.close();
        }
    }


    /**
     * 深度滚动 - 最大化数据采集
     */
    private async scrollResults(page: Page, targetCount: number = 999) {
        const scrollContainer = await page.$('[role="feed"]');
        if (!scrollContainer) return;

        let lastCount = 0;
        let scrollAttempts = 0;
        const maxScrolls = 50;  // 增加到50次以获取更多数据
        let stableCount = 0;    // 连续无新结果的次数

        logger.info(`[GoogleMaps] 开始深度滚动，目标获取尽可能多的结果...`);

        while (scrollAttempts < maxScrolls) {
            await scrollContainer.evaluate(el => {
                el.scrollTop = el.scrollHeight;
            });

            // 增加等待时间，确保内容加载完成
            await page.waitForTimeout(3000);

            const currentCount = await page.$$eval('[role="article"]', els => els.length);

            // 连续3次无新结果才停止
            if (currentCount === lastCount) {
                stableCount++;
                if (stableCount >= 3) {
                    logger.info(`[GoogleMaps] 滚动结束，共找到 ${currentCount} 个结果`);
                    break;
                }
            } else {
                stableCount = 0;
                logger.debug(`[GoogleMaps] 滚动 #${scrollAttempts + 1}: ${currentCount} 个结果`);
            }

            if (currentCount >= targetCount) {
                logger.info(`[GoogleMaps] 达到目标数量 ${targetCount}`);
                break;
            }

            lastCount = currentCount;
            scrollAttempts++;
        }

        if (scrollAttempts >= maxScrolls) {
            logger.warn(`[GoogleMaps] 达到最大滚动次数 ${maxScrolls}`);
        }
    }

    private async extractDetailData(page: Page): Promise<Record<string, any>> {
        try {
            const h1Found = await page.waitForSelector('h1', { timeout: 5000 })
                .then(() => true)
                .catch(() => false);

            const data = await page.evaluate(`
                (function() {
                    function getText(selector) {
                        try {
                            var el = document.querySelector(selector);
                            return el ? el.textContent.trim() : '';
                        } catch (e) {
                            return '';
                        }
                    }

                    function getAttr(selector, attr) {
                        try {
                            var el = document.querySelector(selector);
                            return el ? (el.getAttribute(attr) || '') : '';
                        } catch (e) {
                            return '';
                        }
                    }

                    return {
                        name: getText('div[role="main"] h1.DUwDvf') || getText('div[role="main"] h1') || getText('h1.DUwDvf'),
                        rating: getText('div[role="main"] span[aria-label*="stars"]') || getText('span.MW4etd'),
                        reviewCount: getText('div[role="main"] span[aria-label*="reviews"]') || getText('button[aria-label*="reviews"]'),
                        category: getText('div[role="main"] button[jsaction*="category"]') || getText('button.DkEaL'),
                        address: getText('button[data-item-id="address"] div.fontBodyMedium') || getText('button[data-tooltip="Copy address"]'),
                        phone: getText('button[data-item-id*="phone:tel:"] div.fontBodyMedium') || getText('button[data-tooltip="Copy phone number"]'),
                        website: getAttr('a[data-item-id="authority"]', 'href') || getAttr('a[aria-label*="Website"]', 'href'),
                        hours: getText('div[data-item-id="oh"] div.fontBodyMedium') || getText('table.eK4R0e'),
                        description: getText('div.WeS02d div.fontBodyMedium') || getText('div[class*="description"]')
                    };
                })()
            `) as Record<string, any>;

            return data;
        } catch (error: any) {
            logger.error('[GoogleMaps] extractDetailData 异常:', error);
            throw error;
        }
    }

    validate(data: RawData): boolean {
        const isValid = !!(data.data.name && data.data.category);
        if (!isValid) {
            logger.warn(`[GoogleMaps] 数据验证失败 - name: "${data.data.name}", category: "${data.data.category}"`, {
                allData: data.data
            });
        }
        return isValid;
    }

    transform(data: RawData): StandardData {
        const raw = data.data;

        return {
            name: raw.name,
            website: raw.website,
            domain: raw.website ? this.extractDomain(raw.website) : undefined,
            industry: raw.category,
            region: raw.address || this.extractRegion(raw.address),
            phone: raw.phone,
            email: raw.email,
            productDescription: raw.description,
            estimatedSize: this.estimateSizeByReviews(raw.reviewCount),
            sourceUrl: data.url,
            scrapedAt: data.scrapedAt
        };
    }

    private extractRegion(address: string): string {
        const match = address.match(/([^,]+),\s*([A-Z]{2}|[\u4e00-\u9fa5]+)/);
        return match ? match[2] : '';
    }

    private estimateSizeByReviews(reviewCount: string): 'small' | 'medium' | 'large' {
        const count = parseInt(reviewCount.replace(/[^\d]/g, '')) || 0;
        if (count < 50) return 'small';
        if (count < 500) return 'medium';
        return 'large';
    }

    /**
     * 生成网格搜索坐标点
     */
    private generateGridPoints(
        centerLat: number,
        centerLng: number,
        radius: number = 0.05,
        step: number = 0.01
    ): Array<{ lat: number; lng: number }> {
        const points: Array<{ lat: number; lng: number }> = [];

        for (let lat = centerLat - radius; lat <= centerLat + radius; lat += step) {
            for (let lng = centerLng - radius; lng <= centerLng + radius; lng += step) {
                points.push({ lat, lng });
            }
        }

        logger.info(`[GoogleMaps] 生成 ${points.length} 个网格搜索点`);
        return points;
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            logger.info('[GoogleMaps] 浏览器已关闭');
        }
    }
}
