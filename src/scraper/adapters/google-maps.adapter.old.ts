/**
 * Google Maps 爬虫适配器
 * 实际生产版本
 */

import { chromium, Browser, Page } from 'playwright';
import { BaseScraperAdapter, ScrapeParams, RawData, StandardData } from '../base.adapter';
import { logger } from '../../utils/logger';
import { configLoader } from '../../config/config-loader';

export class GoogleMapsAdapter extends BaseScraperAdapter {
    readonly source = 'google_maps';
    private browser?: Browser;
    private config: any;

    constructor() {
        super();
        this.config = configLoader.get('scraper.sources', []).find((s: any) => s.name === 'google_maps')?.config || {};
    }

    async initialize() {
        logger.info('[GoogleMaps] 初始化浏览器...');
        this.browser = await chromium.launch({
            headless: this.config.headless !== false,
            args: ['--disable-blink-features=AutomationControlled']
        });
    }

    async scrape(params: ScrapeParams): Promise<RawData[]> {
        if (!this.browser) await this.initialize();

        const page = await this.browser!.newPage();
        const results: RawData[] = [];

        try {
            logger.info(`[GoogleMaps] 搜索: ${params.query}`);

            const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(params.query)}`;

            // 使用 domcontentloaded 代替 networkidle，Google Maps 经常有持续的网络活动
            await page.goto(searchUrl, {
                waitUntil: 'domcontentloaded',
                timeout: this.config.timeout || 60000
            });

            // 等待搜索结果容器加载，这是更可靠的指标
            await page.waitForSelector('[role="feed"]', { timeout: 15000 });
            logger.info('[GoogleMaps] 搜索结果容器已加载');

            // 等待至少一个搜索结果出现
            await page.waitForSelector('[role="article"]', { timeout: 15000 });

            await this.scrollResults(page, params.limit || 20);

            const listings = await page.$$('[role="article"]');
            logger.info(`[GoogleMaps] 找到 ${listings.length} 个结果`);

            for (const [index, listing] of listings.slice(0, params.limit || 20).entries()) {
                try {
                    await listing.click();
                    // 增加等待时间,确保详情面板完全加载
                    await page.waitForTimeout(3000);

                    const data = await this.extractDetailData(page);

                    results.push({
                        source: this.source,
                        url: page.url(),
                        scrapedAt: new Date(),
                        data
                    });

                    logger.info(`[GoogleMaps] 提取 ${index + 1}/${params.limit}: name="${data.name}", category="${data.category}"`);
                } catch (error: any) {
                    logger.warn(`[GoogleMaps] 提取详情失败 [${index + 1}]:`, error.message || error);
                    // 输出更详细的错误堆栈
                    if (error.stack) {
                        logger.debug(`[GoogleMaps] 错误堆栈:`, error.stack);
                    }
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

    private async scrollResults(page: Page, targetCount: number) {
        const scrollContainer = await page.$('[role="feed"]');
        if (!scrollContainer) return;

        let lastCount = 0;
        let scrollAttempts = 0;
        const maxScrolls = 10;

        while (scrollAttempts < maxScrolls) {
            await scrollContainer.evaluate(el => {
                el.scrollTop = el.scrollHeight;
            });

            await page.waitForTimeout(2000);

            const currentCount = await page.$$eval('[role="article"]', els => els.length);

            if (currentCount >= targetCount || currentCount === lastCount) {
                break;
            }

            lastCount = currentCount;
            scrollAttempts++;
        }
    }

    private async extractDetailData(page: Page): Promise<Record<string, any>> {
        try {
            logger.debug('[GoogleMaps] 开始提取详情数据...');
            logger.debug(`[GoogleMaps] 当前页面 URL: ${page.url()}`);

            // 等待详情面板的标题出现
            logger.debug('[GoogleMaps] 等待 h1 元素出现...');
            const h1Found = await page.waitForSelector('h1', { timeout: 5000 })
                .then(() => true)
                .catch(() => {
                    logger.warn('[GoogleMaps] 未找到 h1 标题元素');
                    return false;
                });

            if (!h1Found) {
                logger.warn('[GoogleMaps] h1 元素未找到,尝试继续提取...');
            } else {
                logger.debug('[GoogleMaps] h1 元素已找到');
            }

            logger.debug('[GoogleMaps] 执行 page.evaluate 提取数据...');
            // 使用字符串形式避免 TypeScript 编译器转换
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

                    // Google Maps 详情面板的选择器
                    return {
                        // 使用更具体的选择器定位详情面板中的标题
                        name: getText('div[role="main"] h1.DUwDvf') || getText('div[role="main"] h1') || getText('h1.DUwDvf'),
                        // 评分
                        rating: getText('div[role="main"] span[aria-label*="stars"]') || getText('span.MW4etd'),
                        // 评论数
                        reviewCount: getText('div[role="main"] span[aria-label*="reviews"]') || getText('button[aria-label*="reviews"]'),
                        // 类别
                        category: getText('div[role="main"] button[jsaction*="category"]') || getText('button.DkEaL'),
                        // 地址 - 查找包含地址图标的按钮
                        address: getText('button[data-item-id="address"] div.fontBodyMedium') || getText('button[data-tooltip="Copy address"]'),
                        // 电话
                        phone: getText('button[data-item-id*="phone:tel:"] div.fontBodyMedium') || getText('button[data-tooltip="Copy phone number"]'),
                        // 网站
                        website: getAttr('a[data-item-id="authority"]', 'href') || getAttr('a[aria-label*="Website"]', 'href'),
                        // 营业时间
                        hours: getText('div[data-item-id="oh"] div.fontBodyMedium') || getText('table.eK4R0e'),
                        // 描述
                        description: getText('div.WeS02d div.fontBodyMedium') || getText('div[class*="description"]')
                    };
                })()
            `) as Record<string, any>;

            logger.debug(`[GoogleMaps] 提取到的数据: name="${data.name}", category="${data.category}"`);
            return data;
        } catch (error: any) {
            // 保存截图以便调试
            try {
                const timestamp = Date.now();
                const screenshotPath = `./debug_screenshot_${timestamp}.png`;
                await page.screenshot({ path: screenshotPath, fullPage: true });
                logger.error(`[GoogleMaps] 已保存错误截图到: ${screenshotPath}`);
            } catch (screenshotError) {
                logger.warn('[GoogleMaps] 无法保存截图');
            }

            logger.error('[GoogleMaps] extractDetailData 异常:', {
                message: error?.message || '(无错误信息)',
                name: error?.name || '(无错误名称)',
                stack: error?.stack || '(无堆栈信息)',
                error: JSON.stringify(error, null, 2)
            });
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
            region: raw.address || this.extractRegion(raw.address),  // 保存完整地址
            phone: raw.phone,
            email: raw.email,  // 保存邮箱(如果有)
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

    async close() {
        if (this.browser) {
            await this.browser.close();
            logger.info('[GoogleMaps] 浏览器已关闭');
        }
    }
}
