/**
 * Google Search 爬虫适配器
 * 从 Google 搜索结果中提取公司/网站信息
 */

import { chromium, Browser, Page } from 'playwright';
import { BaseScraperAdapter, ScrapeParams, RawData, StandardData } from '../base.adapter';
import { logger as baseLogger } from '../../utils/logger';
const logger = baseLogger.child({ service: 'search-scraper' });
import { configLoader } from '../../config/config-loader';

interface GoogleSearchConfig {
    headless?: boolean;
    timeout?: number;
    maxPages?: number;      // 最大翻页数，默认5页
    region?: string;        // 搜索区域
    language?: string;      // 搜索语言
    searchOperator?: string; // 额外的搜索运算符，如 "site:*.com"
}

export class GoogleSearchAdapter extends BaseScraperAdapter {
    readonly source = 'google_search';
    private browser?: Browser;
    private config: GoogleSearchConfig;

    constructor() {
        super();
        const sourceConfigs: any[] = configLoader.get('scraper.sources', []);
        const sourceConfig = sourceConfigs.find((s: any) => s.name === 'google_search');
        this.config = (sourceConfig?.config || {}) as GoogleSearchConfig;
    }

    async initialize() {
        logger.info('[GoogleSearch] 初始化浏览器...');
        try {
            this.browser = await chromium.launch({
                headless: this.config.headless !== false,
                executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu'
                ]
            });
            logger.info('[GoogleSearch] 浏览器初始化成功');
        } catch (error: any) {
            logger.error('[GoogleSearch] 浏览器启动失败:', error);
            throw error;
        }
    }

    async scrape(params: ScrapeParams): Promise<RawData[]> {
        if (!this.browser) await this.initialize();

        // 合并请求级配置
        const effectiveConfig: GoogleSearchConfig = {
            ...this.config,
            ...(params.config || {})
        };

        const maxPages = effectiveConfig.maxPages || 5;
        const limit = params.limit || 50;

        logger.info(`[GoogleSearch] ========== 开始搜索 ==========`);
        logger.info(`[GoogleSearch] 查询: "${params.query}"`);
        logger.info(`[GoogleSearch] 最大页数: ${maxPages}`);
        logger.info(`[GoogleSearch] 目标数量: ${limit}`);
        logger.info(`[GoogleSearch] ==============================`);

        const allResults: RawData[] = [];
        const seenUrls = new Set<string>();

        const page = await this.browser!.newPage();

        // 设置浏览器 User-Agent 以减少被检测
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9'
        });

        try {
            // 构建搜索查询
            let searchQuery = params.query;
            if (effectiveConfig.searchOperator) {
                searchQuery = `${searchQuery} ${effectiveConfig.searchOperator}`;
            }

            // 首页搜索
            const googleUrl = this.buildSearchUrl(searchQuery, effectiveConfig);
            logger.info(`[GoogleSearch] 访问: ${googleUrl}`);

            await page.goto(googleUrl, {
                waitUntil: 'domcontentloaded',
                timeout: effectiveConfig.timeout || 30000
            });

            // 处理可能的 Cookie 同意弹窗
            await this.handleCookieConsent(page);

            // 等待搜索结果加载
            await page.waitForSelector('#search', { timeout: 15000 }).catch(() => {
                logger.warn('[GoogleSearch] 未找到搜索结果容器');
            });

            // 遍历分页
            for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
                if (allResults.length >= limit) {
                    logger.info(`[GoogleSearch] 已达到目标数量 ${limit}`);
                    break;
                }

                logger.info(`[GoogleSearch] 正在处理第 ${pageNum}/${maxPages} 页...`);

                // 提取当前页的搜索结果
                const pageResults = await this.extractSearchResults(page);

                // 去重并添加
                const batchResults: RawData[] = [];
                for (const result of pageResults) {
                    if (!seenUrls.has(result.url) && allResults.length < limit) {
                        seenUrls.add(result.url);
                        allResults.push(result);
                        batchResults.push(result);
                    }
                }

                logger.info(`[GoogleSearch] 第 ${pageNum} 页: 提取 ${pageResults.length} 条，新增 ${batchResults.length} 条，总计 ${allResults.length} 条`);

                // 增量保存
                if (params.onBatchComplete && batchResults.length > 0) {
                    await params.onBatchComplete(batchResults);
                    logger.info(`[GoogleSearch] 已增量保存 ${batchResults.length} 条数据`);
                }

                // 翻页
                if (pageNum < maxPages && allResults.length < limit) {
                    const hasNextPage = await this.goToNextPage(page);
                    if (!hasNextPage) {
                        logger.info('[GoogleSearch] 没有更多页面');
                        break;
                    }
                    // 等待新页面加载
                    await page.waitForTimeout(2000);
                }
            }

            logger.info(`[GoogleSearch] ========== 搜索完成 ==========`);
            logger.info(`[GoogleSearch] 总采集: ${allResults.length} 条`);
            logger.info(`[GoogleSearch] ==============================`);

            return allResults;

        } catch (error: any) {
            logger.error('[GoogleSearch] 搜索失败:', error);
            throw error;
        } finally {
            await page.close();
        }
    }

    /**
     * 构建 Google 搜索 URL
     */
    private buildSearchUrl(query: string, config: GoogleSearchConfig): string {
        const params = new URLSearchParams({
            q: query,
            hl: config.language || 'en',
            num: '10'  // 每页结果数
        });

        if (config.region) {
            params.set('gl', config.region);
        }

        return `https://www.google.com/search?${params.toString()}`;
    }

    /**
     * 处理 Cookie 同意弹窗
     */
    private async handleCookieConsent(page: Page) {
        try {
            // Google Cookie 同意按钮的常见选择器
            const acceptButtonSelectors = [
                'button[id="L2AGLb"]',
                'button:has-text("Accept all")',
                'button:has-text("I agree")',
                '[aria-label="Accept all"]'
            ];

            for (const selector of acceptButtonSelectors) {
                const button = await page.$(selector);
                if (button) {
                    await button.click();
                    logger.info('[GoogleSearch] 已接受 Cookie 同意');
                    await page.waitForTimeout(1000);
                    break;
                }
            }
        } catch (error) {
            // 忽略，可能没有弹窗
        }
    }

    /**
     * 提取搜索结果
     */
    private async extractSearchResults(page: Page): Promise<RawData[]> {
        const results: RawData[] = [];

        try {
            // Google 搜索结果的选择器
            const resultElements = await page.$$('#search .g');

            for (const element of resultElements) {
                try {
                    const data = await element.evaluate((el) => {
                        // 提取标题
                        const titleEl = el.querySelector('h3');
                        const title = titleEl?.textContent?.trim() || '';

                        // 提取链接
                        const linkEl = el.querySelector('a[href^="http"]');
                        const url = linkEl?.getAttribute('href') || '';

                        // 提取描述
                        const descEl = el.querySelector('[data-sncf], .VwiC3b, [data-content-feature]');
                        const description = descEl?.textContent?.trim() || '';

                        // 提取显示的 URL（Breadcrumb）
                        const displayUrlEl = el.querySelector('cite');
                        const displayUrl = displayUrlEl?.textContent?.trim() || '';

                        return { title, url, description, displayUrl };
                    });

                    // 过滤掉无效结果
                    if (data.title && data.url && !data.url.includes('google.com')) {
                        results.push({
                            source: this.source,
                            url: data.url,
                            scrapedAt: new Date(),
                            data: {
                                name: data.title,
                                website: data.url,
                                description: data.description,
                                displayUrl: data.displayUrl
                            }
                        });
                    }
                } catch (error) {
                    // 忽略单个结果的提取错误
                }
            }
        } catch (error: any) {
            logger.error('[GoogleSearch] 提取结果失败:', error.message);
        }

        return results;
    }

    /**
     * 翻到下一页
     */
    private async goToNextPage(page: Page): Promise<boolean> {
        try {
            // Google "下一页" 按钮
            const nextButton = await page.$('#pnnext, a[aria-label="Next page"]');
            if (nextButton) {
                await nextButton.click();
                await page.waitForSelector('#search', { timeout: 10000 });
                return true;
            }
        } catch (error) {
            logger.debug('[GoogleSearch] 翻页失败或无下一页');
        }
        return false;
    }

    validate(data: RawData): boolean {
        // 验证至少有名称和 URL
        const isValid = !!(data.data.name && data.data.website);
        if (!isValid) {
            logger.warn(`[GoogleSearch] 数据验证失败 - name: "${data.data.name}", website: "${data.data.website}"`);
        }
        return isValid;
    }

    transform(data: RawData): StandardData {
        const raw = data.data;

        return {
            name: raw.name,
            website: raw.website,
            domain: raw.website ? this.extractDomain(raw.website) : undefined,
            productDescription: raw.description,
            sourceUrl: data.url,
            scrapedAt: data.scrapedAt
        };
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            logger.info('[GoogleSearch] 浏览器已关闭');
        }
    }
}
