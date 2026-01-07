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
        ratings: '优质客户',
        history: '任务历史'  // 添加
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
        case 'history':
            loadTaskHistory();
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

            const formData = new FormData(e.target);
            const taskData = {
                source: formData.get('source'),
                query: formData.get('query'),
                limit: parseInt(formData.get('limit')),
                priority: parseInt(formData.get('priority')),
                config: {}
            };

            /// 如果选择了城市,添加地理位置信息
            const lat = formData.get('latitude');
            const lng = formData.get('longitude');
            const radius = formData.get('radius');
            if (lat && lng && radius) {
                // 获取城市和国家名称
                const citySelect = document.getElementById('city-select');
                const countrySelect = document.getElementById('country-select');
                const city = citySelect?.value || '';
                const country = countrySelect?.value || '';
                console.log('已添加地理位置:', { country, city, lat, lng, radius });
                taskData.config = {
                    geolocation: {
                        country: country,
                        city: city,
                        latitude: parseFloat(lat),
                        longitude: parseFloat(lng),
                        radius: parseFloat(radius),
                        step: 0.01,
                        zoom: 15
                    }
                };
            }

            try {
                const res = await fetch('/api/tasks/scrape', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(taskData)
                });

                const result = await res.json();

                if (result.success) {
                    alert('任务已添加成功！');
                    e.target.reset();
                    // 重置城市选择
                    document.getElementById('city-select').disabled = true;
                    document.getElementById('city-select').innerHTML = '<option value="">请先选择国家</option>';
                } else {
                    alert('任务添加失败: ' + result.error);
                }
            } catch (error) {
                alert('请求失败: ' + error.message);
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

// ============ 国家-城市选择功能 ============
// 页面加载时获取国家列表
async function loadCountries() {
    try {
        const res = await fetch('/api/cities/countries');
        const data = await res.json();

        if (!data.success) {
            console.error('获取国家列表失败:', data.error);
            return;
        }

        const select = document.getElementById('country-select');
        // 保留默认选项
        select.innerHTML = '<option value="">不限制国家</option>';

        data.countries.forEach(country => {
            const option = document.createElement('option');
            option.value = country;
            option.textContent = country;
            select.appendChild(option);
        });

        console.log(`已加载 ${data.countries.length} 个国家`);
    } catch (error) {
        console.error('加载国家列表失败:', error);
    }
}
// 国家选择变化
async function onCountryChange(country) {
    const citySelect = document.getElementById('city-select');
    const latInput = document.getElementById('latitude');
    const lngInput = document.getElementById('longitude');
    const radiusInput = document.getElementById('radius');

    // 重置城市选择和坐标
    citySelect.innerHTML = '<option value="">请选择城市</option>';
    citySelect.disabled = !country;
    latInput.value = '';
    lngInput.value = '';
    radiusInput.value = '';

    if (!country) return;

    try {
        const res = await fetch(`/api/cities/${encodeURIComponent(country)}`);
        const data = await res.json();

        if (!data.success) {
            console.error('获取城市列表失败:', data.error);
            return;
        }

        data.cities.forEach(city => {
            const option = document.createElement('option');
            option.value = city.name;
            option.textContent = city.name;
            option.dataset.lat = city.lat;
            option.dataset.lng = city.lng;
            option.dataset.radius = city.radius;
            citySelect.appendChild(option);
        });

        console.log(`${country} - 已加载 ${data.cities.length} 个城市`);
    } catch (error) {
        console.error('加载城市列表失败:', error);
    }
}
// 城市选择变化
function onCityChange(cityName) {
    if (!cityName) {
        document.getElementById('latitude').value = '';
        document.getElementById('longitude').value = '';
        document.getElementById('radius').value = '';
        return;
    }

    const citySelect = document.getElementById('city-select');
    const selectedOption = citySelect.selectedOptions[0];

    // 填充坐标信息
    const lat = selectedOption.dataset.lat;
    const lng = selectedOption.dataset.lng;
    const radius = selectedOption.dataset.radius;

    document.getElementById('latitude').value = lat;
    document.getElementById('longitude').value = lng;
    document.getElementById('radius').value = radius;

    console.log(`已选择: ${cityName}, 坐标: (${lat}, ${lng}), 半径: ${radius}度`);
}
// 初始化:页面加载时调用
document.addEventListener('DOMContentLoaded', () => {
    loadCountries();

    // 绑定事件
    const countrySelect = document.getElementById('country-select');
    const citySelect = document.getElementById('city-select');

    if (countrySelect) {
        countrySelect.addEventListener('change', (e) => {
            onCountryChange(e.target.value);
        });
    }

    if (citySelect) {
        citySelect.addEventListener('change', (e) => {
            onCityChange(e.target.value);
        });
    }
});

// ===== 任务历史 =====
async function loadTaskHistory() {
    const data = await fetchAPI('/tasks?page=1&limit=50');
    const tbody = document.querySelector('#task-history-body');

    if (!data || !data.tasks || data.tasks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">暂无任务</td></tr>';
        return;
    }

    tbody.innerHTML = data.tasks.map(task => {
        const statusMap = {
            pending: ['等待中', '#f59e0b', '#fef3c7'],
            running: ['运行中', '#3b82f6', '#dbeafe'],
            completed: ['已完成', '#10b981', '#d1fae5'],
            failed: ['失败', '#ef4444', '#fee2e2']
        };
        const [statusName, statusColor, statusBg] = statusMap[task.status] || [task.status, '#6b7280', '#f3f4f6'];
        const successRate = task.totalLeads > 0 ? Math.round((task.successLeads / task.totalLeads) * 100) : 0;

        return `<tr style="background: white; transition: all 0.2s; border-bottom: 1px solid #e5e7eb;" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='white'">
            <td>
                <div style="font-weight: 600; color: #111827; margin-bottom: 4px;">${task.name}</div>
                <div style="font-size: 11px; color: #6b7280;">ID: ${task.id.substring(0, 8)}...</div>
            </td>
            <td>
                <span style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: linear-gradient(135deg, #667eea, #764ba2); border-radius: 8px; font-size: 12px; color: white; font-weight: 500;">
                    <svg width="12" height="12" fill="white" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8"/></svg>
                    ${task.source === 'google_maps' ? 'Google Maps' : task.source}
                </span>
            </td>
            <td>
                <span style="display: inline-block; padding: 6px 16px; border-radius: 20px; background: ${statusBg}; color: ${statusColor}; font-size: 12px; font-weight: 600; letter-spacing: 0.3px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    ${statusName}
                </span>
            </td>
            <td>
                <div style="min-width: 140px;">
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <div style="flex: 1; background: #e5e7eb; height: 10px; border-radius: 20px; overflow: hidden; box-shadow: inset 0 1px 2px rgba(0,0,0,0.1);">
                            <div style="width: ${task.progress || 0}%; height: 100%; background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); transition: width 0.3s; box-shadow: 0 0 10px rgba(102, 126, 234, 0.4);"></div>
                        </div>
                        <span style="color: #374151; font-size: 13px; font-weight: 600; min-width: 38px;">${task.progress || 0}%</span>
                    </div>
                </div>
            </td>
            <td>
                <div style="display: flex; flex-direction: column; gap: 6px; padding: 4px 0;">
                    <div style="font-size: 22px; font-weight: 700; color: #111827;">${task.totalLeads || 0}</div>
                    <div style="display: flex; gap: 14px; font-size: 11px; font-weight: 500;">
                        <span style="color: #10b981;">✓ ${task.successLeads || 0}</span>
                        <span style="color: #ef4444;">✗ ${task.failedLeads || 0}</span>
                        <span style="color: #6b7280; background: #f3f4f6; padding: 2px 6px; border-radius: 4px;">${successRate}%</span>
                    </div>
                </div>
            </td>
            <td style="color: #6b7280; font-size: 13px;">${formatDate(task.createdAt)}</td>
            <td>
                <button class="btn-secondary btn-sm" onclick="viewTaskDetail('${task.id}')" style="background: linear-gradient(135deg, #667eea, #764ba2); border: none; color: white; font-weight: 600; padding: 10px 18px; border-radius: 8px; box-shadow: 0 2px 8px rgba(102, 126, 234, 0.25); transition: all 0.2s; cursor: pointer;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(102, 126, 234, 0.35)'" onmouseout="this.style.transform=''; this.style.boxShadow='0 2px 8px rgba(102, 126, 234, 0.25)'">
                    查看详情
                </button>
            </td>
        </tr>`;
    }).join('');
}

async function viewTaskDetail(taskId) {
    const task = await fetchAPI(`/tasks/${taskId}`);
    if (!task) return;

    document.getElementById('task-detail-modal').style.display = 'block';
    document.getElementById('modal-task-name').textContent = task.name;

    const statusMap = {
        pending: ['等待中', '#f59e0b', '#fef3c7'],
        running: ['运行中', '#3b82f6', '#dbeafe'],
        completed: ['已完成', '#10b981', '#d1fae5'],
        failed: ['失败', '#ef4444', '#fee2e2']
    };
    const [statusName, statusColor, statusBg] = statusMap[task.status] || [task.status, '#6b7280', '#f3f4f6'];

    document.getElementById('task-detail-info').innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; padding: 24px; background: white; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #e5e7eb;">
            <div style="padding: 16px; background: linear-gradient(135deg, #f9fafb, #ffffff); border-radius: 12px; border: 1px solid #e5e7eb;">
                <div style="color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 10px; font-weight: 600;">任务ID</div>
                <div style="color: #111827; font-family: 'Courier New', monospace; font-size: 12px; word-break: break-all; line-height: 1.6;">${task.id}</div>
            </div>
            <div style="padding: 16px; background: linear-gradient(135deg, #f9fafb, #ffffff); border-radius: 12px; border: 1px solid #e5e7eb;">
                <div style="color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 10px; font-weight: 600;">关键词</div>
                <div style="color: #111827; font-size: 15px; font-weight: 700;">${task.query}</div>
            </div>
            <div style="padding: 16px; background: linear-gradient(135deg, #f9fafb, #ffffff); border-radius: 12px; border: 1px solid #e5e7eb;">
                <div style="color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 10px; font-weight: 600;">状态</div>
                <span style="display: inline-block; padding: 8px 16px; border-radius: 20px; background: ${statusBg}; color: ${statusColor}; font-size: 13px; font-weight: 700; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">${statusName}</span>
            </div>
            <div style="padding: 16px; background: linear-gradient(135deg, #ede9fe, #f3f0ff); border-radius: 12px; border: 1px solid #d8c4f8;">
                <div style="color: #7c3aed; font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 10px; font-weight: 600;">线索总数</div>
                <div style="color: #7c3aed; font-size: 32px; font-weight: 800;">${task.totalLeads || 0}</div>
            </div>
            <div style="padding: 16px; background: linear-gradient(135deg, #d1fae5, #dcfce7); border-radius: 12px; border: 1px solid #86efac;">
                <div style="color: #059669; font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 10px; font-weight: 600;">成功/失败</div>
                <div style="font-size: 18px; font-weight: 700;">
                    <span style="color: #10b981;">${task.successLeads || 0}</span> 
                    <span style="color: #9ca3af;">/</span> 
                    <span style="color: #ef4444;">${task.failedLeads || 0}</span>
                </div>
            </div>
            <div style="padding: 16px; background: linear-gradient(135deg, #f9fafb, #ffffff); border-radius: 12px; border: 1px solid #e5e7eb;">
                <div style="color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 10px; font-weight: 600;">创建时间</div>
                <div style="color: #374151; font-size: 13px; font-weight: 500;">${formatDate(task.createdAt)}</div>
            </div>
        </div>`;

    const leadsBody = document.getElementById('task-leads-body');
    if (!task.leads || task.leads.length === 0) {
        leadsBody.innerHTML = '<tr><td colspan="6" class="empty-state">该任务暂无线索</td></tr>';
        return;
    }

    leadsBody.innerHTML = task.leads.map((lead, index) => {
        const contacts = (lead.contacts || []).map(c => c.phone || c.email).filter(Boolean).join(', ') || '-';
        return `<tr style="background: white; transition: all 0.2s; border-bottom: 1px solid #f3f4f6;" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='white'">
            <td>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, #667eea, #764ba2); display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: 700; box-shadow: 0 2px 6px rgba(102, 126, 234, 0.3);">${index + 1}</div>
                    <strong style="color: #111827;">${lead.companyName}</strong>
                </div>
            </td>
            <td>${lead.website ? `<a href="${lead.website}" target="_blank" style="color: #667eea; text-decoration: none; font-weight: 500;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${lead.website.substring(0, 35)}...</a>` : '<span style="color: #9ca3af;">-</span>'}</td>
            <td style="color: #6b7280; font-weight: 500;">${lead.industry || '-'}</td>
            <td>${lead.rating ? `<span style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 6px 12px; border-radius: 10px; font-weight: 700; font-size: 13px; box-shadow: 0 2px 6px rgba(16, 185, 129, 0.3);">${lead.rating.toFixed(1)}</span>` : '<span style="color: #9ca3af;">-</span>'}</td>
            <td style="font-size: 12px; max-width: 200px; color: #6b7280;">${contacts}</td>
            <td>
                <span style="display: inline-block; padding: 6px 12px; border-radius: 12px; background: ${lead.ratingStatus === 'rated' ? '#d1fae5' : '#fef3c7'}; color: ${lead.ratingStatus === 'rated' ? '#059669' : '#d97706'}; font-size: 11px; font-weight: 700; border: 1px solid ${lead.ratingStatus === 'rated' ? '#86efac' : '#fcd34d'};">
                    ${lead.ratingStatus === 'pending' ? '⏳ 待评级' : '✓ 已评级'}
                </span>
            </td>
        </tr>`;
    }).join('');
}
function closeTaskDetail() { document.getElementById('task-detail-modal').style.display = 'none'; }
window.loadTaskHistory = loadTaskHistory;
window.viewTaskDetail = viewTaskDetail;
window.closeTaskDetail = closeTaskDetail;