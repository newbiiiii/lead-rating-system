// Rating Tasks页面逻辑模块
import { fetchAPI } from '../api.js';
import { formatDate, getSourceName } from '../utils.js';

let currentPage = 1;
let pageSize = 5;
let searchFilters = { status: '', query: '' };

export async function init() {
    // 加载评分任务列表
    await loadRatingTasks();
}

async function loadRatingTasks(page = 1) {
    currentPage = page;

    // 构建查询参数
    let queryParams = `page=${page}&limit=${pageSize}`;
    if (searchFilters.status) queryParams += `&status=${searchFilters.status}`;
    if (searchFilters.query) queryParams += `&query=${encodeURIComponent(searchFilters.query)}`;

    const data = await fetchAPI(`/api/tasks?${queryParams}`);
    const tbody = document.getElementById('rating-tasks-body');

    if (!data || !data.tasks || data.tasks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">暂无数据</td></tr>';
        updatePagination(0);
        return;
    }

    tbody.innerHTML = data.tasks.map(task => {
        const totalLeads = task.totalLeads || 0;
        const successLeads = task.successLeads || 0;
        const progress = totalLeads > 0 ? Math.round((successLeads / totalLeads) * 100) : task.progress || 0;

        // 使用searchPoints进度
        const sp = task.searchPointsStats;
        const spProgress = sp && sp.total > 0 ? Math.round(((sp.completed + sp.failed) / sp.total) * 100) : progress;
        const spText = sp && sp.total > 0 ? `#${sp.completed + sp.failed}/${sp.total}` : '';

        return `
            <tr>
                <td>${task.name || '-'}</td>
                <td>${task.query || '-'}</td>
                <td>${getSourceName(task.source)}</td>
                <td>${totalLeads}</td>
                <td>${successLeads}</td>
                <td>
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        ${spText ? `
                        <div style="display: flex; gap: 6px; align-items: center;">
                            <span style="display: inline-block; padding: 3px 8px; background: linear-gradient(135deg, #667eea, #764ba2); color: white; border-radius: 5px; font-size: 11px; font-weight: 700; font-family: 'Courier New', monospace;">
                                ${spText}
                            </span>
                        </div>
                        ` : ''}
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="flex: 1; background: #e2e8f0; border-radius: 4px; height: 8px; overflow: hidden;">
                                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); height: 100%; width: ${spProgress}%;"></div>
                            </div>
                            <span style="font-size: 12px; color: #64748b; min-width: 45px;">${spProgress}%</span>
                        </div>
                    </div>
                </td>
                <td>${formatDate(task.createdAt)}</td>
                <td>
                    <button class="btn-secondary btn-sm" onclick="viewRatingTaskDetail('${task.id}')">查看详情</button>
                </td>
            </tr>
        `;
    }).join('');

    // 更新分页
    updatePagination(data.total);
}

function updatePagination(total) {
    const totalPages = Math.ceil(total / pageSize);
    const paginationContainer = document.querySelector('#pagination-container-rating');

    if (!paginationContainer || totalPages <= 1) {
        if (paginationContainer) paginationContainer.innerHTML = '';
        return;
    }

    let paginationHTML = '<div style="display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 20px;">';

    // 上一页按钮
    paginationHTML += `
        <button onclick="loadRatingTasks(${currentPage - 1})" 
                ${currentPage === 1 ? 'disabled' : ''}
                style="padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; background: white; cursor: ${currentPage === 1 ? 'not-allowed' : 'pointer'}; color: ${currentPage === 1 ? '#9ca3af' : '#374151'};">
            上一页
        </button>
    `;

    // 页码按钮
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            paginationHTML += `
                <button onclick="loadRatingTasks(${i})" 
                        style="padding: 8px 12px; border: 1px solid ${i === currentPage ? '#667eea' : '#e5e7eb'}; border-radius: 6px; background: ${i === currentPage ? 'linear-gradient(135deg, #667eea, #764ba2)' : 'white'}; color: ${i === currentPage ? 'white' : '#374151'}; font-weight: ${i === currentPage ? '600' : '400'}; cursor: pointer;">
                    ${i}
                </button>
            `;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            paginationHTML += '<span style="padding: 8px;">...</span>';
        }
    }

    // 下一页按钮
    paginationHTML += `
        <button onclick="loadRatingTasks(${currentPage + 1})" 
                ${currentPage === totalPages ? 'disabled' : ''}
                style="padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; background: white; cursor: ${currentPage === totalPages ? 'not-allowed' : 'pointer'}; color: ${currentPage === totalPages ? '#9ca3af' : '#374151'};">
            下一页
        </button>
    `;

    paginationHTML += `<span style="margin-left: 16px; color: #6b7280; font-size: 14px;">共 ${total} 条，第 ${currentPage}/${totalPages} 页</span>`;
    paginationHTML += '</div>';

    paginationContainer.innerHTML = paginationHTML;
}

// 任务详情状态
let detailCurrentPage = 1;
let detailPageSize = 20;
let detailRatingFilter = '';

async function viewRatingTaskDetail(taskId, page = 1, size = 20, ratingStatus = '') {
    // 保存状态
    detailCurrentPage = page;
    detailPageSize = size;
    detailRatingFilter = ratingStatus;
    window.currentTaskId = taskId;

    // 构建查询参数
    let queryParams = `page=${page}&pageSize=${size}`;
    if (ratingStatus) {
        queryParams += `&ratingStatus=${ratingStatus}`;
    }

    const data = await fetchAPI(`/api/tasks/${taskId}?${queryParams}`);
    if (!data) return;

    const { task, leads, pagination, filters } = data;

    document.getElementById('task-detail-modal').style.display = 'block';
    document.getElementById('modal-task-name').textContent = task.name;

    const statusMap = {
        pending: ['等待中', '#f59e0b', '#fef3c7'],
        running: ['运行中', '#3b82f6', '#dbeafe'],
        completed: ['已完成', '#10b981', '#d1fae5'],
        failed: ['失败', '#ef4444', '#fee2e2'],
        cancelled: ['已终止', '#f97316', '#fed7aa']
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
                <div style="color: #7c3aed; font-size: 32px; font-weight: 800;">${pagination.total || 0}</div>
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
        </div>
        
        <!-- 筛选和分页控件 -->
        <div style="margin: 20px 0; display: flex; justify-content: space-between; align-items: center; padding: 16px; background: white; border-radius: 12px; border: 1px solid #e5e7eb;">
            <div style="display: flex; gap: 12px; align-items: center;">
                <label style="font-weight: 600; color: #374151;">评分状态:</label>
                <select id="detail-rating-filter" onchange="filterRatingTaskDetail()" style="padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; cursor: pointer;">
                    <option value="">全部</option>
                    <option value="pending" ${filters.ratingStatus === 'pending' ? 'selected' : ''}>待评分</option>
                    <option value="completed" ${filters.ratingStatus === 'completed' ? 'selected' : ''}>已评分</option>
                    <option value="failed" ${filters.ratingStatus === 'failed' ? 'selected' : ''}>评分失败</option>
                </select>
                <label style="font-weight: 600; color: #374151;">每页:</label>
                <select id="detail-pagesize-select" onchange="changeRatingDetailPageSize(this.value)" style="padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; cursor: pointer;">
                    <option value="10" ${size == 10 ? 'selected' : ''}>10</option>
                    <option value="20" ${size == 20 ? 'selected' : ''}>20</option>
                    <option value="50" ${size == 50 ? 'selected' : ''}>50</option>
                    <option value="100" ${size == 100 ? 'selected' : ''}>100</option>
                </select>
            </div>
            <div style="color: #6b7280; font-size: 14px;">
                共 ${pagination.total} 条，第 ${pagination.page}/${pagination.totalPages || 1} 页
            </div>
        </div>`;

    const leadsBody = document.getElementById('task-leads-body');
    if (!leads || leads.length === 0) {
        leadsBody.innerHTML = '<tr><td colspan="7" class="empty-state">暂无线索数据</td></tr>';
    } else {
        leadsBody.innerHTML = leads.map((lead, index) => {
            const globalIndex = (pagination.page - 1) * pagination.pageSize + index + 1;
            const ratingBadge = lead.ratingStatus === 'completed'
                ? '<span style="display: inline-block; padding: 6px 12px; border-radius: 12px; background: #d1fae5; color: #059669; font-size: 11px; font-weight: 700; border: 1px solid #86efac;">✓ 已评分</span>'
                : lead.ratingStatus === 'failed'
                    ? '<span style="display: inline-block; padding: 6px 12px; border-radius: 12px; background: #fee2e2; color: #dc2626; font-size: 11px; font-weight: 700; border: 1px solid #fca5a5;">✗ 失败</span>'
                    : '<span style="display: inline-block; padding: 6px 12px; border-radius: 12px; background: #fef3c7; color: #d97706; font-size: 11px; font-weight: 700; border: 1px solid #fcd34d;">⏳ 待评分</span>';

            return `<tr style="background: white; transition: all 0.2s; border-bottom: 1px solid #f3f4f6;" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='white'">
                <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, #667eea, #764ba2); display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: 700; box-shadow: 0 2px 6px rgba(102, 126, 234, 0.3);">${globalIndex}</div>
                        <strong style="color: #111827;">${lead.companyName}</strong>
                    </div>
                </td>
                <td>${lead.website ? `<a href="${lead.website}" target="_blank" style="color: #667eea; text-decoration: none; font-weight: 500;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${lead.website.substring(0, 35)}...</a>` : '<span style="color: #9ca3af;">-</span>'}</td>
                <td style="color: #6b7280; font-weight: 500;">${lead.industry || '-'}</td>
                <td>${lead.rating ? `<span style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 6px 12px; border-radius: 10px; font-weight: 700; font-size: 13px; box-shadow: 0 2px 6px rgba(16, 185, 129, 0.3);">${lead.rating.toFixed(1)}</span>` : '<span style="color: #9ca3af;">-</span>'}</td>
                <td>${ratingBadge}</td>
                <td>${lead.overallRating ? `<div style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; color: #374151; font-size: 13px;">${lead.overallRating}</div>` : '<span style="color: #9ca3af;">-</span>'}</td>
                <td>${lead.suggestion ? `<div style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; color: #6b7280; font-size: 12px;">${lead.suggestion}</div>` : '<span style="color: #9ca3af;">-</span>'}</td>
            </tr>`;
        }).join('');
    }

    // 添加分页控件
    updateRatingDetailPagination(pagination, taskId);
}

function updateRatingDetailPagination(pagination, taskId) {
    const paginationDiv = document.getElementById('detail-pagination');
    if (!paginationDiv) return;

    const { page, totalPages } = pagination;

    let html = '<div style="display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 20px;">';

    // 上一页
    html += `<button onclick="viewRatingTaskDetail('${taskId}', ${page - 1}, ${detailPageSize}, '${detailRatingFilter}')" 
                ${page === 1 ? 'disabled' : ''}
                style="padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; background: white; cursor: ${page === 1 ? 'not-allowed' : 'pointer'}; color: ${page === 1 ? '#9ca3af' : '#374151'};">
            上一页
        </button>`;

    // 页码
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
            html += `<button onclick="viewRatingTaskDetail('${taskId}', ${i}, ${detailPageSize}, '${detailRatingFilter}')" 
                        style="padding: 8px 12px; border: 1px solid ${i === page ? '#667eea' : '#e5e7eb'}; border-radius: 6px; background: ${i === page ? 'linear-gradient(135deg, #667eea, #764ba2)' : 'white'}; color: ${i === page ? 'white' : '#374151'}; font-weight: ${i === page ? '600' : '400'}; cursor: pointer;">
                    ${i}
                </button>`;
        } else if (i === page - 3 || i === page + 3) {
            html += '<span style="padding: 8px;">...</span>';
        }
    }

    // 下一页
    html += `<button onclick="viewRatingTaskDetail('${taskId}', ${page + 1}, ${detailPageSize}, '${detailRatingFilter}')" 
                ${page === totalPages ? 'disabled' : ''}
                style="padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; background: white; cursor: ${page === totalPages ? 'not-allowed' : 'pointer'}; color: ${page === totalPages ? '#9ca3af' : '#374151'};">
            下一页
        </button>`;

    html += '</div>';
    paginationDiv.innerHTML = html;
}

function filterRatingTaskDetail() {
    const filter = document.getElementById('detail-rating-filter').value;
    viewRatingTaskDetail(window.currentTaskId, 1, detailPageSize, filter);
}

function changeRatingDetailPageSize(newSize) {
    viewRatingTaskDetail(window.currentTaskId, 1, parseInt(newSize), detailRatingFilter);
}

function closeRatingTaskDetail() {
    document.getElementById('task-detail-modal').style.display = 'none';
}

function changePageSize(newSize) {
    pageSize = parseInt(newSize);
    currentPage = 1;
    loadRatingTasks(1);
}

function applyFilters() {
    const statusFilter = document.getElementById('status-filter-rating')?.value || '';
    const queryFilter = document.getElementById('query-filter-rating')?.value || '';

    searchFilters = {
        status: statusFilter,
        query: queryFilter
    };

    currentPage = 1;
    loadRatingTasks(1);
}

function resetFilters() {
    searchFilters = { status: '', query: '' };
    const statusEl = document.getElementById('status-filter-rating');
    const queryEl = document.getElementById('query-filter-rating');
    if (statusEl) statusEl.value = '';
    if (queryEl) queryEl.value = '';
    currentPage = 1;
    loadRatingTasks(1);
}

// 导出给HTML调用
window.loadRatingTasks = loadRatingTasks;
window.viewRatingTaskDetail = viewRatingTaskDetail;
window.closeTaskDetail = closeRatingTaskDetail;
window.changePageSizeRating = changePageSize;
window.applyFiltersRating = applyFilters;
window.resetFiltersRating = resetFilters;
window.filterRatingTaskDetail = filterRatingTaskDetail;
window.changeRatingDetailPageSize = changeRatingDetailPageSize;

