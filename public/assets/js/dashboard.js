// API 基础 URL
const API_BASE = 'http://localhost:3000/api';

// 全局状态
let charts = {};

// 页面初始化
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initCharts();
    loadDashboardData();
    setupFormHandlers();

    // 定时刷新数据
    setInterval(() => {
        if (document.querySelector('#dashboard-page').classList.contains('active')) {
            loadDashboardData();
        }
    }, 30000); // 每30秒刷新

    initSocket();
});

// ===== Socket.IO & 日志 =====
let socket;

function initSocket() {
    socket = io();

    const logContent = document.getElementById('log-content');

    socket.on('connect', () => {
        appendLog({ level: 'system', message: '已连接到实时日志服务器' });
    });

    socket.on('disconnect', () => {
        appendLog({ level: 'system', message: '与日志服务器断开连接' });
    });

    socket.on('log', (data) => {
        appendLog(data);
    });
}

function appendLog(data) {
    const logContent = document.getElementById('log-content');
    if (!logContent) return;

    const line = document.createElement('div');
    line.className = `log-line ${data.level || 'info'}`;

    const timestamp = new Date().toLocaleTimeString();
    line.innerHTML = `<span class="log-timestamp">[${timestamp}]</span>${data.message}`;

    logContent.appendChild(line);

    // 保持最多 1000 行日志
    if (logContent.children.length > 1000) {
        logContent.removeChild(logContent.firstChild);
    }

    // 自动滚动到底部
    const terminal = document.getElementById('log-terminal');
    if (terminal) {
        terminal.scrollTop = terminal.scrollHeight;
    }
}

function clearLogs() {
    const logContent = document.getElementById('log-content');
    if (logContent) {
        logContent.innerHTML = '<div class="log-line system">日志已清空</div>';
    }
}

// ===== 导航 =====
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();

            // 更新导航状态
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // 切换页面
            const pageName = item.dataset.page;
            showPage(pageName);
        });
    });
}

function showPage(pageName) {
    // 隐藏所有页面
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });

    // 显示目标页面
    const targetPage = document.querySelector(`#${pageName}-page`);
    if (targetPage) {
        targetPage.classList.add('active');
    }

    // 更新标题
    const titles = {
        dashboard: '数据概览',
        tasks: '搜索线索',
        companies: '客户线索',
        ratings: '优质客户'
    };
    document.querySelector('#page-title').textContent = titles[pageName] || '仪表盘';

    // 加载对应数据
    switch (pageName) {
        case 'dashboard':
            loadDashboardData();
            break;
        case 'tasks':
            loadQueueStats();
            break;
        case 'companies':
            loadCompanies();
            break;
        case 'ratings':
            loadRatings();
            break;
    }
}

// ===== 图表初始化 =====
function initCharts() {
    // 队列状态图表
    const queueCtx = document.getElementById('queueChart');
    if (queueCtx) {
        charts.queue = new Chart(queueCtx, {
            type: 'bar',
            data: {
                labels: ['爬取队列', '处理队列', '评级队列', '自动化队列'],
                datasets: [
                    {
                        label: '等待中',
                        data: [0, 0, 0, 0],
                        backgroundColor: 'rgba(102, 126, 234, 0.6)',
                    },
                    {
                        label: '处理中',
                        data: [0, 0, 0, 0],
                        backgroundColor: 'rgba(237, 137, 54, 0.6)',
                    },
                    {
                        label: '已完成',
                        data: [0, 0, 0, 0],
                        backgroundColor: 'rgba(72, 187, 120, 0.6)',
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: '#cbd5e1'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: '#cbd5e1'
                        }
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            color: '#cbd5e1'
                        }
                    }
                }
            }
        });
    }

    // 评分分布图表
    const scoreCtx = document.getElementById('scoreChart');
    if (scoreCtx) {
        charts.score = new Chart(scoreCtx, {
            type: 'doughnut',
            data: {
                labels: ['高分 (≥9)', '中分 (6-9)', '低分 (<6)'],
                datasets: [{
                    data: [0, 0, 0],
                    backgroundColor: [
                        'rgba(72, 187, 120, 0.8)',
                        'rgba(237, 137, 54, 0.8)',
                        'rgba(245, 101, 101, 0.8)'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#cbd5e1',
                            padding: 20
                        }
                    }
                }
            }
        });
    }
}

// ===== API 调用 =====
async function fetchAPI(endpoint) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`);
        if (!response.ok) throw new Error('API 请求失败');
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        showNotification('数据加载失败,请稍后重试', 'error');
        return null;
    }
}

async function postAPI(endpoint, data) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('API 请求失败');
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        showNotification('操作失败,请稍后重试', 'error');
        return null;
    }
}

// ===== 仪表盘数据加载 =====
async function loadDashboardData() {
    // 加载队列统计
    const queueStats = await fetchAPI('/queues/stats');
    if (queueStats) {
        updateQueueCharts(queueStats);
        updateTaskStats(queueStats);
    }

    // 加载公司统计
    const companies = await fetchAPI('/companies?limit=1');
    if (companies) {
        document.querySelector('#total-companies').textContent = companies.data?.length || 0;
    }

    // 加载高分线索
    const ratings = await fetchAPI('/ratings?minScore=9&limit=5');
    if (ratings) {
        updateRecentLeads(ratings.data);
        document.querySelector('#high-score-leads').textContent = ratings.data?.length || 0;
    }
}

function updateQueueCharts(stats) {
    if (!charts.queue) return;

    const waiting = [
        stats.scrape?.waiting || 0,
        stats.process?.waiting || 0,
        stats.rating?.waiting || 0,
        stats.automation?.waiting || 0
    ];

    const active = [
        stats.scrape?.active || 0,
        stats.process?.active || 0,
        stats.rating?.active || 0,
        stats.automation?.active || 0
    ];

    const completed = [
        stats.scrape?.completed || 0,
        stats.process?.completed || 0,
        stats.rating?.completed || 0,
        stats.automation?.completed || 0
    ];

    charts.queue.data.datasets[0].data = waiting;
    charts.queue.data.datasets[1].data = active;
    charts.queue.data.datasets[2].data = completed;
    charts.queue.update();
}

function updateTaskStats(stats) {
    const totalCompleted = Object.values(stats).reduce((sum, q) => sum + (q.completed || 0), 0);
    const totalPending = Object.values(stats).reduce((sum, q) => sum + (q.waiting || 0) + (q.active || 0), 0);

    document.querySelector('#tasks-completed').textContent = totalCompleted;
    document.querySelector('#tasks-pending').textContent = totalPending;
}

function updateRecentLeads(data) {
    const tbody = document.querySelector('#recent-leads-body');
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">暂无优质客户</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(item => `
        <tr>
            <td><strong>${item.company?.name || '未知公司'}</strong></td>
            <td>${item.company?.industry || '-'}</td>
            <td><span class="score-badge score-high">${item.rating?.totalScore?.toFixed(1) || '-'}</span></td>
            <td>${formatDate(item.rating?.ratedAt)}</td>
            <td>
                <button class="btn-secondary btn-sm" onclick="viewDetail('${item.company?.id}')">
                    查看详情
                </button>
            </td>
        </tr>
    `).join('');
}

// ===== 任务管理 =====
function setupFormHandlers() {
    const form = document.querySelector('#add-task-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData(form);
            const data = {
                source: formData.get('source'),
                query: formData.get('query'),
                limit: parseInt(formData.get('limit')),
                priority: parseInt(formData.get('priority'))
            };

            const result = await postAPI('/tasks/scrape', data);
            if (result && result.success) {
                showNotification('搜索任务添加成功!正在后台搜索...', 'success');
                form.reset();
                loadQueueStats();
            }
        });
    }
}

async function loadQueueStats() {
    const stats = await fetchAPI('/queues/stats');
    if (!stats) return;

    const container = document.querySelector('#queue-stats-container');
    if (!container) return;

    container.innerHTML = `
        <div class="stats-grid">
            ${Object.entries(stats).map(([name, data]) => `
                <div class="stat-card">
                    <div class="stat-content">
                        <h4>${getQueueName(name)}</h4>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 12px;">
                            <div>
                                <div class="stat-value" style="font-size: 24px;">${data.waiting || 0}</div>
                                <div class="stat-label">等待中</div>
                            </div>
                            <div>
                                <div class="stat-value" style="font-size: 24px;">${data.active || 0}</div>
                                <div class="stat-label">处理中</div>
                            </div>
                            <div>
                                <div class="stat-value" style="font-size: 24px;">${data.completed || 0}</div>
                                <div class="stat-label">已完成</div>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function getQueueName(key) {
    const names = {
        scrape: '搜索任务',
        process: '处理任务',
        rating: '评分任务',
        automation: '自动化任务'
    };
    return names[key] || key;
}

// ===== 公司列表 =====
async function loadCompanies(page = 1) {
    const data = await fetchAPI(`/companies?page=${page}&limit=20`);
    if (!data) return;

    const tbody = document.querySelector('#companies-body');
    if (!data.data || data.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state">暂无客户数据,请先添加搜索任务</td></tr>';
        return;
    }

    tbody.innerHTML = data.data.map(company => {
        // 处理网站字段,确保空字符串也显示为'-'
        const websiteDisplay = company.website && company.website.trim() !== ''
            ? `<a href="${company.website}" target="_blank" style="color: #667eea; text-decoration: none;">${company.website.length > 30 ? company.website.substring(0, 30) + '...' : company.website}</a>`
            : '-';

        return `
            <tr>
                <td><strong>${company.name}</strong></td>
                <td>${company.industry || '-'}</td>
                <td>${websiteDisplay}</td>
                <td>${company.phone || '-'}</td>
                <td>${company.email || '-'}</td>
                <td>${company.region || '-'}</td>
                <td>${company.estimatedSize || '-'}</td>
                <td>${company.source}</td>
                <td>${formatDate(company.scrapedAt)}</td>
            </tr>
        `;
    }).join('');
}

// ===== 评级结果 =====
async function loadRatings() {
    const filter = document.querySelector('#score-filter')?.value || 0;
    const data = await fetchAPI(`/ratings?minScore=${filter}&limit=50`);
    if (!data) return;

    const tbody = document.querySelector('#ratings-body');
    if (!data.data || data.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">暂无评级数据</td></tr>';
        return;
    }

    tbody.innerHTML = data.data.map(item => {
        const scoreClass = item.rating.totalScore >= 9 ? 'score-high' :
            item.rating.totalScore >= 6 ? 'score-medium' : 'score-low';

        return `
            <tr>
                <td><strong>${item.company?.name || '未知'}</strong></td>
                <td><span class="score-badge ${scoreClass}">${item.rating.totalScore.toFixed(1)}</span></td>
                <td>${item.rating.breakdown?.firmographics || '-'}</td>
                <td>${item.rating.breakdown?.intentSignals || '-'}</td>
                <td>${item.rating.breakdown?.painPoints || '-'}</td>
                <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${item.rating.reasoning || '-'}
                </td>
                <td>${formatDate(item.rating.ratedAt)}</td>
            </tr>
        `;
    }).join('');
}

// ===== 工具函数 =====
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showNotification(message, type = 'info') {
    // 简单的通知实现
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 24px;
        background: ${type === 'success' ? '#48bb78' : type === 'error' ? '#f56565' : '#4299e1'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function viewDetail(companyId) {
    console.log('查看详情:', companyId);
    // TODO: 实现详情页面
}

// 全局导出函数供 HTML 调用
window.loadCompanies = loadCompanies;
window.loadRatings = loadRatings;
window.loadQueueStats = loadQueueStats;
window.viewDetail = viewDetail;
window.clearLogs = clearLogs;
