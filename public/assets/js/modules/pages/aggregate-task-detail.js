// 聚合任务详情页面逻辑模块
import { fetchAPI, postAPI } from '../api.js';
import { showNotification, formatDate, getStatusBadge } from '../utils.js';

let currentTaskId = null;
let currentPage = 1;
const pageSize = 20;

export async function init() {
    // 从URL获取任务ID
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.split('?')[1] || '');
    currentTaskId = params.get('id');

    if (!currentTaskId) {
        document.getElementById('task-overview').innerHTML = '<div class="empty-hint">任务ID无效</div>';
        return;
    }

    await loadTaskDetail();
}

// 加载任务详情
async function loadTaskDetail() {
    const data = await fetchAPI(`/api/aggregate-tasks/${currentTaskId}?page=${currentPage}&pageSize=${pageSize}`);

    if (!data) {
        document.getElementById('task-overview').innerHTML = '<div class="empty-hint">加载失败</div>';
        return;
    }

    renderOverview(data);
    renderSubTasks(data.subTasks, data.pagination);

    // 显示终止按钮（如果任务还在运行）
    const terminateBtn = document.getElementById('terminate-btn');
    if (data.aggregateTask.status === 'running' || data.aggregateTask.status === 'pending') {
        terminateBtn.style.display = '';
    } else {
        terminateBtn.style.display = 'none';
    }
}

// 渲染任务概览
function renderOverview(data) {
    const task = data.aggregateTask;
    const stats = data.stats;

    document.getElementById('aggregate-task-title').textContent = task.name;

    const keywords = Array.isArray(task.keywords) ? task.keywords : [];
    const countries = Array.isArray(task.countries) ? task.countries : [];

    // 计算进度
    const completedPercent = task.totalSubTasks > 0
        ? Math.round((stats.completed / task.totalSubTasks) * 100)
        : 0;

    document.getElementById('task-overview').innerHTML = `
        <div class="overview-card">
            <h4>任务状态</h4>
            <div class="overview-value">${getStatusBadge(task.status)}</div>
            <div class="overview-meta">创建于: ${formatDate(task.createdAt)}</div>
        </div>
        <div class="overview-card">
            <h4>总进度</h4>
            <div class="overview-value">${completedPercent}%</div>
            <div class="progress-bar" style="margin-top: 0.5rem;">
                <div class="progress-fill ${stats.completed === task.totalSubTasks ? 'completed' : ''}" 
                     style="width: ${completedPercent}%"></div>
            </div>
        </div>
        <div class="overview-card">
            <h4>子任务统计</h4>
            <div class="overview-value">${task.totalSubTasks || 0}</div>
            <div class="overview-meta">
                <span style="color: var(--success);">完成: ${stats.completed}</span> | 
                <span style="color: var(--warning);">运行: ${stats.running}</span> | 
                <span style="color: var(--danger);">失败: ${stats.failed}</span>
            </div>
        </div>
        <div class="overview-card">
            <h4>线索统计</h4>
            <div class="overview-value success">${stats.successLeads || 0}</div>
            <div class="overview-meta">总发现: ${stats.totalLeads || 0}</div>
        </div>
        <div class="overview-card" style="grid-column: span 2;">
            <h4>搜索关键词 (${keywords.length})</h4>
            <div class="keywords-list">
                ${keywords.slice(0, 10).map(kw => `<span class="keyword-badge">${kw}</span>`).join('')}
                ${keywords.length > 10 ? `<span class="keyword-badge">+${keywords.length - 10} 更多</span>` : ''}
            </div>
        </div>
        <div class="overview-card">
            <h4>目标国家</h4>
            <div class="countries-list">${countries.join(', ') || '-'}</div>
        </div>
    `;
}

// 渲染子任务列表
function renderSubTasks(subTasks, pagination) {
    const container = document.getElementById('sub-tasks-container');

    if (!subTasks || subTasks.length === 0) {
        container.innerHTML = '<div class="empty-hint">暂无子任务</div>';
        document.getElementById('pagination-container').innerHTML = '';
        return;
    }

    container.innerHTML = `
        <table class="sub-tasks-table">
            <thead>
                <tr>
                    <th>任务名称</th>
                    <th>状态</th>
                    <th>进度</th>
                    <th>线索数</th>
                    <th>创建时间</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>
                ${subTasks.map(task => `
                    <tr>
                        <td class="task-name-cell">
                            <span class="task-name" title="${task.name}">${task.name}</span>
                            <span class="task-query">${task.query}</span>
                        </td>
                        <td>${getStatusBadge(task.status)}</td>
                        <td>
                            <div class="progress-bar">
                                <div class="progress-fill ${task.status === 'completed' ? 'completed' : task.status === 'failed' ? 'failed' : ''}" 
                                     style="width: ${task.progress || 0}%"></div>
                            </div>
                            <span style="font-size: 0.75rem; color: var(--text-muted);">${task.progress || 0}%</span>
                        </td>
                        <td>
                            <span style="color: var(--success);">${task.successLeads || 0}</span>
                            <span style="color: var(--text-muted);">/ ${task.totalLeads || 0}</span>
                        </td>
                        <td style="font-size: 0.875rem; color: var(--text-muted);">${formatDate(task.createdAt)}</td>
                        <td>
                            <a href="#management?taskId=${task.id}" class="btn-text" style="font-size: 0.75rem;">查看</a>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    // 渲染分页
    renderPagination(pagination);
}

// 渲染分页
function renderPagination(pagination) {
    const container = document.getElementById('pagination-container');

    if (pagination.totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '';

    // 上一页
    html += `<button class="pagination-btn" ${pagination.page <= 1 ? 'disabled' : ''} 
             onclick="goToPage(${pagination.page - 1})">上一页</button>`;

    // 页码
    const startPage = Math.max(1, pagination.page - 2);
    const endPage = Math.min(pagination.totalPages, pagination.page + 2);

    if (startPage > 1) {
        html += `<button class="pagination-btn" onclick="goToPage(1)">1</button>`;
        if (startPage > 2) {
            html += `<span style="padding: 0.5rem;">...</span>`;
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="pagination-btn ${i === pagination.page ? 'active' : ''}" 
                 onclick="goToPage(${i})">${i}</button>`;
    }

    if (endPage < pagination.totalPages) {
        if (endPage < pagination.totalPages - 1) {
            html += `<span style="padding: 0.5rem;">...</span>`;
        }
        html += `<button class="pagination-btn" onclick="goToPage(${pagination.totalPages})">${pagination.totalPages}</button>`;
    }

    // 下一页
    html += `<button class="pagination-btn" ${pagination.page >= pagination.totalPages ? 'disabled' : ''} 
             onclick="goToPage(${pagination.page + 1})">下一页</button>`;

    container.innerHTML = html;
}

// 跳转页面
window.goToPage = function(page) {
    currentPage = page;
    loadTaskDetail();
};

// 刷新详情
window.refreshDetail = async function() {
    await loadTaskDetail();
    showNotification('已刷新', 'success');
};

// 终止任务
window.terminateTask = async function() {
    if (!confirm('确定要终止此聚合任务及其所有子任务吗？此操作不可恢复。')) return;

    const result = await postAPI(`/api/aggregate-tasks/${currentTaskId}/terminate`);
    if (result && result.success) {
        showNotification('聚合任务已终止', 'success');
        await loadTaskDetail();
    }
};

// 筛选子任务
window.filterSubTasks = async function() {
    // 这个功能需要后端支持status筛选，目前先重新加载
    currentPage = 1;
    await loadTaskDetail();
};
