/**
 * 搜索任务页面模块
 * 创建和管理 Google Search 爬取任务
 */

let searchTasksData = [];

export async function init() {
    console.log('[Search] 初始化搜索任务页面');
    setupEventListeners();
    await loadSearchTasks();
}

function setupEventListeners() {
    // 表单提交
    const form = document.getElementById('search-task-form');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }
}

async function handleFormSubmit(e) {
    e.preventDefault();

    const submitBtn = document.getElementById('submit-search-btn');
    const originalText = submitBtn.innerHTML;

    try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> 创建中...';

        const formData = {
            query: document.getElementById('search-query').value.trim(),
            limit: parseInt(document.getElementById('search-limit').value) || 50,
            config: {
                maxPages: parseInt(document.getElementById('search-max-pages').value) || 5,
                region: document.getElementById('search-region').value || undefined,
                language: document.getElementById('search-language').value || 'en',
                searchOperator: document.getElementById('search-operator').value.trim() || undefined
            }
        };

        if (!formData.query) {
            alert('请输入搜索关键词');
            return;
        }

        const response = await fetch('/api/tasks/search-scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || '创建任务失败');
        }

        // 清空表单
        document.getElementById('search-task-form').reset();

        // 刷新任务列表
        await loadSearchTasks();

        // 显示成功提示
        showToast('搜索任务创建成功！', 'success');

    } catch (error) {
        console.error('创建搜索任务失败:', error);
        showToast(error.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

window.loadSearchTasks = async function () {
    const container = document.getElementById('search-tasks-container');
    if (!container) return;

    container.innerHTML = '<div class="loading-placeholder">加载中...</div>';

    try {
        const response = await fetch('/api/tasks?source=google_search&limit=20');
        const result = await response.json();

        searchTasksData = result.tasks || [];
        renderSearchTasks(searchTasksData);

    } catch (error) {
        console.error('加载搜索任务失败:', error);
        container.innerHTML = '<div class="error-state">加载失败，请刷新重试</div>';
    }
}

function renderSearchTasks(tasks) {
    const container = document.getElementById('search-tasks-container');
    if (!container) return;

    if (tasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
                <p>暂无搜索任务</p>
                <p class="text-muted">创建一个搜索任务开始采集数据</p>
            </div>
        `;
        return;
    }

    const html = `
        <div class="search-task-list">
            ${tasks.map(task => renderTaskItem(task)).join('')}
        </div>
    `;

    container.innerHTML = html;
}

function renderTaskItem(task) {
    const statusLabels = {
        pending: '等待中',
        running: '进行中',
        completed: '已完成',
        failed: '失败',
        cancelled: '已取消'
    };

    const createdAt = task.createdAt
        ? new Date(task.createdAt).toLocaleString('zh-CN')
        : '-';

    return `
        <div class="search-task-item" data-task-id="${task.id}">
            <div class="search-task-info">
                <h4>
                    <span class="status-badge ${task.status}">${statusLabels[task.status] || task.status}</span>
                    ${escapeHtml(task.query || task.name)}
                </h4>
                <div class="search-task-meta">
                    <span>📅 ${createdAt}</span>
                    ${task.config?.region ? `<span>🌍 ${task.config.region}</span>` : ''}
                </div>
            </div>
            <div class="search-task-stats">
                <div class="task-stat">
                    <div class="task-stat-value">${task.totalLeads || 0}</div>
                    <div class="task-stat-label">线索</div>
                </div>
                <div class="task-stat">
                    <div class="task-stat-value">${task.successLeads || 0}</div>
                    <div class="task-stat-label">成功</div>
                </div>
                <div class="task-stat">
                    <div class="task-stat-value">${task.progress || 0}%</div>
                    <div class="task-stat-label">进度</div>
                </div>
            </div>
            <div class="search-task-actions">
                ${task.status === 'running' ? `
                    <button class="btn-secondary btn-sm" onclick="cancelSearchTask('${task.id}')">取消</button>
                ` : ''}
                ${task.status === 'completed' || task.status === 'failed' ? `
                    <button class="btn-secondary btn-sm" onclick="viewTaskLeads('${task.id}')">查看线索</button>
                ` : ''}
            </div>
        </div>
    `;
}

window.cancelSearchTask = async function (taskId) {
    if (!confirm('确定要取消这个任务吗？')) return;

    try {
        const response = await fetch(`/api/tasks/${taskId}/cancel`, {
            method: 'POST'
        });

        if (!response.ok) {
            throw new Error('取消任务失败');
        }

        showToast('任务已取消', 'success');
        await loadSearchTasks();
    } catch (error) {
        console.error('取消任务失败:', error);
        showToast(error.message, 'error');
    }
}

window.viewTaskLeads = function (taskId) {
    // 跳转到线索列表页面，带上任务筛选
    window.location.hash = `#leads?taskId=${taskId}`;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    // 简单的 toast 提示
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 24px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        border-radius: 8px;
        font-weight: 500;
        z-index: 9999;
        animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

export default { init };
