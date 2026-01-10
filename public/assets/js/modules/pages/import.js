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

    // 绑定示例数据按钮
    const sampleBtn = document.getElementById('import-sample-btn');
    if (sampleBtn) {
        sampleBtn.addEventListener('click', fillSampleData);
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

    // 加载数据
    await Promise.all([
        loadImportTasks(),
        loadImportLeads(1)
    ]);
}

// 填充示例数据
function fillSampleData() {
    const textarea = document.querySelector('textarea[name="data"]');
    if (textarea) {
        textarea.value = JSON.stringify([
            {
                "companyName": "ABC Manufacturing Co.",
                "website": "https://abc-manufacturing.com",
                "domain": "abc-manufacturing.com",
                "industry": "Manufacturing",
                "region": "United States",
                "address": "123 Industrial Blvd, Chicago, IL",
                "contactName": "John Smith",
                "contactTitle": "Purchasing Manager",
                "contactEmail": "john.smith@abc-manufacturing.com",
                "contactPhone": "+1-312-555-0101"
            },
            {
                "companyName": "XYZ Trading Ltd.",
                "website": "https://xyz-trading.co.uk",
                "domain": "xyz-trading.co.uk",
                "industry": "Trading",
                "region": "United Kingdom",
                "address": "45 Commerce Street, London",
                "contactName": "Jane Doe",
                "contactTitle": "Import Director",
                "contactEmail": "jane.doe@xyz-trading.co.uk",
                "contactPhone": "+44-20-7123-4567"
            }
        ], null, 2);
    }
}

// 处理导入表单提交
async function handleImportSubmit(e) {
    e.preventDefault();

    const form = e.target;
    const taskName = form.taskName.value.trim();
    const dataText = form.data.value.trim();

    // 验证JSON格式
    let data;
    try {
        data = JSON.parse(dataText);
    } catch (err) {
        showNotification('JSON格式错误，请检查数据格式', 'error');
        return;
    }

    if (!Array.isArray(data) || data.length === 0) {
        showNotification('请提供有效的数据数组', 'error');
        return;
    }

    // 验证每条数据必须有companyName
    for (let i = 0; i < data.length; i++) {
        if (!data[i].companyName) {
            showNotification(`第 ${i + 1} 条数据缺少 companyName 字段`, 'error');
            return;
        }
    }

    // 提交导入请求
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = '导入中...';

    try {
        const result = await fetchAPI('/api/import/leads', {
            method: 'POST',
            body: JSON.stringify({
                data,
                taskName: taskName || undefined
            })
        });

        if (result && result.success) {
            showNotification(`成功导入 ${result.count} 条线索`, 'success');
            form.reset();
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
