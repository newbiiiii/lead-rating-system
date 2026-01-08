// Management页面逻辑模块
import { fetchAPI } from '../api.js';
import { formatDate } from '../utils.js';

export async function init() {
    // 加载任务历史
    await loadTaskHistory();
}

async function loadTaskHistory() {
    const data = await fetchAPI('/api/tasks?page=1&limit=50');
    const tbody = document.querySelector('#task-history-body');

    if (!data || !data.tasks || data.tasks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">暂无任务</td></tr>';
        return;
    }

    tbody.innerHTML = data.tasks.map(task => {
        const statusMap = {
            pending: ['等待中', '#f59e0b', '#fef3c7'],
            running: ['运行中', '#3b82f6', '#dbeafe'],
            completed: ['已完成', '#10b981', '#d1fae5'],
            failed: ['失败', '#ef4444', '#fee2e2']
        };
        const [statusName, statusColor, statusBg] = statusMap[task.status] || [task.status, '#6b7280', '#f3f4f6'];
        const successRate = task.totalLeads > 0 ? Math.round((task.successLeads / task.totalLeads) * 100) : 0;

        return `<tr style="background: white; transition: all 0.2s; border-bottom: 1px solid #e5e7eb;" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='white'">
            <td>
                <div style="font-weight: 600; color: #111827; margin-bottom: 4px;">${task.name}</div>
                <div style="font-size: 11px; color: #6b7280;">ID: ${task.id.substring(0, 8)}...</div>
            </td>
            <td>
                <span style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: linear-gradient(135deg, #667eea, #764ba2); border-radius: 8px; font-size: 12px; color: white; font-weight: 500;">
                    <svg width="12" height="12" fill="white" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8"/></svg>
                    ${task.source === 'google_maps' ? 'Google Maps' : task.source}
                </span>
            </td>
            <td>
                <span style="display: inline-block; padding: 6px 16px; border-radius: 20px; background: ${statusBg}; color: ${statusColor}; font-size: 12px; font-weight: 600; letter-spacing: 0.3px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    ${statusName}
                </span>
            </td>
            <td>
                <div style="min-width: 160px;">
                    ${task.searchPointsStats && task.searchPointsStats.total > 0 ? `
                    <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px;">
                        <span style="display: inline-block; padding: 4px 10px; background: linear-gradient(135deg, #667eea, #764ba2); color: white; border-radius: 6px; font-size: 12px; font-weight: 700; font-family: 'Courier New', monospace;">
                            #${task.searchPointsStats.completed + task.searchPointsStats.failed}/${task.searchPointsStats.total}
                        </span>
                    </div>
                    ` : ''}
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <div style="flex: 1; background: #e5e7eb; height: 10px; border-radius: 20px; overflow: hidden; box-shadow: inset 0 1px 2px rgba(0,0,0,0.1);">
                            <div style="width: ${task.progress || 0}%; height: 100%; background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); transition: width 0.3s; box-shadow: 0 0 10px rgba(102, 126, 234, 0.4);"></div>
                        </div>
                        <span style="color: #374151; font-size: 13px; font-weight: 600; min-width: 38px;">${task.progress || 0}%</span>
                    </div>
                </div>
            </td>
            <td>
                <div style="display: flex; flex-direction: column; gap: 6px; padding: 4px 0;">
                    <div style="font-size: 22px; font-weight: 700; color: #111827;">${task.totalLeads || 0}</div>
                    <div style="display: flex; gap: 14px; font-size: 11px; font-weight: 500;">
                        <span style="color: #10b981;">✓ ${task.successLeads || 0}</span>
                        <span style="color: #ef4444;">✗ ${task.failedLeads || 0}</span>
                        <span style="color: #6b7280; background: #f3f4f6; padding: 2px 6px; border-radius: 4px;">${successRate}%</span>
                    </div>
                </div>
            </td>
            <td style="color: #6b7280; font-size: 13px;">${formatDate(task.createdAt)}</td>
            <td>
                <button class="btn-secondary btn-sm" onclick="viewTaskDetail('${task.id}')" style="background: linear-gradient(135deg, #667eea, #764ba2); border: none; color: white; font-weight: 600; padding: 10px 18px; border-radius: 8px; box-shadow: 0 2px 8px rgba(102, 126, 234, 0.25); transition: all 0.2s; cursor: pointer;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(102, 126, 234, 0.35)'" onmouseout="this.style.transform=''; this.style.boxShadow='0 2px 8px rgba(102, 126, 234, 0.25)'">
                    查看详情
                </button>
            </td>
        </tr>`;
    }).join('');
}

async function viewTaskDetail(taskId) {
    const task = await fetchAPI(`/api/tasks/${taskId}`);
    if (!task) return;

    document.getElementById('task-detail-modal').style.display = 'block';
    document.getElementById('modal-task-name').textContent = task.name;

    const statusMap = {
        pending: ['等待中', '#f59e0b', '#fef3c7'],
        running: ['运行中', '#3b82f6', '#dbeafe'],
        completed: ['已完成', '#10b981', '#d1fae5'],
        failed: ['失败', '#ef4444', '#fee2e2']
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
                <div style="color: #7c3aed; font-size: 32px; font-weight: 800;">${task.totalLeads || 0}</div>
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
        </div>`;

    const leadsBody = document.getElementById('task-leads-body');
    if (!task.leads || task.leads.length === 0) {
        leadsBody.innerHTML = '<tr><td colspan="6" class="empty-state">该任务暂无线索</td></tr>';
        return;
    }

    leadsBody.innerHTML = task.leads.map((lead, index) => {
        const contacts = (lead.contacts || []).map(c => c.phone || c.email).filter(Boolean).join(', ') || '-';
        return `<tr style="background: white; transition: all 0.2s; border-bottom: 1px solid #f3f4f6;" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='white'">
            <td>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, #667eea, #764ba2); display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: 700; box-shadow: 0 2px 6px rgba(102, 126, 234, 0.3);">${index + 1}</div>
                    <strong style="color: #111827;">${lead.companyName}</strong>
                </div>
            </td>
            <td>${lead.website ? `<a href="${lead.website}" target="_blank" style="color: #667eea; text-decoration: none; font-weight: 500;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${lead.website.substring(0, 35)}...</a>` : '<span style="color: #9ca3af;">-</span>'}</td>
            <td style="color: #6b7280; font-weight: 500;">${lead.industry || '-'}</td>
            <td>${lead.rating ? `<span style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 6px 12px; border-radius: 10px; font-weight: 700; font-size: 13px; box-shadow: 0 2px 6px rgba(16, 185, 129, 0.3);">${lead.rating.toFixed(1)}</span>` : '<span style="color: #9ca3af;">-</span>'}</td>
            <td style="font-size: 12px; max-width: 200px; color: #6b7280;">${contacts}</td>
            <td>
                <span style="display: inline-block; padding: 6px 12px; border-radius: 12px; background: ${lead.ratingStatus === 'rated' ? '#d1fae5' : '#fef3c7'}; color: ${lead.ratingStatus === 'rated' ? '#059669' : '#d97706'}; font-size: 11px; font-weight: 700; border: 1px solid ${lead.ratingStatus === 'rated' ? '#86efac' : '#fcd34d'};">
                    ${lead.ratingStatus === 'pending' ? '⏳ 待评级' : '✓ 已评级'}
                </span>
            </td>
        </tr>`;
    }).join('');
}

function closeTaskDetail() {
    document.getElementById('task-detail-modal').style.display = 'none';
}

// 导出给HTML调用
window.loadTaskHistory = loadTaskHistory;
window.viewTaskDetail = viewTaskDetail;
window.closeTaskDetail = closeTaskDetail;
