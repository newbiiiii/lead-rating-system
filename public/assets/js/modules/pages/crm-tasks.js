// CRM Tasks页面逻辑模块
import { fetchAPI } from '../api.js';
import { formatDate, getSourceName } from '../utils.js';

let currentPage = 1;
let pageSize = 10;

export async function init() {
    await loadCrmTasks();
}

async function loadCrmTasks(page = 1) {
    currentPage = page;

    const data = await fetchAPI(`/api/crm/tasks?page=${page}&pageSize=${pageSize}`);
    const tbody = document.getElementById('crm-tasks-body');

    if (!data || !data.tasks || data.tasks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">暂无数据</td></tr>';
        updatePagination(0);
        return;
    }

    tbody.innerHTML = data.tasks.map(task => {
        const pending = parseInt(task.pendingCount) || 0;
        const synced = parseInt(task.syncedCount) || 0;
        const failed = parseInt(task.failedCount) || 0;
        const total = pending + synced + failed;
        const progress = total > 0 ? Math.round((synced / total) * 100) : 0;

        return `
            <tr>
                <td><strong>${task.name || '-'}</strong></td>
                <td>${getSourceName(task.source)}</td>
                <td>${total}</td>
                <td>
                    <span class="sync-stat pending" onclick="viewCrmLeads('pending', '${task.id}')" style="cursor: pointer;">
                        ${pending}
                    </span>
                </td>
                <td>
                    <span class="sync-stat synced" onclick="viewCrmLeads('synced', '${task.id}')" style="cursor: pointer;">
                        ${synced}
                    </span>
                </td>
                <td>
                    <span class="sync-stat failed" onclick="viewCrmLeads('failed', '${task.id}')" style="cursor: pointer;">
                        ${failed}
                    </span>
                </td>
                <td>
                    <div class="progress-bar-container">
                        <div class="progress-bar">
                            <div class="progress-bar-fill" style="width: ${progress}%;"></div>
                        </div>
                        <span class="progress-text">${progress}%</span>
                    </div>
                </td>
                <td>${formatDate(task.createdAt)}</td>
            </tr>
        `;
    }).join('');

    updatePagination(data.pagination.total);
}

function updatePagination(total) {
    const totalPages = Math.ceil(total / pageSize);
    const paginationContainer = document.querySelector('#pagination-container-crm');

    if (!paginationContainer || totalPages <= 1) {
        if (paginationContainer) paginationContainer.innerHTML = '';
        return;
    }

    let paginationHTML = '<div style="display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 20px;">';

    paginationHTML += `
        <button onclick="loadCrmTasks(${currentPage - 1})" 
                ${currentPage === 1 ? 'disabled' : ''}
                style="padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; background: white; cursor: ${currentPage === 1 ? 'not-allowed' : 'pointer'}; color: ${currentPage === 1 ? '#9ca3af' : '#374151'};">
            上一页
        </button>
    `;

    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            paginationHTML += `
                <button onclick="loadCrmTasks(${i})" 
                        style="padding: 8px 12px; border: 1px solid ${i === currentPage ? '#10b981' : '#e5e7eb'}; border-radius: 6px; background: ${i === currentPage ? 'linear-gradient(135deg, #10b981, #059669)' : 'white'}; color: ${i === currentPage ? 'white' : '#374151'}; font-weight: ${i === currentPage ? '600' : '400'}; cursor: pointer;">
                    ${i}
                </button>
            `;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            paginationHTML += '<span style="padding: 8px;">...</span>';
        }
    }

    paginationHTML += `
        <button onclick="loadCrmTasks(${currentPage + 1})" 
                ${currentPage === totalPages ? 'disabled' : ''}
                style="padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; background: white; cursor: ${currentPage === totalPages ? 'not-allowed' : 'pointer'}; color: ${currentPage === totalPages ? '#9ca3af' : '#374151'};">
            下一页
        </button>
    `;

    paginationHTML += `<span style="margin-left: 16px; color: #6b7280; font-size: 14px;">共 ${total} 条，第 ${currentPage}/${totalPages} 页</span>`;
    paginationHTML += '</div>';

    paginationContainer.innerHTML = paginationHTML;
}

function changePageSize(newSize) {
    pageSize = parseInt(newSize);
    currentPage = 1;
    loadCrmTasks(1);
}

function viewCrmLeads(status, taskId) {
    // 跳转到CRM状态页面
    window.location.hash = `#crm-leads?status=${status}&taskId=${taskId}`;
}

// 导出给HTML调用
window.loadCrmTasks = loadCrmTasks;
window.viewCrmLeads = viewCrmLeads;
window.changePageSizeCrm = changePageSize;
