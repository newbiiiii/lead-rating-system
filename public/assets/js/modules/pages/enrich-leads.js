// Enrich Leads 页面逻辑模块
import { fetchAPI, postAPI } from '../api.js';
import { formatDate, showNotification, getSourceName } from '../utils.js';

let currentPage = 1;
let pageSize = 20;
let currentStatus = 'pending';
let currentTaskId = null;

const STATUS_HINTS = {
    'pending': '以下是等待进行补充联系人的线索（仅显示 A/B 级）。系统会自动调用 Apollo 接口补充联系人信息。',
    'enriched': '以下是已完成补充联系人的线索，已获取联系人信息。',
    'failed': '以下是补充联系人失败的线索。您可以点击"重新补充"进行重试。'
};

const STATUS_NAMES = {
    'pending': '待补充',
    'enriched': '已补充',
    'failed': '补充失败',
    'skipped': '已跳过'
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

    // 加载统计和数据
    await Promise.all([
        loadEnrichStats(),
        loadEnrichLeads()
    ]);
}

async function loadEnrichStats() {
    const data = await fetchAPI('/api/enrich/stats');
    if (data && data.stats) {
        document.getElementById('stat-pending').textContent = data.stats.pending || 0;
        document.getElementById('stat-enriched').textContent = data.stats.enriched || 0;
        document.getElementById('stat-failed').textContent = data.stats.failed || 0;
    }
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
    const hintBox = document.getElementById('enrich-status-hint-box');
    const hintText = document.getElementById('enrich-status-hint-text');
    const title = document.getElementById('enrich-status-page-title');

    if (hintText) hintText.textContent = STATUS_HINTS[currentStatus] || '';
    if (title) title.textContent = `补充联系人 - ${STATUS_NAMES[currentStatus]}`;

    // 根据状态设置提示框颜色
    if (hintBox) {
        if (currentStatus === 'failed') {
            hintBox.style.background = '#fee2e2';
            hintBox.style.borderColor = '#fca5a5';
            hintBox.querySelector('p').style.color = '#991b1b';
        } else if (currentStatus === 'enriched') {
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

async function loadEnrichLeads(page = 1) {
    currentPage = page;
    const tbody = document.getElementById('enrich-leads-body');

    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" class="loading">加载中...</td></tr>';

    let url = `/api/enrich/leads?status=${currentStatus}&page=${page}&pageSize=${pageSize}`;
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
            <td style="text-align: left;"><strong>${escapeHtml(lead.companyName)}</strong></td>
            <td style="text-align: left;">${lead.website ? `<a href="${lead.website}" target="_blank">${lead.domain || '链接'}</a>` : '-'}</td>
            <td style="text-align: left;">
                <span class="grade-badge grade-${(lead.overallRating || 'unknown').toLowerCase()}">${lead.overallRating || '-'}</span>
            </td>
            <td style="text-align: left;">
                <span style="font-weight: 600; color: ${lead.contactCount > 0 ? '#10b981' : '#94a3b8'};">
                    ${lead.contactCount || 0}
                </span>
            </td>
            <td style="text-align: left;">${escapeHtml(lead.taskName) || '-'}</td>
            <td style="text-align: left;">
                <span class="status-badge ${getEnrichStatusClass(lead.enrichStatus)}">${STATUS_NAMES[lead.enrichStatus] || lead.enrichStatus}</span>
                ${lead.enrichError ? `<div class="sync-error-msg" title="${escapeHtml(lead.enrichError)}">
                    <small style="color: #dc2626; display: block; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${escapeHtml(lead.enrichError)}
                    </small>
                </div>` : ''}
            </td>
            <td style="text-align: left;">${formatDate(lead.createdAt)}</td>
            <td style="text-align: left;">
                <button class="btn-secondary btn-sm" onclick="retrySingleEnrich('${lead.id}')">
                    ${lead.enrichStatus === 'enriched' ? '重新补充' : '立即补充'}
                </button>
            </td>
        </tr>
    `).join('');

    updatePagination(data.pagination.total, data.pagination.totalPages);
}

function getEnrichStatusClass(status) {
    switch (status) {
        case 'enriched': return 'status-success';
        case 'failed': return 'status-error';
        case 'pending': return 'status-pending';
        default: return '';
    }
}

function updatePagination(total, totalPages) {
    const pagination = document.getElementById('enrich-leads-pagination');
    if (!pagination) return;

    if (totalPages <= 1) {
        pagination.innerHTML = total > 0 ? `<div style="text-align: center; color: #6b7280; margin-top: 16px;">共 ${total} 条</div>` : '';
        return;
    }

    let html = '<div style="display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 20px;">';

    if (currentPage > 1) {
        html += `<button class="btn-secondary btn-sm" onclick="goToEnrichPage(${currentPage - 1})">上一页</button>`;
    }

    html += `<span style="color: #6b7280;">第 ${currentPage} / ${totalPages} 页，共 ${total} 条</span>`;

    if (currentPage < totalPages) {
        html += `<button class="btn-secondary btn-sm" onclick="goToEnrichPage(${currentPage + 1})">下一页</button>`;
    }

    html += '</div>';
    pagination.innerHTML = html;
}

function switchEnrichStatus(status) {
    currentStatus = status;
    currentTaskId = null; // 清除任务筛选
    currentPage = 1;

    updateStatusTabs();
    updateHintBox();
    updateRetryButton();

    // 更新URL但不刷新页面
    window.location.hash = `#enrich-leads?status=${status}`;

    loadEnrichLeads();
}

async function retryAllEnrich() {
    if (!confirm(`确定要重新补充所有${STATUS_NAMES[currentStatus]}的线索吗？`)) return;

    const result = await postAPI('/api/enrich/leads/retry', { status: currentStatus });

    if (result && result.success) {
        showNotification(`已将 ${result.count} 条线索加入补充队列`, 'success');
        await Promise.all([loadEnrichStats(), loadEnrichLeads()]);
    } else {
        showNotification(result?.error || '操作失败', 'error');
    }
}

async function retrySingleEnrich(leadId) {
    const result = await postAPI(`/api/enrich/leads/${leadId}/enrich`);

    if (result && result.success) {
        showNotification('已加入补充队列', 'success');
        await Promise.all([loadEnrichStats(), loadEnrichLeads(currentPage)]);
    } else {
        showNotification(result?.error || '操作失败', 'error');
    }
}

function goToEnrichPage(page) {
    loadEnrichLeads(page);
}

function refreshEnrichLeads() {
    Promise.all([loadEnrichStats(), loadEnrichLeads(currentPage)]);
}

// 导出给HTML调用
window.loadEnrichLeads = loadEnrichLeads;
window.switchEnrichStatus = switchEnrichStatus;
window.retryAllEnrich = retryAllEnrich;
window.retrySingleEnrich = retrySingleEnrich;
window.goToEnrichPage = goToEnrichPage;
window.refreshEnrichLeads = refreshEnrichLeads;
