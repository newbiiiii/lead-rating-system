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

            const pageName = item.dataset.page;

            // 更新导航状态
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // 加载页面
            await router.loadPage(pageName);

            // 更新URL
            window.location.hash = pageName;

            // 更新页面标题
            updatePageTitle(pageName);
        });
    });
}

function updatePageTitle(pageName) {
    const titles = {
        dashboard: '数据概览',
        tasks: '搜索线索',
        'rating-tasks': '评分任务',
        management: '任务管理'
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
