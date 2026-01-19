
// Customer Profiles 页面逻辑模块
import { fetchAPI, postAPI, putAPI, deleteAPI } from '../api.js';
import { formatDate, showToast } from '../utils.js';

console.log('📝 Customer Profiles module loaded');

// 状态
let businessLines = [];
let currentBusinessLineId = null;
let currentPage = 1;
let pageSize = 20;
let currentKeywords = [];

export async function init() {
    console.log('🚀 Customer Profiles init() called');
    // 加载业务线和画像
    await loadBusinessLines();
    await loadProfiles();

    // 绑定关键词输入事件
    const keywordInput = document.getElementById('keyword-input');
    if (keywordInput) {
        keywordInput.addEventListener('keydown', handleKeywordInput);
    }
}

// ============================================================
// 业务线管理
// ============================================================

async function loadBusinessLines() {
    try {
        const response = await fetchAPI('/api/profiles/business-lines?includeInactive=true');
        if (response && response.success) {
            businessLines = response.data;
            renderBusinessLineTabs();
            renderBusinessLineSelect();
            renderBusinessLineList();
        }
    } catch (error) {
        console.error('加载业务线失败:', error);
    }
}

function renderBusinessLineTabs() {
    const tabsContainer = document.getElementById('business-line-tabs');
    if (!tabsContainer) return;

    let html = `
        <button class="tab-item ${!currentBusinessLineId ? 'active' : ''}" 
                data-business-line="" onclick="switchBusinessLine(null)">
            全部
        </button>
    `;

    businessLines.filter(bl => bl.isActive).forEach(bl => {
        html += `
            <button class="tab-item ${currentBusinessLineId === bl.id ? 'active' : ''}" 
                    data-business-line="${bl.id}" onclick="switchBusinessLine('${bl.id}')">
                ${bl.displayName}
            </button>
        `;
    });

    tabsContainer.innerHTML = html;
}

function renderBusinessLineSelect() {
    const select = document.getElementById('profile-business-line');
    if (!select) return;

    let html = '<option value="">请选择业务线</option>';
    businessLines.filter(bl => bl.isActive).forEach(bl => {
        html += `<option value="${bl.id}">${bl.displayName}</option>`;
    });

    select.innerHTML = html;
}

function renderBusinessLineList() {
    const container = document.getElementById('business-line-list');
    if (!container) return;

    if (businessLines.length === 0) {
        container.innerHTML = '<div class="empty-state-card">暂无业务线，请先导入默认配置或手动创建</div>';
        return;
    }

    let html = '';
    businessLines.forEach(bl => {
        html += `
            <div class="business-line-item">
                <div class="business-line-info">
                    <strong>${bl.displayName}</strong>
                    <span>标识: ${bl.name} | API Key: ${bl.apiKey || '-'} | 排序: ${bl.sortOrder}</span>
                </div>
                <div class="business-line-actions">
                    <button class="btn-secondary btn-sm" onclick="editBusinessLine('${bl.id}')">编辑</button>
                    ${bl.isActive
                ? `<button class="btn-danger btn-sm" onclick="deleteBusinessLine('${bl.id}')">停用</button>`
                : `<button class="btn-success btn-sm" onclick="enableBusinessLine('${bl.id}')">启用</button>`
            }
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function switchBusinessLine(businessLineId) {
    currentBusinessLineId = businessLineId;
    currentPage = 1;
    renderBusinessLineTabs();
    loadProfiles();
}

function openBusinessLineModal() {
    document.getElementById('business-line-modal').style.display = 'block';
    resetBusinessLineForm();
    renderBusinessLineList();
}

function closeBusinessLineModal() {
    document.getElementById('business-line-modal').style.display = 'none';
}

function resetBusinessLineForm() {
    document.getElementById('business-line-id').value = '';
    document.getElementById('business-line-name').value = '';
    document.getElementById('business-line-display-name').value = '';
    document.getElementById('business-line-api-key').value = '';
    document.getElementById('business-line-sort-order').value = '0';
    document.getElementById('business-line-description').value = '';
    document.getElementById('business-line-form-title').textContent = '新建业务线';
}

async function editBusinessLine(id) {
    const bl = businessLines.find(b => b.id === id);
    if (!bl) return;

    document.getElementById('business-line-id').value = bl.id;
    document.getElementById('business-line-name').value = bl.name;
    document.getElementById('business-line-display-name').value = bl.displayName;
    document.getElementById('business-line-api-key').value = bl.apiKey || '';
    document.getElementById('business-line-sort-order').value = bl.sortOrder || 0;
    document.getElementById('business-line-description').value = bl.description || '';
    document.getElementById('business-line-form-title').textContent = '编辑业务线';
}

async function saveBusinessLine(event) {
    event.preventDefault();

    const id = document.getElementById('business-line-id').value;
    const data = {
        name: document.getElementById('business-line-name').value,
        displayName: document.getElementById('business-line-display-name').value,
        apiKey: document.getElementById('business-line-api-key').value ? parseInt(document.getElementById('business-line-api-key').value) : null,
        sortOrder: parseInt(document.getElementById('business-line-sort-order').value) || 0,
        description: document.getElementById('business-line-description').value || null,
    };

    try {
        let response;
        if (id) {
            response = await putAPI(`/api/profiles/business-lines/${id}`, data);
        } else {
            response = await postAPI('/api/profiles/business-lines', data);
        }

        if (response && response.success) {
            showToast(id ? '业务线已更新' : '业务线已创建', 'success');
            await loadBusinessLines();
            resetBusinessLineForm();
        } else {
            showToast(response?.error || '操作失败', 'error');
        }
    } catch (error) {
        console.error('保存业务线失败:', error);
        showToast('保存失败: ' + error.message, 'error');
    }
}

async function deleteBusinessLine(id) {
    if (!confirm('确定要停用该业务线吗？')) return;

    try {
        const response = await deleteAPI(`/api/profiles/business-lines/${id}`);
        if (response && response.success) {
            showToast('业务线已停用', 'success');
            await loadBusinessLines();
            await loadProfiles();
        }
    } catch (error) {
        console.error('停用业务线失败:', error);
        showToast('操作失败', 'error');
    }
}

async function enableBusinessLine(id) {
    try {
        const response = await putAPI(`/api/profiles/business-lines/${id}`, { isActive: true });
        if (response && response.success) {
            showToast('业务线已启用', 'success');
            await loadBusinessLines();
        }
    } catch (error) {
        console.error('启用业务线失败:', error);
        showToast('操作失败', 'error');
    }
}

// ============================================================
// 客户画像管理
// ============================================================

async function loadProfiles() {
    const container = document.getElementById('profile-grid');
    if (!container) return;

    container.innerHTML = '<div class="loading-state">加载中...</div>';

    try {
        let url = `/api/profiles?page=${currentPage}&pageSize=${pageSize}&includeInactive=true`;
        if (currentBusinessLineId) {
            url += `&businessLineId=${currentBusinessLineId}`;
        }

        const response = await fetchAPI(url);

        if (response && response.success) {
            renderProfiles(response.data, response.total);
        } else {
            container.innerHTML = '<div class="empty-state-card">加载失败</div>';
        }
    } catch (error) {
        console.error('加载画像失败:', error);
        container.innerHTML = '<div class="empty-state-card">加载失败</div>';
    }
}

function renderProfiles(profiles, total) {
    const container = document.getElementById('profile-grid');
    if (!container) return;

    if (!profiles || profiles.length === 0) {
        container.innerHTML = `
            <div class="empty-state-card">
                暂无客户画像
                <br><br>
                <button class="btn-secondary" onclick="migrateFromConfig()">导入默认配置</button>
                或
                <button class="btn-primary" onclick="openProfileModal()">新建画像</button>
            </div>
        `;
        return;
    }

    let html = '';
    profiles.forEach(profile => {
        const keywordsHtml = (profile.keywords || []).slice(0, 5).map(kw =>
            `<span class="keyword-tag">${kw}</span>`
        ).join('');
        const moreKeywords = (profile.keywords || []).length > 5
            ? `<span class="keyword-tag">+${profile.keywords.length - 5}</span>`
            : '';

        html += `
            <div class="profile-card">
                <div class="profile-card-header">
                    <h4 class="profile-card-title">${profile.displayName || profile.name}</h4>
                    <span class="profile-card-business-line">${profile.businessLine?.displayName || '-'}</span>
                </div>
                <div class="profile-card-keywords">
                    ${keywordsHtml}
                    ${moreKeywords}
                </div>
                <div class="profile-card-status">
                    <span class="status-badge ${profile.isActive ? 'active' : 'inactive'}"></span>
                    ${profile.isActive ? '已启用' : '已停用'}
                    &nbsp;|&nbsp;
                    排序: ${profile.sortOrder}
                </div>
                <div class="profile-card-actions">
                    <button class="btn-secondary btn-sm" onclick="viewProfile('${profile.id}')">查看</button>
                    <button class="btn-primary btn-sm" onclick="editProfile('${profile.id}')">编辑</button>
                    ${profile.isActive
                ? `<button class="btn-danger btn-sm" onclick="deleteProfile('${profile.id}')">停用</button>`
                : `<button class="btn-success btn-sm" onclick="enableProfile('${profile.id}')">启用</button>`
            }
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    // 更新分页
    renderPagination(total);
}

function renderPagination(total) {
    const container = document.getElementById('profile-pagination');
    if (!container) return;

    const totalPages = Math.ceil(total / pageSize);
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '<div style="display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 20px;">';

    // 上一页
    html += `<button onclick="goToPage(${currentPage - 1})" 
                ${currentPage === 1 ? 'disabled' : ''}
                style="padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--card-bg); cursor: ${currentPage === 1 ? 'not-allowed' : 'pointer'};">
            上一页
        </button>`;

    // 页码
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            html += `<button onclick="goToPage(${i})" 
                        style="padding: 8px 12px; border: 1px solid ${i === currentPage ? 'var(--primary)' : 'var(--border)'}; border-radius: 6px; background: ${i === currentPage ? 'linear-gradient(135deg, #667eea, #764ba2)' : 'var(--card-bg)'}; color: ${i === currentPage ? 'white' : 'inherit'}; cursor: pointer;">
                    ${i}
                </button>`;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            html += '<span style="padding: 8px;">...</span>';
        }
    }

    // 下一页
    html += `<button onclick="goToPage(${currentPage + 1})" 
                ${currentPage === totalPages ? 'disabled' : ''}
                style="padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--card-bg); cursor: ${currentPage === totalPages ? 'not-allowed' : 'pointer'};">
            下一页
        </button>`;

    html += `<span style="margin-left: 16px; color: var(--text-secondary);">共 ${total} 条，第 ${currentPage}/${totalPages} 页</span>`;
    html += '</div>';

    container.innerHTML = html;
}

function goToPage(page) {
    currentPage = page;
    loadProfiles();
}

// ============================================================
// 画像编辑
// ============================================================

const isProfileModalReadOnly = false; // Add state to track mode if needed, or just use the arguments

function openProfileModal(profile = null, isReadOnly = false) {
    const modal = document.getElementById('profile-modal');
    const form = document.getElementById('profile-form');
    const saveBtn = form.querySelector('button[type="submit"]');
    const keywordInput = document.getElementById('keyword-input');

    modal.style.display = 'block';

    // Set read-only state
    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
        if (input.id === 'keyword-input') return; // Handle separately
        input.disabled = isReadOnly;
    });

    if (isReadOnly) {
        saveBtn.style.display = 'none';
        keywordInput.parentElement.style.display = 'none'; // Hide keyword input container
    } else {
        saveBtn.style.display = 'block';
        keywordInput.parentElement.style.display = 'block';
    }

    if (profile) {
        document.getElementById('profile-modal-title').textContent = isReadOnly ? '查看客户画像' : '编辑客户画像';
        document.getElementById('profile-id').value = profile.id;
        document.getElementById('profile-business-line').value = profile.businessLineId;
        document.getElementById('profile-name').value = profile.name;
        document.getElementById('profile-display-name').value = profile.displayName || '';
        document.getElementById('profile-description').value = profile.description || '';
        document.getElementById('profile-rating-prompt').value = profile.ratingPrompt;
        document.getElementById('profile-sort-order').value = profile.sortOrder || 0;
        document.getElementById('profile-is-active').checked = profile.isActive;
        currentKeywords = [...profile.keywords];
    } else {
        document.getElementById('profile-modal-title').textContent = '新建客户画像';
        document.getElementById('profile-form').reset();
        document.getElementById('profile-id').value = '';
        document.getElementById('profile-is-active').checked = true;
        currentKeywords = [];

        // New profile is never read-only
        inputs.forEach(input => input.disabled = false);
        saveBtn.style.display = 'block';
        keywordInput.parentElement.style.display = 'block';
    }

    renderKeywords(isReadOnly);
}

function closeProfileModal() {
    document.getElementById('profile-modal').style.display = 'none';
}

function renderKeywords(isReadOnly = false) {
    const container = document.getElementById('keywords-list');
    if (!container) return;

    container.innerHTML = currentKeywords.map((kw, index) => `
        <span class="keyword-item">
            ${kw}
            ${!isReadOnly ? `<button type="button" onclick="removeKeyword(${index})">×</button>` : ''}
        </span>
    `).join('');
}

function handleKeywordInput(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        const input = event.target;
        const value = input.value.trim();

        if (value && !currentKeywords.includes(value)) {
            currentKeywords.push(value);
            renderKeywords();
        }

        input.value = '';
    }
}

function removeKeyword(index) {
    currentKeywords.splice(index, 1);
    renderKeywords();
}

async function getProfile(id) {
    try {
        const response = await fetchAPI(`/api/profiles/${id}`);
        return (response && response.success) ? response.data : null;
    } catch (error) {
        console.error('获取画像详情失败:', error);
        showToast('获取详情失败', 'error');
        return null;
    }
}

async function viewProfile(id) {
    const profile = await getProfile(id);
    if (profile) {
        openProfileModal(profile, true);
    }
}

async function editProfile(id) {
    const profile = await getProfile(id);
    if (profile) {
        openProfileModal(profile, false);
    }
}

async function saveProfile(event) {
    event.preventDefault();

    if (currentKeywords.length === 0) {
        showToast('请至少添加一个关键词', 'warning');
        return;
    }

    const id = document.getElementById('profile-id').value;
    const data = {
        businessLineId: document.getElementById('profile-business-line').value,
        name: document.getElementById('profile-name').value,
        displayName: document.getElementById('profile-display-name').value || null,
        description: document.getElementById('profile-description').value || null,
        keywords: currentKeywords,
        ratingPrompt: document.getElementById('profile-rating-prompt').value,
        sortOrder: parseInt(document.getElementById('profile-sort-order').value) || 0,
        isActive: document.getElementById('profile-is-active').checked,
    };

    try {
        let response;
        if (id) {
            response = await putAPI(`/api/profiles/${id}`, data);
        } else {
            response = await postAPI('/api/profiles', data);
        }

        if (response && response.success) {
            showToast(id ? '画像已更新' : '画像已创建', 'success');
            closeProfileModal();
            await loadProfiles();
        } else {
            showToast(response?.error || '操作失败', 'error');
        }
    } catch (error) {
        console.error('保存画像失败:', error);
        showToast('保存失败: ' + error.message, 'error');
    }
}

async function deleteProfile(id) {
    if (!confirm('确定要停用该客户画像吗？')) return;

    try {
        const response = await deleteAPI(`/api/profiles/${id}`);
        if (response && response.success) {
            showToast('画像已停用', 'success');
            await loadProfiles();
        }
    } catch (error) {
        console.error('停用画像失败:', error);
        showToast('操作失败', 'error');
    }
}

async function enableProfile(id) {
    try {
        const response = await putAPI(`/api/profiles/${id}`, { isActive: true });
        if (response && response.success) {
            showToast('画像已启用', 'success');
            await loadProfiles();
        }
    } catch (error) {
        console.error('启用画像失败:', error);
        showToast('操作失败', 'error');
    }
}

// ============================================================
// 数据迁移
// ============================================================

async function migrateFromConfig() {
    if (!confirm('将从系统默认配置导入业务线和客户画像，已存在的数据会被跳过。是否继续？')) {
        return;
    }

    try {
        const response = await postAPI('/api/profiles/migrate', {});

        if (response && response.success) {
            showToast(`导入完成: ${response.data.businessLinesCreated} 个业务线, ${response.data.profilesCreated} 个画像`, 'success');
            await loadBusinessLines();
            await loadProfiles();
        } else {
            showToast(response?.error || '导入失败', 'error');
        }
    } catch (error) {
        console.error('数据迁移失败:', error);
        showToast('导入失败: ' + error.message, 'error');
    }
}

// ============================================================
// 导出函数到全局
// ============================================================

window.switchBusinessLine = switchBusinessLine;
window.openBusinessLineModal = openBusinessLineModal;
window.closeBusinessLineModal = closeBusinessLineModal;
window.resetBusinessLineForm = resetBusinessLineForm;
window.editBusinessLine = editBusinessLine;
window.saveBusinessLine = saveBusinessLine;
window.deleteBusinessLine = deleteBusinessLine;
window.enableBusinessLine = enableBusinessLine;

window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.viewProfile = viewProfile;
window.editProfile = editProfile;
window.saveProfile = saveProfile;
window.deleteProfile = deleteProfile;
window.enableProfile = enableProfile;
window.removeKeyword = removeKeyword;

window.goToPage = goToPage;
window.migrateFromConfig = migrateFromConfig;
