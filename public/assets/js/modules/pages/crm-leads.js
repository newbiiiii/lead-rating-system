// CRM Leads页面逻辑模块
import { fetchAPI } from '../api.js';
import { formatDate, showNotification, getSourceName } from '../utils.js';

let currentPage = 1;
let pageSize = 20;
let currentStatus = 'pending';
let currentTaskId = null;

const STATUS_HINTS = {
    'pending': '以下是等待同步到CRM的线索。系统会自动处理同步队列。',
    'synced': '以下是已成功同步到CRM的线索。',
    'failed': '以下是同步失败的线索。您可以点击"重新同步"进行重试。'
};

const STATUS_NAMES = {
    'pending': '待同步',
    'synced': '已同步',
    'failed': '同步失败'
};

// HTML转义函数防止XSS
function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export async function init() {
    // 解析URL参数
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.split('?')[1] || '');
    currentStatus = params.get('status') || 'pending';
    currentTaskId = params.get('taskId') || null;

    // 更新UI
    updateStatusTabs();
    updateHintBox();
    updateRetryButton();

    await loadCrmLeads();
}

function updateStatusTabs() {
    document.querySelectorAll('.status-tab').forEach(tab => {
        if (tab.dataset.status === currentStatus) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
}

function updateHintBox() {
    const hintBox = document.getElementById('crm-status-hint-box');
    const hintText = document.getElementById('crm-status-hint-text');
    const title = document.getElementById('crm-status-page-title');

    if (hintText) hintText.textContent = STATUS_HINTS[currentStatus];
    if (title) title.textContent = `CRM 同步 - ${STATUS_NAMES[currentStatus]}`;

    // 根据状态设置提示框颜色
    if (hintBox) {
        if (currentStatus === 'failed') {
            hintBox.style.background = '#fee2e2';
            hintBox.style.borderColor = '#fca5a5';
            hintBox.querySelector('p').style.color = '#991b1b';
        } else if (currentStatus === 'synced') {
            hintBox.style.background = '#d1fae5';
            hintBox.style.borderColor = '#6ee7b7';
            hintBox.querySelector('p').style.color = '#065f46';
        } else {
            hintBox.style.background = '#fef3c7';
            hintBox.style.borderColor = '#fcd34d';
            hintBox.querySelector('p').style.color = '#92400e';
        }
    }
}

function updateRetryButton() {
    const retryBtn = document.getElementById('retry-all-btn');
    if (retryBtn) {
        retryBtn.style.display = currentStatus === 'failed' ? 'block' : 'none';
    }
}

async function loadCrmLeads(page = 1) {
    currentPage = page;
    const tbody = document.getElementById('crm-leads-body');

    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" class="loading">加载中...</td></tr>';

    let url = `/api/crm/leads?status=${currentStatus}&page=${page}&pageSize=${pageSize}`;
    if (currentTaskId) {
        url += `&taskId=${currentTaskId}`;
    }

    const data = await fetchAPI(url);

    if (!data || !data.leads || data.leads.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">暂无数据</td></tr>';
        updatePagination(0, 0);
        return;
    }

    tbody.innerHTML = data.leads.map(lead => `
        <tr>
            <td><strong>${lead.companyName}</strong></td>
            <td>${lead.website ? `<a href="${lead.website}" target="_blank">${lead.domain || '链接'}</a>` : '-'}</td>
            <td>${lead.contactName || '-'}<br><small style="color: #6b7280;">${lead.contactEmail || ''}</small></td>
            <td>${lead.taskName || '-'}</td>
            <td>${getSourceName(lead.source)}</td>
            <td>
                <span class="crm-status-badge ${lead.crmSyncStatus}">${STATUS_NAMES[lead.crmSyncStatus] || lead.crmSyncStatus}</span>
                ${lead.crmSyncError ? `<div class="sync-error-msg" title="${escapeHtml(lead.crmSyncError)}">
                    <small style="color: #dc2626; display: block; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${escapeHtml(lead.crmSyncError)}
                    </small>
                </div>` : ''}
            </td>
            <td>${formatDate(lead.createdAt)}</td>
            <td>
                ${currentStatus === 'failed' ? `
                    <button class="btn-secondary btn-sm" onclick="retrySingleCrm('${lead.id}')">
                        重新同步
                    </button>
                ` : '-'}
            </td>
        </tr>
    `).join('');

    updatePagination(data.pagination.total, data.pagination.totalPages);
}

function updatePagination(total, totalPages) {
    const pagination = document.getElementById('crm-leads-pagination');
    if (!pagination) return;

    if (totalPages <= 1) {
        pagination.innerHTML = total > 0 ? `<div style="text-align: center; color: #6b7280; margin-top: 16px;">共 ${total} 条</div>` : '';
        return;
    }

    let html = '<div style="display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 20px;">';

    if (currentPage > 1) {
        html += `<button class="btn-secondary btn-sm" onclick="goToCrmPage(${currentPage - 1})">上一页</button>`;
    }

    html += `<span style="color: #6b7280;">第 ${currentPage} / ${totalPages} 页，共 ${total} 条</span>`;

    if (currentPage < totalPages) {
        html += `<button class="btn-secondary btn-sm" onclick="goToCrmPage(${currentPage + 1})">下一页</button>`;
    }

    html += '</div>';
    pagination.innerHTML = html;
}

function switchCrmStatus(status) {
    currentStatus = status;
    currentTaskId = null; // 清除任务筛选
    currentPage = 1;

    updateStatusTabs();
    updateHintBox();
    updateRetryButton();

    // 更新URL但不刷新页面
    window.location.hash = `#crm-leads?status=${status}`;

    loadCrmLeads();
}

async function retryAllCrm() {
    if (!confirm('确定要重新同步所有失败的线索吗？')) return;

    const result = await fetchAPI('/api/crm/leads/retry', {
        method: 'POST',
        body: JSON.stringify({})
    });

    if (result && result.success) {
        showNotification(`已将 ${result.count} 条线索加入同步队列`, 'success');
        await loadCrmLeads();
    } else {
        showNotification(result?.error || '操作失败', 'error');
    }
}

async function retrySingleCrm(leadId) {
    const result = await fetchAPI('/api/crm/leads/retry', {
        method: 'POST',
        body: JSON.stringify({ leadIds: [leadId] })
    });

    if (result && result.success) {
        showNotification('已加入同步队列', 'success');
        await loadCrmLeads(currentPage);
    } else {
        showNotification(result?.error || '操作失败', 'error');
    }
}

function goToCrmPage(page) {
    loadCrmLeads(page);
}

function refreshCrmLeads() {
    loadCrmLeads(currentPage);
}

// 导出给HTML调用
window.loadCrmLeads = loadCrmLeads;
window.switchCrmStatus = switchCrmStatus;
window.retryAllCrm = retryAllCrm;
window.retrySingleCrm = retrySingleCrm;
window.goToCrmPage = goToCrmPage;
window.refreshCrmLeads = refreshCrmLeads;
