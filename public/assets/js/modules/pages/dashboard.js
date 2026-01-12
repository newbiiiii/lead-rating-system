// Dashboard页面逻辑模块
import { fetchAPI } from '../api.js';
import { formatDate, showNotification } from '../utils.js';

let charts = {
    grade: null,
    trend: null
};

// 队列配置 - 方便后期扩展
const QUEUE_CONFIG = [
    {
        key: 'scrape',
        name: '爬虫队列',
        type: 'scraper',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>`
    },
    {
        key: 'rating',
        name: '评级队列',
        type: 'rating',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>`
    },
    {
        key: 'crm',
        name: 'CRM队列',
        type: 'crm',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>`
    }
    // 后期可以添加更多队列，例如：
    // { key: 'email', name: '邮件队列', type: 'automation', icon: '...' }
];

// 评级颜色配置
const GRADE_COLORS = {
    A: { bg: '#10b981', label: 'A级 - 优质' },
    B: { bg: '#3b82f6', label: 'B级 - 良好' },
    C: { bg: '#f59e0b', label: 'C级 - 一般' },
    D: { bg: '#ef4444', label: 'D级 - 较差' }
};

export async function init() {
    // 初始化图表
    initCharts();

    // 加载所有数据
    await loadDashboardData();
}

function initCharts() {
    // 评级分布图表
    const gradeCtx = document.getElementById('gradeChart');
    if (gradeCtx) {
        charts.grade = new Chart(gradeCtx, {
            type: 'doughnut',
            data: {
                labels: ['A级', 'B级', 'C级', 'D级'],
                datasets: [{
                    data: [0, 0, 0, 0],
                    backgroundColor: [
                        GRADE_COLORS.A.bg,
                        GRADE_COLORS.B.bg,
                        GRADE_COLORS.C.bg,
                        GRADE_COLORS.D.bg
                    ],
                    borderWidth: 0,
                    cutout: '65%'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false // 使用自定义图例
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const value = context.parsed;
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                return `${context.label}: ${value} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // 趋势图表（可选，显示最近处理趋势）
    const trendCtx = document.getElementById('trendChart');
    if (trendCtx) {
        charts.trend = new Chart(trendCtx, {
            type: 'line',
            data: {
                labels: ['6天前', '5天前', '4天前', '3天前', '2天前', '昨天', '今天'],
                datasets: [
                    {
                        label: '爬取',
                        data: [0, 0, 0, 0, 0, 0, 0],
                        borderColor: '#667eea',
                        backgroundColor: 'rgba(102, 126, 234, 0.1)',
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: '评级',
                        data: [0, 0, 0, 0, 0, 0, 0],
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'CRM同步',
                        data: [0, 0, 0, 0, 0, 0, 0],
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        fill: true,
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0, 0, 0, 0.05)' },
                        ticks: { color: '#64748b' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#64748b' }
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#64748b',
                            usePointStyle: true,
                            padding: 20
                        }
                    }
                }
            }
        });
    }
}

async function loadDashboardData() {
    try {
        // 并行加载所有数据
        const [queueStats, gradeStats, ratingStats, crmStats, recentLeads] = await Promise.all([
            fetchAPI('/api/queues/stats'),
            fetchAPI('/api/dashboard/grade-stats'),
            fetchAPI('/api/dashboard/rating-stats'),
            fetchAPI('/api/dashboard/crm-stats'),
            fetchAPI('/api/dashboard/recent-leads?grades=A,B&limit=10')
        ]);

        // 更新队列卡片
        if (queueStats) {
            renderQueueCards(queueStats);
        }

        // 更新评级统计
        if (gradeStats) {
            updateGradeStats(gradeStats);
            updateGradeChart(gradeStats);
            renderGradeLegend(gradeStats);
        }

        // 更新评级状态统计
        if (ratingStats) {
            updateRatingStats(ratingStats);
        }

        // 更新CRM同步统计
        if (crmStats) {
            updateCrmStats(crmStats);
        }

        // 更新最新优质客户
        if (recentLeads) {
            updateRecentLeads(recentLeads.data || recentLeads);
        }

    } catch (error) {
        console.error('Dashboard load error:', error);
        showNotification('数据加载失败', 'error');
    }
}

function renderQueueCards(stats) {
    const container = document.getElementById('queue-grid');
    if (!container) return;

    const html = QUEUE_CONFIG.map(queue => {
        const queueData = stats[queue.key] || {};
        return `
            <div class="queue-card ${queue.type}">
                <div class="queue-card-header">
                    <div class="queue-card-icon">${queue.icon}</div>
                    <div class="queue-card-title">${queue.name}</div>
                </div>
                <div class="queue-card-stats">
                    <div class="queue-stat-item">
                        <div class="queue-stat-value">${queueData.waiting || 0}</div>
                        <div class="queue-stat-label">等待中</div>
                    </div>
                    <div class="queue-stat-item">
                        <div class="queue-stat-value">${queueData.active || 0}</div>
                        <div class="queue-stat-label">处理中</div>
                    </div>
                    <div class="queue-stat-item">
                        <div class="queue-stat-value">${queueData.completed || 0}</div>
                        <div class="queue-stat-label">已完成</div>
                    </div>
                    <div class="queue-stat-item">
                        <div class="queue-stat-value">${queueData.failed || 0}</div>
                        <div class="queue-stat-label">失败</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

function updateGradeStats(stats) {
    // 更新统计卡片
    const totalEl = document.getElementById('total-leads');
    const qualityTotalEl = document.getElementById('quality-total');
    const gradeAEl = document.getElementById('grade-a-count');
    const gradeBEl = document.getElementById('grade-b-count');

    const gradeA = stats.A || 0;
    const gradeB = stats.B || 0;
    const qualityTotal = gradeA + gradeB;

    if (totalEl) totalEl.textContent = stats.total || 0;
    if (qualityTotalEl) qualityTotalEl.textContent = qualityTotal;
    if (gradeAEl) gradeAEl.textContent = gradeA;
    if (gradeBEl) gradeBEl.textContent = gradeB;
}

function updateRatingStats(stats) {
    const ratedEl = document.getElementById('rated-count');
    const pendingEl = document.getElementById('pending-rating-count');
    const failedEl = document.getElementById('rating-failed-count');

    if (ratedEl) ratedEl.textContent = stats.rated || 0;
    if (pendingEl) pendingEl.textContent = stats.pending || 0;
    if (failedEl) failedEl.textContent = stats.failed || 0;
}

function updateCrmStats(stats) {
    const syncedEl = document.getElementById('crm-synced-count');
    const pendingEl = document.getElementById('crm-pending-count');
    const failedEl = document.getElementById('crm-failed-count');

    if (syncedEl) syncedEl.textContent = stats.synced || 0;
    if (pendingEl) pendingEl.textContent = stats.pending || 0;
    if (failedEl) failedEl.textContent = stats.failed || 0;
}

function updateGradeChart(stats) {
    if (!charts.grade) return;

    charts.grade.data.datasets[0].data = [
        stats.A || 0,
        stats.B || 0,
        stats.C || 0,
        stats.D || 0
    ];
    charts.grade.update();
}

function renderGradeLegend(stats) {
    const container = document.getElementById('grade-legend');
    if (!container) return;

    const total = (stats.A || 0) + (stats.B || 0) + (stats.C || 0) + (stats.D || 0);

    const grades = ['A', 'B', 'C', 'D'];
    const html = grades.map(grade => {
        const count = stats[grade] || 0;
        const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
        return `
            <div class="legend-item">
                <span class="legend-dot grade-${grade.toLowerCase()}"></span>
                <span>${GRADE_COLORS[grade].label}: ${count} (${percentage}%)</span>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

function updateRecentLeads(data) {
    const tbody = document.getElementById('recent-leads-body');
    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">暂无优质客户</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(item => {
        const grade = item.overallRating || item.rating?.overallRating || '-';
        const gradeClass = ['A', 'B', 'C', 'D'].includes(grade) ? `grade-${grade.toLowerCase()}` : 'grade-unknown';

        return `
            <tr>
                <td><strong>${item.companyName || item.company?.name || '未知公司'}</strong></td>
                <td>${item.taskName || item.task?.name || '-'}</td>
                <td><span class="grade-badge ${gradeClass}">${grade}</span></td>
                <td class="truncate" style="max-width: 200px;" title="${item.suggestion || '-'}">${item.suggestion || '-'}</td>
                <td>${formatDate(item.ratedAt || item.rating?.ratedAt)}</td>
            </tr>
        `;
    }).join('');
}

// 导出给HTML调用的函数
window.refreshDashboard = loadDashboardData;
window.loadRecentLeads = async function () {
    const recentLeads = await fetchAPI('/api/dashboard/recent-leads?grades=A,B&limit=10');
    if (recentLeads) {
        updateRecentLeads(recentLeads.data || recentLeads);
    }
};
