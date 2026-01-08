// Rating Tasks页面逻辑模块
import { fetchAPI } from '../api.js';
import { formatDate, getSourceName } from '../utils.js';

export async function init() {
    // 加载评分任务列表
    await loadRatingTasks();
}

async function loadRatingTasks() {
    const data = await fetchAPI('/api/tasks?limit=50');
    const tbody = document.getElementById('rating-tasks-body');

    if (!data || !data.tasks || data.tasks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">暂无数据</td></tr>';
        return;
    }

    tbody.innerHTML = data.tasks.map(task => {
        const totalLeads = task.totalLeads || 0;
        const successLeads = task.successLeads || 0;
        const progress = totalLeads > 0 ? Math.round((successLeads / totalLeads) * 100) : 0;

        return `
            <tr>
                <td>${task.name || '-'}</td>
                <td>${task.query || '-'}</td>
                <td>${getSourceName(task.source)}</td>
                <td>${totalLeads}</td>
                <td>${successLeads}</td>
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="flex: 1; background: #e2e8f0; border-radius: 4px; height: 8px; overflow: hidden;">
                            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); height: 100%; width: ${progress}%;"></div>
                        </div>
                        <span style="font-size: 12px; color: #64748b; min-width: 45px;">${progress}%</span>
                    </div>
                </td>
                <td>${formatDate(task.createdAt)}</td>
                <td>
                    <button class="btn-secondary btn-sm" onclick="viewRatingTaskDetail('${task.id}')">查看详情</button>
                </td>
            </tr>
        `;
    }).join('');
}

async function viewRatingTaskDetail(taskId) {
    const task = await fetchAPI(`/api/tasks/${taskId}`);
    if (!task) return;

    // 复用任务详情弹窗
    if (window.viewTaskDetail) {
        window.viewTaskDetail(taskId);
    }
}

// 导出给HTML调用
window.loadRatingTasks = loadRatingTasks;
window.viewRatingTaskDetail = viewRatingTaskDetail;
