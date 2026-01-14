/**
 * Google Search 爬虫适配器
 * 从 Google 搜索结果中提取公司/网站信息
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
// 浏览器上下文类型声明
declare const window: any;
declare const navigator: any;

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { chromium as playwrightExtra } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { BaseScraperAdapter, ScrapeParams, RawData, StandardData } from '../base.adapter';
import { logger as baseLogger } from '../../utils/logger';
const logger = baseLogger.child({ service: 'search-scraper' });
import { configLoader } from '../../config/config-loader';
import * as fs from 'fs';
import * as path from 'path';

// 启用 Stealth 插件
playwrightExtra.use(StealthPlugin());

interface GoogleSearchConfig {
    headless?: boolean;
    timeout?: number;
    maxPages?: number;      // 最大翻页数，默认5页
    region?: string;        // 搜索区域
    language?: string;      // 搜索语言
    searchOperator?: string; // 额外的搜索运算符，如 "site:*.com"
}

interface AntiScrapingConfig {
    proxy?: {
        enabled?: boolean;
        provider?: string;
        config?: {
            username?: string;
            password?: string;
            endpoint?: string;
        };
    };
    delay?: {
        min?: number;
        max?: number;
    };
    stealth?: {
        enabled?: boolean;
        randomize_viewport?: boolean;
        randomize_user_agent?: boolean;
    };
}

// 常用的 User-Agent 列表
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

// 常用的视口尺寸
const VIEWPORTS = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1536, height: 864 },
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
];

export class GoogleSearchAdapter extends BaseScraperAdapter {
    readonly source = 'google_search';
    private browser?: Browser;
    private context?: BrowserContext;
    private currentPage?: Page;  // 跟踪当前页面，确保同一时间只有一个
    private config: GoogleSearchConfig;
    private antiScrapingConfig: AntiScrapingConfig;
    private debugDir: string;

    constructor() {
        super();
        const sourceConfigs: any[] = configLoader.get('scraper.sources', []);
        const sourceConfig = sourceConfigs.find((s: any) => s.name === 'google_search');
        this.config = (sourceConfig?.config || {}) as GoogleSearchConfig;

        // 加载反爬配置
        this.antiScrapingConfig = configLoader.get('scraper.anti_scraping', {}) as AntiScrapingConfig;

        // 创建调试目录
        this.debugDir = path.join(process.cwd(), 'logs', 'debug-google-search');
        if (!fs.existsSync(this.debugDir)) {
            fs.mkdirSync(this.debugDir, { recursive: true });
        }
    }

    /**
     * 获取随机延迟时间
     */
    private getRandomDelay(): number {
        const min = this.antiScrapingConfig.delay?.min || 5000;
        const max = this.antiScrapingConfig.delay?.max || 15000;
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * 获取随机 User-Agent
     */
    private getRandomUserAgent(): string {
        return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    }

    /**
     * 获取随机视口尺寸
     */
    private getRandomViewport(): { width: number; height: number } {
        return VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)];
    }

    /**
     * 模拟人类行为：随机滚动、移动鼠标等
     */
    private async simulateHumanBehavior(page: Page) {
        try {
            // 随机等待 1-3 秒
            const waitTime = 1000 + Math.random() * 2000;
            await page.waitForTimeout(waitTime);

            // 随机滚动页面
            const scrollAmount = 100 + Math.random() * 300;
            await page.evaluate((amount) => {
                window.scrollBy(0, amount);
            }, scrollAmount);

            // 再等待一下
            await page.waitForTimeout(500 + Math.random() * 1000);

            // 随机移动鼠标
            const viewport = page.viewportSize();
            if (viewport) {
                const x = Math.random() * viewport.width;
                const y = Math.random() * viewport.height;
                await page.mouse.move(x, y);
            }

            logger.debug('[GoogleSearch] 模拟人类行为完成');
        } catch (error: any) {
            logger.debug(`[GoogleSearch] 模拟人类行为失败: ${error.message}`);
        }
    }

    /**
     * 保存调试截图和HTML
     */
    private async saveDebugInfo(page: Page, name: string) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const baseName = `${timestamp}-${name}`;

            // 保存截图
            const screenshotPath = path.join(this.debugDir, `${baseName}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: true });
            logger.info(`[DEBUG] 截图已保存: ${screenshotPath}`);

            // 保存HTML
            const htmlPath = path.join(this.debugDir, `${baseName}.html`);
            const html = await page.content();
            fs.writeFileSync(htmlPath, html);
            logger.info(`[DEBUG] HTML已保存: ${htmlPath}`);
        } catch (error: any) {
            logger.warn(`[DEBUG] 保存调试信息失败: ${error.message}`);
        }
    }

    /**
     * 检测是否遇到验证码或阻止页面
     */
    private async checkForBlocking(page: Page): Promise<boolean> {
        const blockedIndicators = [
            'unusual traffic',
            'captcha',
            'robot',
            'blocked',
            'sorry',
            'detected unusual traffic'
        ];

        const pageText = await page.textContent('body') || '';
        const lowerText = pageText.toLowerCase();

        for (const indicator of blockedIndicators) {
            if (lowerText.includes(indicator)) {
                logger.error(`[GoogleSearch] 检测到阻止页面，包含关键词: "${indicator}"`);
                return true;
            }
        }
        return false;
    }

    async initialize() {
        logger.info('[GoogleSearch] 初始化浏览器...');

        const stealthEnabled = this.antiScrapingConfig.stealth?.enabled !== false;
        const proxyEnabled = this.antiScrapingConfig.proxy?.enabled === true;

        logger.info(`[GoogleSearch] Stealth模式: ${stealthEnabled ? '启用' : '禁用'}`);
        logger.info(`[GoogleSearch] 代理模式: ${proxyEnabled ? '启用' : '禁用'}`);

        try {
            // 构建浏览器启动参数
            const launchArgs = [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-infobars',
                '--window-size=1920,1080',
                '--disable-extensions',
                '--disable-plugins-discovery',
                '--disable-bundled-ppapi-flash',
            ];

            // 使用 playwright-extra 启动浏览器（带 stealth 插件）
            if (stealthEnabled) {
                logger.info('[GoogleSearch] 使用 playwright-extra + stealth 插件');
                this.browser = await playwrightExtra.launch({
                    headless: this.config.headless !== false,
                    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
                    args: launchArgs
                });
            } else {
                this.browser = await chromium.launch({
                    headless: this.config.headless !== false,
                    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
                    args: launchArgs
                });
            }

            // 创建浏览器上下文（带代理和自定义配置）
            const contextOptions: any = {
                userAgent: this.getRandomUserAgent(),
                viewport: this.getRandomViewport(),
                locale: 'en-US',
                timezoneId: 'America/New_York',
                geolocation: { latitude: 40.7128, longitude: -74.0060 }, // New York
                permissions: ['geolocation'],
            };

            // 配置代理 - 检查凭据是否有效
            if (proxyEnabled && this.antiScrapingConfig.proxy?.config) {
                const proxyConfig = this.antiScrapingConfig.proxy.config;
                const hasValidCredentials = proxyConfig.endpoint &&
                    proxyConfig.username &&
                    proxyConfig.password &&
                    !proxyConfig.username.includes('${') &&
                    !proxyConfig.password.includes('${');

                if (hasValidCredentials) {
                    contextOptions.proxy = {
                        server: `http://${proxyConfig.endpoint}`,
                        username: proxyConfig.username,
                        password: proxyConfig.password
                    };
                    logger.info(`[GoogleSearch] 代理服务器: ${proxyConfig.endpoint}`);
                } else {
                    logger.warn('[GoogleSearch] 代理凭据未配置或无效，将不使用代理');
                }
            }

            this.context = await this.browser.newContext(contextOptions);

            // 注入额外的反检测脚本
            await this.context.addInitScript(() => {
                // 修改 navigator.webdriver
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined,
                });

                // 修改 chrome 属性
                (window as any).chrome = {
                    runtime: {},
                };

                // 修改插件数量
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [1, 2, 3, 4, 5],
                });

                // 修改语言
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['en-US', 'en'],
                });
            });

            logger.info('[GoogleSearch] 浏览器初始化成功');
            logger.info(`[GoogleSearch] User-Agent: ${contextOptions.userAgent}`);
            logger.info(`[GoogleSearch] Viewport: ${contextOptions.viewport.width}x${contextOptions.viewport.height}`);
        } catch (error: any) {
            logger.error('[GoogleSearch] 浏览器启动失败:', error);
            throw error;
        }
    }

    async scrape(params: ScrapeParams): Promise<RawData[]> {
        if (!this.browser || !this.context) await this.initialize();

        // 关闭之前的页面，确保同一时间只有一个搜索在运行
        if (this.currentPage) {
            try {
                await this.currentPage.close();
                logger.info('[GoogleSearch] 已关闭上一个搜索页面');
            } catch {
                // 忽略关闭错误
            }
            this.currentPage = undefined;
        }

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

        // 使用预配置的上下文创建页面
        const page = await this.context!.newPage();
        this.currentPage = page;  // 保存当前页面引用

        // 设置额外的 HTTP 头
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
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

            // 添加随机延迟，模拟人类行为
            const initialDelay = this.getRandomDelay();
            logger.info(`[GoogleSearch] 等待 ${initialDelay}ms 后访问...`);
            await page.waitForTimeout(initialDelay);

            await page.goto(googleUrl, {
                waitUntil: 'domcontentloaded',
                timeout: effectiveConfig.timeout || 30000
            });

            // 模拟人类行为：随机滚动和等待
            await this.simulateHumanBehavior(page);

            // 处理可能的 Cookie 同意弹窗
            await this.handleCookieConsent(page);

            // 保存初始页面调试信息
            await this.saveDebugInfo(page, 'initial-page');

            // 检测是否被阻止
            if (await this.checkForBlocking(page)) {
                await this.saveDebugInfo(page, 'blocked-page');
                throw new Error('Google 检测到异常流量，请稍后重试或使用代理');
            }

            // 等待搜索结果加载 - 尝试多种选择器
            const searchSelectors = ['#search', '#rso', 'div[data-async-context]', '#main'];
            let foundSelector = false;
            for (const selector of searchSelectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 5000 });
                    logger.info(`[GoogleSearch] 找到搜索结果容器: ${selector}`);
                    foundSelector = true;
                    break;
                } catch {
                    logger.debug(`[GoogleSearch] 选择器 ${selector} 未找到`);
                }
            }

            if (!foundSelector) {
                logger.warn('[GoogleSearch] 未找到任何搜索结果容器');
                await this.saveDebugInfo(page, 'no-search-container');
            }

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
                    // 添加随机延迟模拟人类翻页行为
                    const pageDelay = this.getRandomDelay();
                    logger.info(`[GoogleSearch] 翻页前等待 ${pageDelay}ms...`);
                    await page.waitForTimeout(pageDelay);

                    // 模拟人类行为
                    await this.simulateHumanBehavior(page);
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
            // 不关闭页面，保持浏览器打开以便调试
            // await page.close();
            logger.info('[GoogleSearch] 保持浏览器页面打开以便调试');
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
            // Google 搜索结果的多种选择器 (Google 经常更新页面结构)
            const resultSelectors = [
                '#search .g',
                '#rso .g',
                'div.g',
                '[data-hveid] .g',
                '#search div[data-sokoban-container]',
                'div[data-header-feature] .g'
            ];

            let resultElements: any[] = [];

            // 尝试多种选择器
            for (const selector of resultSelectors) {
                resultElements = await page.$$(selector);
                if (resultElements.length > 0) {
                    logger.info(`[GoogleSearch] 使用选择器 "${selector}" 找到 ${resultElements.length} 个结果元素`);
                    break;
                }
            }

            if (resultElements.length === 0) {
                logger.warn('[GoogleSearch] 所有选择器都未找到结果元素');
                // 保存调试信息
                await this.saveDebugInfo(page, 'no-results-found');

                // 尝试打印页面上所有可能的链接
                const allLinks = await page.$$eval('a[href^="http"]', (links) =>
                    links.slice(0, 20).map(a => ({
                        href: a.getAttribute('href'),
                        text: a.textContent?.trim().substring(0, 50)
                    }))
                );
                logger.info(`[GoogleSearch] 页面上的链接样本: ${JSON.stringify(allLinks, null, 2)}`);
                return results;
            }

            for (const element of resultElements) {
                try {
                    const data = await element.evaluate((el: any) => {
                        // 提取标题 - 尝试多种选择器
                        const titleSelectors = ['h3', 'h2', '[role="heading"]', '.LC20lb'];
                        let title = '';
                        for (const sel of titleSelectors) {
                            const titleEl = el.querySelector(sel);
                            if (titleEl?.textContent) {
                                title = titleEl.textContent.trim();
                                break;
                            }
                        }

                        // 提取链接 - 尝试多种方式
                        let url = '';
                        const linkEl = el.querySelector('a[href^="http"]');
                        if (linkEl) {
                            url = linkEl.getAttribute('href') || '';
                        }

                        // 提取描述
                        const descSelectors = [
                            '[data-sncf]',
                            '.VwiC3b',
                            '[data-content-feature]',
                            '.IsZvec',
                            '.lEBKkf'
                        ];
                        let description = '';
                        for (const sel of descSelectors) {
                            const descEl = el.querySelector(sel);
                            if (descEl?.textContent) {
                                description = descEl.textContent.trim();
                                break;
                            }
                        }

                        // 提取显示的 URL
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

            logger.info(`[GoogleSearch] 成功提取 ${results.length} 条有效结果`);
        } catch (error: any) {
            logger.error('[GoogleSearch] 提取结果失败:', error.message);
            await this.saveDebugInfo(page, 'extract-error');
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
        if (this.context) {
            await this.context.close();
            this.context = undefined;
        }
        if (this.browser) {
            await this.browser.close();
            this.browser = undefined;
            logger.info('[GoogleSearch] 浏览器已关闭');
        }
    }
}
