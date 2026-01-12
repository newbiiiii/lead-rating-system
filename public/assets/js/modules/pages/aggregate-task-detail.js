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

    // 显示ID
    const idDisplay = document.getElementById('task-id-display');
    if (idDisplay) idDisplay.textContent = `ID: ${currentTaskId}`;

    await loadTaskDetail();
}

// 加载任务详情
async function loadTaskDetail() {
    // 添加时间戳避免浏览器缓存
    const timestamp = Date.now();
    const data = await fetchAPI(`/api/aggregate-tasks/${currentTaskId}?page=${currentPage}&pageSize=${pageSize}&_t=${timestamp}`);

    if (!data) {
        document.getElementById('task-overview').innerHTML = '<div class="empty-hint">加载失败</div>';
        return;
    }

    // 更新子任务计数
    const countBadge = document.getElementById('subtask-count');
    if (countBadge) countBadge.textContent = data.aggregateTask.totalSubTasks || 0;

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
            <div class="overview-meta">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                ${formatDate(task.createdAt)}
            </div>
        </div>
        
        <div class="overview-card card-progress">
            <h4>总进度</h4>
            <div class="overview-value">${completedPercent}%</div>
            <div class="progress-bar">
                <div class="progress-fill ${stats.completed === task.totalSubTasks ? 'completed' : ''}" 
                     style="width: ${completedPercent}%"></div>
            </div>
            <div class="overview-meta">共 ${task.totalSubTasks || 0} 个子任务</div>
        </div>

        <div class="overview-card card-stats">
            <h4>执行统计</h4>
            <div class="overview-value" style="font-size: 1.5rem; display: flex; gap: 1rem; align-items: baseline;">
                <span style="color: #10b981;" title="成功">${stats.completed}</span>
                <span style="color: #ef4444;" title="失败">${stats.failed}</span>
                <span style="color: #f59e0b;" title="运行中">${stats.running}</span>
            </div>
            <div class="overview-meta">成功 / 失败 / 运行中</div>
        </div>

        <div class="overview-card">
            <h4>线索发现</h4>
            <div class="overview-value" style="color: #4f46e5;">${stats.successLeads || 0}</div>
            <div class="overview-meta">总发现: ${stats.totalLeads || 0}</div>
        </div>

        <div class="overview-card card-keywords">
            <h4>搜索关键词 (${keywords.length})</h4>
            <div class="keywords-list">
                ${keywords.slice(0, 15).map(kw => `<span class="keyword-badge">${kw}</span>`).join('')}
                ${keywords.length > 15 ? `<span class="keyword-badge" style="background: transparent; border: 1px dashed #cbd5e1; color: #64748b;">+${keywords.length - 15} 更多</span>` : ''}
            </div>
        </div>

        <div class="overview-card card-keywords" style="grid-column: span 2;">
            <h4>目标地区</h4>
            <div class="keywords-list">
                 ${countries.map(c => `<span class="keyword-badge" style="background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0;">${c}</span>`).join('')}
            </div>
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
                    <th style="width: 35%">任务信息</th>
                    <th style="width: 15%">状态</th>
                    <th style="width: 20%">进度</th>
                    <th style="width: 15%">线索数 (有效/总数)</th>
                    <th style="width: 15%">操作</th>
                </tr>
            </thead>
            <tbody>
                ${subTasks.map(task => `
                    <tr>
                        <td class="task-name-cell">
                            <span class="task-name" title="${task.name}">${task.name}</span>
                            <span class="task-query">
                                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="margin-right: 2px;">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                                </svg>
                                ${task.query}
                            </span>
                        </td>
                        <td>${getStatusBadge(task.status)}</td>
                        <td>
                            <div class="progress-container">
                                <div class="progress-bar">
                                    <div class="progress-fill ${task.status === 'completed' ? 'completed' : task.status === 'failed' ? 'failed' : ''}" 
                                         style="width: ${task.progress || 0}%"></div>
                                </div>
                                <span class="progress-text">${task.progress || 0}%</span>
                            </div>
                        </td>
                        <td>
                            <div style="font-weight: 600; color: #1e293b;">${task.successLeads || 0} <span style="color: #cbd5e1; font-weight: 400;">/ ${task.totalLeads || 0}</span></div>
                        </td>
                        <td>
                             <a href="#leads?taskId=${task.id}" class="btn-secondary btn-sm" style="display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.75rem; padding: 0.25rem 0.5rem;">
                                查看线索
                            </a>
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
window.goToPage = function (page) {
    currentPage = page;
    loadTaskDetail();
};

// 刷新详情
window.refreshDetail = async function () {
    await loadTaskDetail();
    showNotification('已刷新', 'success');
};

// 终止任务
window.terminateTask = async function () {
    if (!confirm('确定要终止此聚合任务及其所有子任务吗？此操作不可恢复。')) return;

    const result = await postAPI(`/api/aggregate-tasks/${currentTaskId}/terminate`);
    if (result && result.success) {
        showNotification('聚合任务已终止', 'success');
        await loadTaskDetail();
    }
};

// 筛选子任务
window.filterSubTasks = async function () {
    // 这个功能需要后端支持status筛选，目前先重新加载
    currentPage = 1;
    await loadTaskDetail();
};
