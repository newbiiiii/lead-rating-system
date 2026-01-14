// 应用主入口
import { router } from './router.js';
import { initSocket } from './modules/socket.js';

// 初始化应用
async function init() {
    console.log('🚀 Lead Rating System - Initializing...');

    // 初始化WebSocket
    initSocket();

    // 初始化导航
    initNavigation();

    // 加载默认页面
    const hash = window.location.hash.slice(1) || 'dashboard';
    await router.loadPage(hash);

    // 监听hash变化
    window.addEventListener('hashchange', async () => {
        const pageName = window.location.hash.slice(1) || 'dashboard';
        await router.loadPage(pageName);
    });

    console.log('✅ System ready!');
}

function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        item.addEventListener('click', async (e) => {
            e.preventDefault();

            // 从 href 获取完整的页面路径（包含参数）
            const href = item.getAttribute('href');
            const fullPageName = href ? href.slice(1) : item.dataset.page; // 去掉 # 符号
            const basePage = fullPageName.includes('?') ? fullPageName.split('?')[0] : fullPageName;

            // 更新导航状态
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // 先更新URL（让 init 能正确读取 hash）
            window.location.hash = fullPageName;

            // 加载页面
            await router.loadPage(fullPageName);

            // 更新页面标题
            updatePageTitle(basePage);
        });
    });
}

function updatePageTitle(pageName) {
    const titles = {
        dashboard: '数据概览',
        tasks: '搜索线索',
        'rating-tasks': '评分任务',
        management: '任务管理',
        'pending-config': '待配置规则',
        'leads-by-status': '线索管理',
        'enrich-leads': '数据增强'
    };

    const titleElement = document.querySelector('#page-title');
    if (titleElement) {
        titleElement.textContent = titles[pageName] || '仪表盘';
    }
}

// 启动应用
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
