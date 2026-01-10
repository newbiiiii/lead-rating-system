// Import页面逻辑模块
import { fetchAPI } from '../api.js';
import { formatDate, showNotification } from '../utils.js';

let currentPage = 1;
const pageSize = 20;
let selectedLeadIds = new Set();

export async function init() {
    // 绑定表单提交
    const importForm = document.getElementById('import-form');
    if (importForm) {
        importForm.addEventListener('submit', handleImportSubmit);
    }

    // 绑定文件选择
    const fileInput = document.getElementById('file-input');
    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
    }

    // 绑定清除文件按钮
    const clearFileBtn = document.getElementById('clear-file-btn');
    if (clearFileBtn) {
        clearFileBtn.addEventListener('click', clearFile);
    }

    // 绑定拖拽事件
    const uploadArea = document.getElementById('file-upload-area');
    if (uploadArea) {
        uploadArea.addEventListener('dragover', handleDragOver);
        uploadArea.addEventListener('dragleave', handleDragLeave);
        uploadArea.addEventListener('drop', handleDrop);
    }

    // 绑定刷新按钮
    const refreshTasksBtn = document.getElementById('refresh-tasks-btn');
    if (refreshTasksBtn) {
        refreshTasksBtn.addEventListener('click', loadImportTasks);
    }

    const refreshLeadsBtn = document.getElementById('refresh-leads-btn');
    if (refreshLeadsBtn) {
        refreshLeadsBtn.addEventListener('click', () => loadImportLeads(1));
    }

    // 绑定全选复选框
    const selectAllCheckbox = document.getElementById('select-all-leads');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', handleSelectAll);
    }

    // 绑定同步到CRM按钮
    const syncBtn = document.getElementById('sync-selected-btn');
    if (syncBtn) {
        syncBtn.addEventListener('click', handleSyncToCrm);
    }

    // 绑定来源分类选择
    const sourceSelect = document.getElementById('source-select');
    if (sourceSelect) {
        sourceSelect.addEventListener('change', handleSourceChange);
    }

    // 加载数据
    await Promise.all([
        loadImportTasks(),
        loadImportLeads(1)
    ]);
}

// 处理来源分类选择变化
function handleSourceChange(e) {
    const customInput = document.getElementById('custom-source-input');
    if (customInput) {
        if (e.target.value === 'custom') {
            customInput.style.display = 'block';
            customInput.focus();
        } else {
            customInput.style.display = 'none';
            customInput.value = '';
        }
    }
}

// 处理文件选择
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        showSelectedFile(file);
    }
}

// 显示选中的文件
function showSelectedFile(file) {
    const placeholder = document.querySelector('.file-upload-placeholder');
    const selected = document.getElementById('file-selected');
    const fileName = document.getElementById('file-name');

    if (placeholder && selected && fileName) {
        placeholder.style.display = 'none';
        selected.style.display = 'flex';
        fileName.textContent = file.name;
    }
}

// 清除文件
function clearFile() {
    const fileInput = document.getElementById('file-input');
    const placeholder = document.querySelector('.file-upload-placeholder');
    const selected = document.getElementById('file-selected');

    if (fileInput) fileInput.value = '';
    if (placeholder) placeholder.style.display = 'block';
    if (selected) selected.style.display = 'none';
}

// 拖拽事件处理
function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const fileInput = document.getElementById('file-input');
        if (fileInput) {
            fileInput.files = files;
            showSelectedFile(files[0]);
        }
    }
}

// 处理导入表单提交
async function handleImportSubmit(e) {
    e.preventDefault();

    const form = e.target;
    const fileInput = document.getElementById('file-input');
    const file = fileInput.files[0];

    if (!file) {
        showNotification('请选择要导入的 Excel 文件', 'error');
        return;
    }

    // 获取来源分类
    const sourceSelect = document.getElementById('source-select');
    const customSourceInput = document.getElementById('custom-source-input');
    let source = sourceSelect?.value || 'import';

    // 如果选择自定义，使用自定义输入的值
    if (source === 'custom') {
        source = customSourceInput?.value?.trim();
        if (!source) {
            showNotification('请输入自定义分类名称', 'error');
            return;
        }
    }

    // 创建 FormData
    const formData = new FormData();
    formData.append('file', file);
    formData.append('taskName', form.taskName.value.trim());
    formData.append('source', source);

    // 提交导入请求
    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = '导入中...';

    try {
        const response = await fetch('/api/import/leads', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showNotification(`成功导入 ${result.count} 条线索`, 'success');
            form.reset();
            clearFile();
            // 刷新数据
            await Promise.all([
                loadImportTasks(),
                loadImportLeads(1)
            ]);
        } else {
            showNotification(result?.error || '导入失败', 'error');
        }
    } catch (err) {
        showNotification('导入请求失败: ' + err.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '开始导入';
    }
}

// 加载导入任务列表
async function loadImportTasks() {
    const container = document.getElementById('import-tasks-container');
    if (!container) return;

    container.innerHTML = '<div class="loading">加载中...</div>';

    const result = await fetchAPI('/api/import/tasks?pageSize=10');

    if (!result || !result.tasks || result.tasks.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无导入历史</div>';
        return;
    }

    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>任务名称</th>
                    <th>导入数量</th>
                    <th>导入时间</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>
                ${result.tasks.map(task => `
                    <tr>
                        <td><strong>${task.name}</strong></td>
                        <td>${task.totalLeads || 0}</td>
                        <td>${formatDate(task.createdAt)}</td>
                        <td>
                            <button class="btn-secondary btn-sm" onclick="window.filterByTask('${task.id}')">
                                查看线索
                            </button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// 加载导入的线索列表
async function loadImportLeads(page = 1, taskId = null) {
    currentPage = page;
    const tbody = document.getElementById('import-leads-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="8" class="loading">加载中...</td></tr>';

    let url = `/api/import/leads?page=${page}&pageSize=${pageSize}`;
    if (taskId) {
        url += `&taskId=${taskId}`;
    }

    const result = await fetchAPI(url);

    if (!result || !result.leads || result.leads.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">暂无导入数据</td></tr>';
        updatePagination(0, 0);
        return;
    }

    selectedLeadIds.clear();
    updateSyncButton();

    tbody.innerHTML = result.leads.map(lead => `
        <tr data-id="${lead.id}">
            <td><input type="checkbox" class="lead-checkbox" value="${lead.id}" onchange="window.handleLeadSelect(this)"></td>
            <td><strong>${lead.companyName}</strong></td>
            <td>${lead.website ? `<a href="${lead.website}" target="_blank">${lead.domain || lead.website}</a>` : '-'}</td>
            <td>${lead.contactName || '-'}</td>
            <td>${lead.contactEmail || '-'}</td>
            <td>${getCrmStatusBadge(lead.crmSyncStatus)}</td>
            <td>${formatDate(lead.createdAt)}</td>
            <td>
                <button class="btn-secondary btn-sm" onclick="window.syncSingleLead('${lead.id}')">
                    同步CRM
                </button>
            </td>
        </tr>
    `).join('');

    updatePagination(result.pagination.total, result.pagination.totalPages);
}

// 更新分页
function updatePagination(total, totalPages) {
    const pagination = document.getElementById('leads-pagination');
    if (!pagination) return;

    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    let html = '';
    html += `<span>共 ${total} 条</span>`;

    if (currentPage > 1) {
        html += `<button class="btn-secondary btn-sm" onclick="window.goToPage(${currentPage - 1})">上一页</button>`;
    }

    html += `<span>第 ${currentPage} / ${totalPages} 页</span>`;

    if (currentPage < totalPages) {
        html += `<button class="btn-secondary btn-sm" onclick="window.goToPage(${currentPage + 1})">下一页</button>`;
    }

    pagination.innerHTML = html;
}

// 获取CRM状态徽章
function getCrmStatusBadge(status) {
    const statusMap = {
        'pending': '<span class="status-badge status-pending">待同步</span>',
        'synced': '<span class="status-badge status-success">已同步</span>',
        'failed': '<span class="status-badge status-error">同步失败</span>'
    };
    return statusMap[status] || '<span class="status-badge">-</span>';
}

// 处理全选
function handleSelectAll(e) {
    const isChecked = e.target.checked;
    const checkboxes = document.querySelectorAll('.lead-checkbox');

    checkboxes.forEach(cb => {
        cb.checked = isChecked;
        if (isChecked) {
            selectedLeadIds.add(cb.value);
        } else {
            selectedLeadIds.delete(cb.value);
        }
    });

    updateSyncButton();
}

// 处理单个选择
window.handleLeadSelect = function (checkbox) {
    if (checkbox.checked) {
        selectedLeadIds.add(checkbox.value);
    } else {
        selectedLeadIds.delete(checkbox.value);
    }
    updateSyncButton();
};

// 更新同步按钮状态
function updateSyncButton() {
    const syncBtn = document.getElementById('sync-selected-btn');
    if (syncBtn) {
        syncBtn.disabled = selectedLeadIds.size === 0;
        syncBtn.textContent = selectedLeadIds.size > 0
            ? `同步选中到CRM (${selectedLeadIds.size})`
            : '同步选中到CRM';
    }
}

// 批量同步到CRM
async function handleSyncToCrm() {
    if (selectedLeadIds.size === 0) return;

    const leadIds = Array.from(selectedLeadIds);

    try {
        const result = await fetchAPI('/api/import/leads/sync-crm', {
            method: 'POST',
            body: JSON.stringify({ leadIds })
        });

        if (result && result.success) {
            showNotification(`已将 ${result.count} 条线索加入CRM同步队列`, 'success');
            selectedLeadIds.clear();
            updateSyncButton();
            await loadImportLeads(currentPage);
        } else {
            showNotification(result?.error || '同步失败', 'error');
        }
    } catch (err) {
        showNotification('同步请求失败: ' + err.message, 'error');
    }
}

// 同步单个线索
window.syncSingleLead = async function (leadId) {
    try {
        const result = await fetchAPI('/api/import/leads/sync-crm', {
            method: 'POST',
            body: JSON.stringify({ leadIds: [leadId] })
        });

        if (result && result.success) {
            showNotification('已加入CRM同步队列', 'success');
            await loadImportLeads(currentPage);
        } else {
            showNotification(result?.error || '同步失败', 'error');
        }
    } catch (err) {
        showNotification('同步请求失败: ' + err.message, 'error');
    }
};

// 按任务筛选
window.filterByTask = function (taskId) {
    loadImportLeads(1, taskId);
};

// 跳转页面
window.goToPage = function (page) {
    loadImportLeads(page);
};

// 导出供HTML调用
window.loadImportLeads = loadImportLeads;
window.loadImportTasks = loadImportTasks;
