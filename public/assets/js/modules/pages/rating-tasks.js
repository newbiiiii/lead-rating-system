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
                            <span style="color: #6b7280; font-size: 10px;">搜索点</span>
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
