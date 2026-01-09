// 路由管理器
class PageRouter {
    constructor() {
        this.currentPage = null;
        this.loadedModules = {};
    }

    async loadPage(pageName) {
        try {
            // 解析带参数的页面名（如 leads-by-status?status=failed）
            let actualPageName = pageName;
            if (pageName.includes('?')) {
                actualPageName = pageName.split('?')[0];
            }

            // 1. 隐藏所有页面内容
            const contentArea = document.querySelector('.content');
            if (!contentArea) return;

            // 2. 加载HTML片段
            const response = await fetch(`/assets/pages/${actualPageName}.html`);
            if (!response.ok) throw new Error(`Failed to load ${actualPageName}.html`);

            const html = await response.text();
            contentArea.innerHTML = html;

            // 3. 动态加载页面专属逻辑模块
            if (!this.loadedModules[actualPageName]) {
                try {
                    const pageModule = await import(`/assets/js/modules/pages/${actualPageName}.js`);
                    this.loadedModules[actualPageName] = pageModule;

                    // 初始化页面
                    if (pageModule.init) {
                        await pageModule.init();
                    }
                } catch (error) {
                    console.warn(`No module found for ${actualPageName}, using inline handlers`);
                }
            } else {
                // 如果模块已加载，直接调用init
                const pageModule = this.loadedModules[actualPageName];
                if (pageModule.init) {
                    await pageModule.init();
                }
            }

            this.currentPage = pageName;
        } catch (error) {
            console.error(`Failed to load page ${pageName}:`, error);
            document.querySelector('.content').innerHTML = `
                <div style="text-align: center; padding: 40px; color: #ef4444;">
                    <h2>页面加载失败</h2>
                    <p>${error.message}</p>
                </div>
            `;
        }
    }

    getCurrentPage() {
        return this.currentPage;
    }
}

export const router = new PageRouter();
