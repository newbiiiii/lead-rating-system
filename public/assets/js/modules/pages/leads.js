import { fetchAPI } from '../api.js';
import { formatDate } from '../utils.js';

let currentTaskId = null;
let currentPage = 1;
const pageSize = 20;

// Override init to use loadTaskAndLeads
export async function init() {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.split('?')[1] || '');
    currentTaskId = params.get('taskId');

    if (!currentTaskId) {
        document.getElementById('leads-body').innerHTML = '<tr><td colspan="6" class="empty-state">任务ID无效</td></tr>';
        return;
    }

    await loadTaskAndLeads();
}

// I will switch to using /api/tasks/:id to get leads, as it provides better context (task name) and pagination.

async function loadTaskAndLeads() {
    try {
        const data = await fetchAPI(`/api/tasks/${currentTaskId}?page=${currentPage}&pageSize=${pageSize}`);

        if (!data) {
            document.getElementById('leads-body').innerHTML = '<tr><td colspan="6" class="empty-state">加载失败</td></tr>';
            return;
        }

        const { task, leads, pagination } = data;

        // Update task info
        const taskNameEl = document.getElementById('task-name-display');
        if (taskNameEl && task) {
            taskNameEl.textContent = task.name;
        }

        renderLeadsTable(leads, pagination);
        renderPagination(pagination);

    } catch (error) {
        console.error('Failed to load task leads:', error);
        document.getElementById('leads-body').innerHTML = `<tr><td colspan="6" class="empty-state" style="color:red">加载失败: ${error.message}</td></tr>`;
    }
}

function renderLeadsTable(leads, pagination) {
    const tbody = document.getElementById('leads-body');
    if (!leads || leads.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">暂无数据</td></tr>';
        document.getElementById('pagination-container').innerHTML = '';
        return;
    }

    tbody.innerHTML = leads.map(lead => {
        // Rating handling
        const rating = lead.overallRating || lead.rating?.overallRating || '-';
        let ratingClass = 'grade-unknown';
        if (['A', 'B', 'C', 'D'].includes(rating)) {
            ratingClass = `grade-${rating.toLowerCase()}`;
        }

        const suggestion = lead.suggestion || lead.rating?.suggestion || '-';

        // Status badge
        const statusMap = {
            'pending_config': { text: '待配置', color: '#d97706', bg: '#fef3c7' },
            'pending': { text: '待评分', color: '#2563eb', bg: '#dbeafe' },
            'completed': { text: '已评分', color: '#16a34a', bg: '#dcfce7' },
            'failed': { text: '失败', color: '#dc2626', bg: '#fee2e2' }
        };
        const statusConfig = statusMap[lead.ratingStatus] || { text: lead.ratingStatus, color: '#6b7280', bg: '#f3f4f6' };

        return `
            <tr>
                <td><strong>${lead.companyName || '未知公司'}</strong></td>
                <td>
                    ${lead.website ? `<a href="${lead.website}" target="_blank" style="color:#667eea">${lead.website}</a>` : '-'}
                </td>
                <td><span class="grade-badge ${ratingClass}">${rating}</span></td>
                <td title="${suggestion}" style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${suggestion}
                </td>
                <td>
                    <span style="padding: 4px 8px; border-radius: 4px; font-size: 12px; background: ${statusConfig.bg}; color: ${statusConfig.color};">
                        ${statusConfig.text}
                    </span>
                </td>
                <td style="color:#6b7280">${formatDate(lead.createdAt)}</td>
            </tr>
        `;
    }).join('');
}

function renderPagination(pagination) {
    const container = document.getElementById('pagination-container');
    if (!container) return;

    if (pagination.totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    // Simple pagination reuse from other modules or reimplement
    let html = '<div style="display: flex; justify-content: center; gap: 8px; margin-top: 20px;">';

    html += `<button class="pagination-btn" onclick="goToPage(${pagination.page - 1})" ${pagination.page <= 1 ? 'disabled' : ''}>上一页</button>`;

    html += `<span style="display:flex; align-items:center; color:#6b7280">第 ${pagination.page} / ${pagination.totalPages} 页</span>`;

    html += `<button class="pagination-btn" onclick="goToPage(${pagination.page + 1})" ${pagination.page >= pagination.totalPages ? 'disabled' : ''}>下一页</button>`;

    html += '</div>';

    container.innerHTML = html;
}

// Global handlers
window.refreshLeads = async function () {
    await loadTaskAndLeads();
};

window.goToPage = async function (page) {
    currentPage = page;
    await loadTaskAndLeads();
};
