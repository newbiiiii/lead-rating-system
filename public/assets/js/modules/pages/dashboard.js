// Dashboard页面逻辑模块
import { fetchAPI } from '../api.js';
import { formatDate, showNotification } from '../utils.js';

let charts = {
    queue: null,
    score: null
};

export async function init() {
    // 初始化图表
    initCharts();

    // 加载数据
    await loadDashboardData();

    // 绑定事件（如果有刷新按钮）
    const refreshBtn = document.querySelector('.section-header button');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadDashboardData);
    }
}

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
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: { color: '#cbd5e1' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#cbd5e1' }
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: '#cbd5e1' }
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

async function loadDashboardData() {
    // 加载队列统计
    const queueStats = await fetchAPI('/api/queues/stats');
    if (queueStats) {
        updateQueueCharts(queueStats);
        updateTaskStats(queueStats);
    }

    // 加载公司统计
    const companies = await fetchAPI('/api/companies?limit=1');
    if (companies) {
        document.querySelector('#total-companies').textContent = companies.data?.length || 0;
    }

    // 加载高分线索
    const ratings = await fetchAPI('/api/ratings?minScore=9&limit=5');
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

// 导出给HTML调用的函数
window.loadRatings = loadDashboardData;
