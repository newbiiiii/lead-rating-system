// CRM Tasks页面逻辑模块
import { fetchAPI } from '../api.js';
import { formatDate, getSourceName, showNotification } from '../utils.js';

let currentPage = 1;
let pageSize = 10;

// 弹窗相关状态
let modalCurrentPage = 1;
let modalPageSize = 20;
let modalCurrentStatus = 'all';
let modalCurrentTaskId = null;
let modalTaskName = '';

export async function init() {
    await loadCrmTasks();
}

async function loadCrmTasks(page = 1) {
    currentPage = page;

    const data = await fetchAPI(`/api/crm/tasks?page=${page}&pageSize=${pageSize}`);
    const tbody = document.getElementById('crm-tasks-body');

    if (!data || !data.tasks || data.tasks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state">暂无数据</td></tr>';
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
                <td>
                    <button class="btn-view-detail" onclick="openTaskDetailModal('${task.id}', '${escapeHtml(task.name || '任务详情')}', ${pending}, ${synced}, ${failed})">
                        查看详情
                    </button>
                </td>
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

// ============ 弹窗相关功能 ============

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function openTaskDetailModal(taskId, taskName, pending, synced, failed) {
    modalCurrentTaskId = taskId;
    modalTaskName = taskName;
    modalCurrentStatus = 'all';
    modalCurrentPage = 1;

    // 显示弹窗
    document.getElementById('task-detail-modal').style.display = 'flex';
    document.getElementById('modal-task-name').textContent = taskName;

    // 显示统计信息
    const total = pending + synced + failed;
    document.getElementById('modal-task-stats').innerHTML = `
        <div><strong>总线索:</strong> ${total}</div>
        <div><span class="sync-stat pending">${pending} 待同步</span></div>
        <div><span class="sync-stat synced">${synced} 已同步</span></div>
        <div><span class="sync-stat failed">${failed} 失败</span></div>
    `;

    // 重置筛选按钮状态
    document.querySelectorAll('.modal-filter-bar .filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.status === 'all') btn.classList.add('active');
    });

    // 加载线索列表
    await loadModalLeads();
}

function closeTaskDetailModal() {
    document.getElementById('task-detail-modal').style.display = 'none';
    modalCurrentTaskId = null;
}

async function filterModalLeads(status) {
    modalCurrentStatus = status;
    modalCurrentPage = 1;

    // 更新按钮状态
    document.querySelectorAll('.modal-filter-bar .filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.status === status) btn.classList.add('active');
    });

    await loadModalLeads();
}

async function loadModalLeads(page = 1) {
    modalCurrentPage = page;
    const tbody = document.getElementById('modal-leads-body');
    tbody.innerHTML = '<tr><td colspan="5" class="loading">加载中...</td></tr>';

    // 构建API URL
    let url;
    if (modalCurrentStatus === 'all') {
        // 分别请求三种状态并合并
        const [pendingData, syncedData, failedData] = await Promise.all([
            fetchAPI(`/api/crm/leads?taskId=${modalCurrentTaskId}&status=pending&pageSize=100`),
            fetchAPI(`/api/crm/leads?taskId=${modalCurrentTaskId}&status=synced&pageSize=100`),
            fetchAPI(`/api/crm/leads?taskId=${modalCurrentTaskId}&status=failed&pageSize=100`)
        ]);

        const allLeads = [
            ...(pendingData?.leads || []),
            ...(syncedData?.leads || []),
            ...(failedData?.leads || [])
        ];

        renderModalLeads(allLeads);
        return;
    } else {
        url = `/api/crm/leads?taskId=${modalCurrentTaskId}&status=${modalCurrentStatus}&page=${page}&pageSize=${modalPageSize}`;
    }

    const data = await fetchAPI(url);

    if (!data || !data.leads || data.leads.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">暂无数据</td></tr>';
        document.getElementById('modal-pagination').innerHTML = '';
        return;
    }

    renderModalLeads(data.leads);
    updateModalPagination(data.pagination?.total || data.leads.length, data.pagination?.totalPages || 1);
}

function renderModalLeads(leads) {
    const tbody = document.getElementById('modal-leads-body');

    if (!leads || leads.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">暂无数据</td></tr>';
        return;
    }

    tbody.innerHTML = leads.map(lead => {
        const statusBadge = {
            'pending': '<span class="sync-stat pending">待同步</span>',
            'synced': '<span class="sync-stat synced">已同步</span>',
            'failed': '<span class="sync-stat failed">失败</span>'
        }[lead.crmSyncStatus] || '-';

        return `
            <tr>
                <td><strong>${lead.companyName || '-'}</strong></td>
                <td>${lead.contactName || '-'}</td>
                <td>${lead.contactEmail || '-'}</td>
                <td>${statusBadge}</td>
                <td>
                    ${lead.crmSyncError ? `<span class="error-text" title="${escapeHtml(lead.crmSyncError)}">${escapeHtml(lead.crmSyncError)}</span>` : '-'}
                </td>
            </tr>
        `;
    }).join('');
}

function updateModalPagination(total, totalPages) {
    const pagination = document.getElementById('modal-pagination');
    if (!pagination || totalPages <= 1) {
        if (pagination) pagination.innerHTML = `<div style="text-align: center; color: #6b7280; margin-top: 12px;">共 ${total} 条</div>`;
        return;
    }

    let html = '<div style="display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 12px;">';

    if (modalCurrentPage > 1) {
        html += `<button class="btn-secondary btn-sm" onclick="loadModalLeads(${modalCurrentPage - 1})">上一页</button>`;
    }

    html += `<span style="color: #6b7280;">第 ${modalCurrentPage}/${totalPages} 页，共 ${total} 条</span>`;

    if (modalCurrentPage < totalPages) {
        html += `<button class="btn-secondary btn-sm" onclick="loadModalLeads(${modalCurrentPage + 1})">下一页</button>`;
    }

    html += '</div>';
    pagination.innerHTML = html;
}

// 导出给HTML调用
window.loadCrmTasks = loadCrmTasks;
window.viewCrmLeads = viewCrmLeads;
window.changePageSizeCrm = changePageSize;
window.openTaskDetailModal = openTaskDetailModal;
window.closeTaskDetailModal = closeTaskDetailModal;
window.filterModalLeads = filterModalLeads;
window.loadModalLeads = loadModalLeads;
