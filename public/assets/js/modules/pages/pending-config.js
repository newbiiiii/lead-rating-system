/**
 * 待配置规则管理页面 JavaScript
 */

import { fetchAPI } from '../api.js';
import { formatDate } from '../utils.js';

// 分页状态
let currentPage = 1;
let pageSize = 20;

/**
 * 加载待配置线索列表
 */
export async function loadPendingConfigLeads(page = 1, size = 20) {
    currentPage = page;
    pageSize = size;

    const data = await fetchAPI(`/api/leads/pending-config?page=${page}&pageSize=${size}`);
    if (!data) return;

    const { leads, pagination } = data;

    const tbody = document.getElementById('pending-config-body');
    if (!leads || leads.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">暂无待配置的线索</td></tr>';
        return;
    }

    tbody.innerHTML = leads.map((lead, index) => {
        const globalIndex = (pagination.page - 1) * pagination.pageSize + index + 1;
        return `<tr style="background: white; transition: all 0.2s; border-bottom: 1px solid #f3f4f6;" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='white'">
            <td>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, #f59e0b, #d97706); display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: 700; box-shadow: 0 2px 6px rgba(245, 158, 11, 0.3);">${globalIndex}</div>
                    <strong style="color: #111827;">${lead.companyName}</strong>
                </div>
            </td>
            <td>
                ${lead.website ? `<a href="${lead.website}" target="_blank" style="color: #667eea; text-decoration: none; font-weight: 500;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${lead.website.substring(0, 40)}...</a>` : '<span style="color:#9ca3af;">-</span>'}
            </td>
            <td style="color: #6b7280; font-weight: 500;">${lead.taskName}</td>
            <td>
                <span style="display: inline-block; padding: 6px 12px; border-radius: 12px; background: #fef3c7; color: #d97706; font-size: 11px; font-weight: 700; border: 1px solid #fcd34d;">待配置</span>
            </td>
            <td style="color: #6b7280; font-size: 13px;">${formatDate(lead.createdAt)}</td>
            <td>
                <button onclick="retrySingleLead('${lead.id}')" 
                    style="padding: 6px 12px; background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px;">
                    重新评分
                </button>
            </td>
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
    html += `<button onclick="loadPendingConfigLeads(${page - 1}, ${pageSize})" 
                ${page === 1 ? 'disabled' : ''}
                style="padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; background: white; cursor: ${page === 1 ? 'not-allowed' : 'pointer'}; color: ${page === 1 ? '#9ca3af' : '#374151'};">
            上一页
        </button>`;

    // 页码
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
            html += `<button onclick="loadPendingConfigLeads(${i}, ${pageSize})" 
                        style="padding: 8px 12px; border: 1px solid ${i === page ? '#667eea' : '#e5e7eb'}; border-radius: 6px; background: ${i === page ? 'linear-gradient(135deg, #667eea, #764ba2)' : 'white'}; color: ${i === page ? 'white' : '#374151'}; font-weight: ${i === page ? '600' : '400'}; cursor: pointer;">
                    ${i}
                </button>`;
        } else if (i === page - 3 || i === page + 3) {
            html += '<span style="padding: 8px;">...</span>';
        }
    }

    // 下一页
    html += `<button onclick="loadPendingConfigLeads(${page + 1}, ${pageSize})" 
                ${page === totalPages ? 'disabled' : ''}
                style="padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; background: white; cursor: ${page === totalPages ? 'not-allowed' : 'pointer'}; color: ${page === totalPages ? '#9ca3af' : '#374151'};">
            下一页
        </button>`;

    html += `<div style="margin-left: 16px; color: #6b7280; font-size: 14px;">共 ${total} 条</div>`;
    html += '</div>';

    container.innerHTML = html;
}

/**
 * 批量重新评分所有待配置线索
 */
export async function retryAllLeads() {
    if (!confirm('确定要将所有待配置的线索重新加入评分队列吗？')) {
        return;
    }

    const data = await fetchAPI('/api/leads/retry-rating', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({}) // 不传leadIds，表示重新评分所有
    });

    if (data && data.success) {
        alert(data.message);
        // 重新加载列表
        loadPendingConfigLeads(currentPage, pageSize);
    }
}

/**
 * 重新评分单个线索
 */
export async function retrySingleLead(leadId) {
    const data = await fetchAPI('/api/leads/retry-rating', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            leadIds: [leadId]
        })
    });

    if (data && data.success) {
        alert('已重新加入评分队列');
        // 重新加载列表
        loadPendingConfigLeads(currentPage, pageSize);
    }
}

// 导出给HTML调用
window.loadPendingConfigLeads = loadPendingConfigLeads;
window.retryAllLeads = retryAllLeads;
window.retrySingleLead = retrySingleLead;