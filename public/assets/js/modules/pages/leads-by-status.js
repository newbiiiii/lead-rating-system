/**
 * 通用状态线索管理页面 JavaScript
 * 支持查看 pending_config, failed, pending 等状态的线索
 */

import { fetchAPI, postAPI } from '../api.js';
import { formatDate } from '../utils.js';

// 状态配置
const STATUS_CONFIG = {
    'pending_config': {
        title: '待配置评分规则',
        hint: '这些线索因为评分规则未配置而处于待配置状态。请先添加对应的评分规则到 <code>getDynamicRatingContext</code> 函数中，然后点击"批量重新评分"按钮。',
        hintBg: '#fef3c7',
        hintBorder: '#fcd34d',
        hintColor: '#92400e',
        badgeBg: '#fef3c7',
        badgeColor: '#d97706',
        badgeBorder: '#fcd34d',
        badgeText: '待配置',
        indexColor: '#f59e0b'
    },
    'failed': {
        title: '评分失败',
        hint: '这些线索在评分过程中遇到错误。您可以点击"批量重新评分"按钮重新尝试评分。',
        hintBg: '#fee2e2',
        hintBorder: '#fca5a5',
        hintColor: '#b91c1c',
        badgeBg: '#fee2e2',
        badgeColor: '#dc2626',
        badgeBorder: '#fca5a5',
        badgeText: '失败',
        indexColor: '#ef4444'
    },
    'pending': {
        title: '待评分',
        hint: '这些线索正在等待评分。系统会自动处理这些线索，您也可以手动将它们重新加入队列。',
        hintBg: '#dbeafe',
        hintBorder: '#93c5fd',
        hintColor: '#1e40af',
        badgeBg: '#dbeafe',
        badgeColor: '#2563eb',
        badgeBorder: '#93c5fd',
        badgeText: '待评分',
        indexColor: '#3b82f6'
    },
    'completed': {
        title: '评分成功',
        hint: '这些线索已成功完成评分。',
        hintBg: '#dcfce7',
        hintBorder: '#86efac',
        hintColor: '#166534',
        badgeBg: '#dcfce7',
        badgeColor: '#16a34a',
        badgeBorder: '#86efac',
        badgeText: '成功',
        indexColor: '#22c55e',
        hideRetryButton: true
    },
};

// 分页状态
let currentPage = 1;
let pageSize = 20;
let currentStatus = 'pending_config';

/**
 * 从 URL hash 获取当前状态
 */
function getStatusFromHash() {
    const hash = window.location.hash;
    const match = hash.match(/leads-by-status\?status=(\w+)/);
    if (match && STATUS_CONFIG[match[1]]) {
        return match[1];
    }
    return 'pending_config';
}

/**
 * 初始化页面
 */
export function init() {
    currentStatus = getStatusFromHash();
    updatePageUI();
    loadLeadsByStatus(1, pageSize);
}

/**
 * 更新页面 UI 根据当前状态
 */
function updatePageUI() {
    const config = STATUS_CONFIG[currentStatus];
    if (!config) return;

    // 更新标题
    const titleEl = document.getElementById('status-page-title');
    if (titleEl) titleEl.textContent = config.title;

    // 更新提示框
    const hintBox = document.getElementById('status-hint-box');
    if (hintBox) {
        hintBox.style.background = config.hintBg;
        hintBox.style.borderColor = config.hintBorder;
    }

    const hintText = document.getElementById('status-hint-text');
    if (hintText) {
        hintText.innerHTML = config.hint;
        hintText.parentElement.style.color = config.hintColor;
    }

    // 更新表头（不同状态显示不同列）
    const thead = document.querySelector('.data-table thead tr');
    if (thead) {
        const showError = currentStatus === 'failed';
        const showRatingDetails = currentStatus === 'completed';
        thead.innerHTML = `
            <th>公司名称</th>
            <th>网站</th>
            <th>所属任务</th>
            ${showRatingDetails ? '<th>评级</th><th>AI建议</th><th>AI分析</th><th>评级时间</th>' : '<th>状态</th>'}
            ${showError ? '<th>失败原因</th>' : ''}
            ${!showRatingDetails ? '<th>创建时间</th><th>操作</th>' : ''}
        `;
    }

    // 动态添加筛选器 (仅在 completed 状态显示)
    const headerActions = document.querySelector('.header-actions');
    // 先移除已存在的筛选器
    const existingFilter = document.getElementById('rating-filter-container');
    if (existingFilter) existingFilter.remove();

    if (currentStatus === 'completed' && headerActions) {
        const filterHtml = `
            <div id="rating-filter-container" style="margin-right: 10px; display: inline-block;">
                <select id="rating-filter" onchange="filterByRating(this.value)" style="padding: 6px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; color: #374151; background-color: #fff; cursor: pointer; outline: none; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);">
                    <option value="">全部评级</option>
                    <option value="A" ${overallRatingFilter === 'A' ? 'selected' : ''}>A级 (优质)</option>
                    <option value="B" ${overallRatingFilter === 'B' ? 'selected' : ''}>B级 (良好)</option>
                    <option value="C" ${overallRatingFilter === 'C' ? 'selected' : ''}>C级 (一般)</option>
                    <option value="D" ${overallRatingFilter === 'D' ? 'selected' : ''}>D级 (不符)</option>
                </select>
            </div>
        `;
        headerActions.insertAdjacentHTML('afterbegin', filterHtml);
    }
}

/**
 * 按评级筛选
 */
function filterByRating(rating) {
    overallRatingFilter = rating;
    loadLeadsByStatus(1, pageSize);
}

// 评级筛选
let overallRatingFilter = '';

/**
 * 加载指定状态的线索列表
 */
export async function loadLeadsByStatus(page = 1, size = 20) {
    currentPage = page;
    pageSize = size;

    let url = `/api/leads/by-status?status=${currentStatus}&page=${page}&pageSize=${size}`;
    if (currentStatus === 'completed' && overallRatingFilter) {
        url += `&overallRating=${overallRatingFilter}`;
    }

    const data = await fetchAPI(url);
    if (!data) return;

    const { leads, pagination } = data;

    const tbody = document.getElementById('leads-status-body');
    if (!leads || leads.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state">暂无${STATUS_CONFIG[currentStatus]?.badgeText || ''}的线索</td></tr>`;
        document.getElementById('pagination-container').innerHTML = '';
        return;
    }

    const config = STATUS_CONFIG[currentStatus];
    const showError = currentStatus === 'failed';
    const showRatingDetails = currentStatus === 'completed';
    tbody.innerHTML = leads.map((lead, index) => {
        const globalIndex = (pagination.page - 1) * pagination.pageSize + index + 1;
        const errorColumn = showError ? `
            <td style="max-width: 200px;">
                ${lead.ratingError ? `<span style="color: #dc2626; font-size: 12px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${lead.ratingError.replace(/"/g, '&quot;')}">${lead.ratingError.substring(0, 50)}${lead.ratingError.length > 50 ? '...' : ''}</span>` : '<span style="color:#9ca3af;">-</span>'}
            </td>` : '';

        // 评级徽章颜色
        const ratingColors = {
            'A': { bg: '#dcfce7', color: '#16a34a', border: '#86efac' },
            'B': { bg: '#dbeafe', color: '#2563eb', border: '#93c5fd' },
            'C': { bg: '#fef3c7', color: '#d97706', border: '#fcd34d' },
            'D': { bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' }
        };
        const ratingStyle = ratingColors[lead.overallRating] || { bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' };

        // completed 状态的详情列
        const ratingDetailsColumns = showRatingDetails ? `
            <td>
                <span style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; background: ${ratingStyle.bg}; color: ${ratingStyle.color}; font-size: 14px; font-weight: 700; border: 2px solid ${ratingStyle.border};">${lead.overallRating || '-'}</span>
            </td>
            <td style="max-width: 200px;">
                ${lead.suggestion ? `<span style="color: #374151; font-size: 12px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${lead.suggestion.replace(/"/g, '&quot;')}">${lead.suggestion.substring(0, 60)}${lead.suggestion.length > 60 ? '...' : ''}</span>` : '<span style="color:#9ca3af;">-</span>'}
            </td>
            <td style="max-width: 150px;">
                ${lead.think ? `<span style="color: #6b7280; font-size: 11px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${lead.think.replace(/"/g, '&quot;')}">${lead.think.substring(0, 40)}${lead.think.length > 40 ? '...' : ''}</span>` : '<span style="color:#9ca3af;">-</span>'}
            </td>
            <td style="color: #6b7280; font-size: 13px;">${lead.ratedAt ? formatDate(lead.ratedAt) : '-'}</td>
        ` : `
            <td>
                <span style="display: inline-block; padding: 6px 12px; border-radius: 12px; background: ${config.badgeBg}; color: ${config.badgeColor}; font-size: 11px; font-weight: 700; border: 1px solid ${config.badgeBorder};">${config.badgeText}</span>
            </td>
        `;

        // 操作列（completed状态不显示）
        const actionColumns = !showRatingDetails ? `
            <td style="color: #6b7280; font-size: 13px;">${formatDate(lead.createdAt)}</td>
            <td>
                <button onclick="retrySingleLead('${lead.id}')" 
                    style="padding: 6px 12px; background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px;">
                    重新评分
                </button>
            </td>
        ` : '';

        return `<tr style="background: white; transition: all 0.2s; border-bottom: 1px solid #f3f4f6;" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='white'">
            <td>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, ${config.indexColor}, ${config.indexColor}dd); display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: 700; box-shadow: 0 2px 6px ${config.indexColor}4d;">${globalIndex}</div>
                    <strong style="color: #111827;">${lead.companyName}</strong>
                </div>
            </td>
            <td>
                ${lead.website ? `<a href="${lead.website}" target="_blank" style="color: #667eea; text-decoration: none; font-weight: 500;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${lead.website.substring(0, 40)}${lead.website.length > 40 ? '...' : ''}</a>` : '<span style="color:#9ca3af;">-</span>'}
            </td>
            <td style="color: #6b7280; font-weight: 500;">${lead.taskName || '-'}</td>
            ${ratingDetailsColumns}
            ${errorColumn}
            ${actionColumns}
        </tr>`;
    }).join('');

    // 渲染分页控件
    updatePagination(pagination);
}

/**
 * 更新分页控件
 */
function updatePagination(pagination) {
    const container = document.getElementById('pagination-container');
    if (!container) return;

    const { page, totalPages, total } = pagination;

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '<div style="display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 20px;">';

    // 上一页
    html += `<button onclick="refreshLeadsList(${page - 1}, ${pageSize})" 
                ${page === 1 ? 'disabled' : ''}
                style="padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; background: white; cursor: ${page === 1 ? 'not-allowed' : 'pointer'}; color: ${page === 1 ? '#9ca3af' : '#374151'};">
            上一页
        </button>`;

    // 页码
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
            html += `<button onclick="refreshLeadsList(${i}, ${pageSize})" 
                        style="padding: 8px 12px; border: 1px solid ${i === page ? '#667eea' : '#e5e7eb'}; border-radius: 6px; background: ${i === page ? 'linear-gradient(135deg, #667eea, #764ba2)' : 'white'}; color: ${i === page ? 'white' : '#374151'}; font-weight: ${i === page ? '600' : '400'}; cursor: pointer;">
                    ${i}
                </button>`;
        } else if (i === page - 3 || i === page + 3) {
            html += '<span style="padding: 8px;">...</span>';
        }
    }

    // 下一页
    html += `<button onclick="refreshLeadsList(${page + 1}, ${pageSize})" 
                ${page === totalPages ? 'disabled' : ''}
                style="padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; background: white; cursor: ${page === totalPages ? 'not-allowed' : 'pointer'}; color: ${page === totalPages ? '#9ca3af' : '#374151'};">
            下一页
        </button>`;

    html += `<div style="margin-left: 16px; color: #6b7280; font-size: 14px;">共 ${total} 条</div>`;
    html += '</div>';

    container.innerHTML = html;
}

/**
 * 刷新列表
 */
export function refreshLeadsList(page = currentPage, size = pageSize) {
    loadLeadsByStatus(page, size);
}

/**
 * 批量重新评分所有当前状态线索
 */
export async function retryAllLeads() {
    const config = STATUS_CONFIG[currentStatus];
    if (!confirm(`确定要将所有${config?.badgeText || ''}的线索重新加入评分队列吗？`)) {
        return;
    }

    const data = await postAPI('/api/leads/retry-rating-by-status', { status: currentStatus });

    if (data && data.success) {
        alert(data.message);
        // 重新加载列表
        loadLeadsByStatus(currentPage, pageSize);
    }
}

/**
 * 重新评分单个线索
 */
export async function retrySingleLead(leadId) {
    const data = await postAPI('/api/leads/retry-rating-by-status', { leadIds: [leadId], status: currentStatus });

    if (data && data.success) {
        alert('已重新加入评分队列');
        // 重新加载列表
        loadLeadsByStatus(currentPage, pageSize);
    }
}

// 导出给HTML调用
window.refreshLeadsList = refreshLeadsList;
window.retryAllLeads = retryAllLeads;
window.retrySingleLead = retrySingleLead;
window.filterByRating = filterByRating;
