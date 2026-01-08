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

async function viewRatingTaskDetail(taskId) {
    const task = await fetchAPI(`/api/tasks/${taskId}`);
    if (!task) return;

    // 复用任务详情弹窗
    if (window.viewTaskDetail) {
        window.viewTaskDetail(taskId);
    }
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
window.changePageSizeRating = changePageSize;
window.applyFiltersRating = applyFilters;
window.resetFiltersRating = resetFilters;
