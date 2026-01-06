/**
 * Google Maps 爬虫适配器示例
 * 使用 Playwright 实现浏览器自动化
 */

import { chromium, Browser, Page } from 'playwright';
import { BaseScraperAdapter, ScrapeParams, RawData, StandardData } from './1-scraper-adapter-base';

export class GoogleMapsAdapter extends BaseScraperAdapter {
    readonly source = 'google_maps';
    private browser?: Browser;

    async initialize() {
        this.browser = await chromium.launch({
            headless: true,
            args: ['--disable-blink-features=AutomationControlled'] // 反爬
        });
    }

    async scrape(params: ScrapeParams): Promise<RawData[]> {
        if (!this.browser) await this.initialize();

        const page = await this.browser!.newPage();
        const results: RawData[] = [];

        try {
            // 1. 搜索
            const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(params.query)}`;
            await page.goto(searchUrl, { waitUntil: 'networkidle' });

            // 2. 等待结果加载
            await page.waitForSelector('[role="article"]', { timeout: 10000 });

            // 3. 滚动加载更多结果
            await this.scrollResults(page, params.limit || 20);

            // 4. 提取所有结果链接
            const listings = await page.$$('[role="article"]');

            for (const listing of listings.slice(0, params.limit || 20)) {
                try {
                    await listing.click();
                    await page.waitForTimeout(1000); // 等待详情加载

                    const data = await this.extractDetailData(page);

                    results.push({
                        source: this.source,
                        url: page.url(),
                        scrapedAt: new Date(),
                        data
                    });
                } catch (error) {
                    console.error('提取详情失败:', error);
                }
            }

            return results;
        } finally {
            await page.close();
        }
    }

    /**
     * 滚动加载更多结果
     */
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

    /**
     * 提取详情数据
     */
    private async extractDetailData(page: Page): Promise<Record<string, any>> {
        return await page.evaluate(() => {
            const getText = (selector: string) =>
                document.querySelector(selector)?.textContent?.trim() || '';

            const getAttr = (selector: string, attr: string) =>
                document.querySelector(selector)?.getAttribute(attr) || '';

            return {
                name: getText('h1'),
                rating: getText('[role="img"][aria-label*="stars"]'),
                reviewCount: getText('button[aria-label*="reviews"]'),
                category: getText('button[jsaction*="category"]'),
                address: getText('button[data-item-id="address"]'),
                phone: getText('button[data-item-id*="phone"]'),
                website: getAttr('a[data-item-id="authority"]', 'href'),
                hours: getText('[data-item-id="oh"]'),
                description: getText('[class*="description"]')
            };
        });
    }

    validate(data: RawData): boolean {
        return !!(data.data.name && data.data.category);
    }

    transform(data: RawData): StandardData {
        const raw = data.data;

        return {
            name: raw.name,
            website: raw.website,
            domain: raw.website ? this.extractDomain(raw.website) : undefined,
            industry: raw.category,
            region: this.extractRegion(raw.address),
            phone: raw.phone,
            productDescription: raw.description,
            estimatedSize: this.estimateSizeByReviews(raw.reviewCount),
            sourceUrl: data.url,
            scrapedAt: data.scrapedAt
        };
    }

    /**
     * 从地址提取地区
     */
    private extractRegion(address: string): string {
        const match = address.match(/([^,]+),\s*([A-Z]{2}|[\u4e00-\u9fa5]+)/);
        return match ? match[2] : '';
    }

    /**
     * 根据评论数估算规模
     */
    private estimateSizeByReviews(reviewCount: string): 'small' | 'medium' | 'large' {
        const count = parseInt(reviewCount.replace(/[^\d]/g, '')) || 0;
        if (count < 50) return 'small';
        if (count < 500) return 'medium';
        return 'large';
    }

    async close() {
        await this.browser?.close();
    }
}

// 使用示例
/*
const adapter = new GoogleMapsAdapter();

const results = await adapter.scrape({
  query: '上海 软件开发公司',
  limit: 30
});

for (const raw of results) {
  if (adapter.validate(raw)) {
    const standard = adapter.transform(raw);
    console.log(standard);
  }
}

await adapter.close();
*/
