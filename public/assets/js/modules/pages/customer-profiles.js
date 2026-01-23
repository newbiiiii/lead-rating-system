
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

    // Apple-style: Simple, text-based navigation or very subtle pills
    const baseClass = "px-4 py-2 rounded-lg text-[15px] font-medium transition-all duration-200 whitespace-nowrap";
    const activeClass = "text-[#1D1D1F] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]";
    const inactiveClass = "text-[#86868b] hover:text-[#1D1D1F] hover:bg-black/5";

    let html = `
        <button class="${baseClass} ${!currentBusinessLineId ? activeClass : inactiveClass}" 
                data-business-line="" onclick="switchBusinessLine(null)">
            All Profiles
        </button>
    `;

    businessLines.filter(bl => bl.isActive).forEach(bl => {
        const isActive = currentBusinessLineId === bl.id;
        html += `
            <button class="${baseClass} ${isActive ? activeClass : inactiveClass}" 
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
        container.innerHTML = `
            <div class="text-center py-10 text-gray-400">
                <div class="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                    </svg>
                </div>
                <p class="text-[13px] text-[#86868b]">No business lines found.</p>
            </div>`;
        return;
    }

    let html = '';
    businessLines.forEach(bl => {
        html += `
            <div class="flex justify-between items-center p-4 bg-white hover:bg-gray-50 rounded-2xl border border-gray-100 transition-all duration-200 group">
                <div class="flex flex-col gap-1">
                    <strong class="text-sm font-semibold text-[#1D1D1F]">${bl.displayName}</strong>
                    <div class="flex items-center gap-2 text-[11px] text-[#86868b]">
                        <span class="bg-gray-100 px-1.5 py-0.5 rounded text-[#1D1D1F] font-mono">${bl.name}</span>
                        <span>Sort: ${bl.sortOrder}</span>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button class="px-3 py-1.5 text-[11px] font-semibold text-[#1D1D1F] bg-white border border-gray-200 rounded-full hover:bg-gray-50 transition-colors" onclick="editBusinessLine('${bl.id}')">Edit</button>
                    ${bl.isActive
                ? `<button class="px-3 py-1.5 text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-full hover:bg-rose-100 transition-colors" onclick="deleteBusinessLine('${bl.id}')">Disable</button>`
                : `<button class="px-3 py-1.5 text-[11px] font-semibold text-[#1D1D1F] bg-green-50 border border-green-100 rounded-full hover:bg-green-100 transition-colors" onclick="enableBusinessLine('${bl.id}')">Enable</button>`
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
    const modal = document.getElementById('business-line-modal');
    modal.classList.remove('hidden');
    resetBusinessLineForm();
    renderBusinessLineList();
}

function closeBusinessLineModal() {
    document.getElementById('business-line-modal').classList.add('hidden');
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

    container.innerHTML = `
        <div class="col-span-full py-16 text-center text-[#86868b]">
            <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-4"></div>
            <p class="text-[13px] font-medium">Loading profiles...</p>
        </div>
    `;

    try {
        let url = `/api/profiles?page=${currentPage}&pageSize=${pageSize}&includeInactive=true`;
        if (currentBusinessLineId) {
            url += `&businessLineId=${currentBusinessLineId}`;
        }

        const response = await fetchAPI(url);

        if (response && response.success) {
            renderProfiles(response.data, response.total);
        } else {
            container.innerHTML = '<div class="col-span-full text-center text-rose-500 py-10">Failed to load profiles</div>';
        }
    } catch (error) {
        console.error('加载画像失败:', error);
        container.innerHTML = '<div class="col-span-full text-center text-rose-500 py-10">Failed to load profiles</div>';
    }
}

function renderProfiles(profiles, total) {
    const container = document.getElementById('profile-grid');
    if (!container) return;

    if (!profiles || profiles.length === 0) {
        container.innerHTML = `
             <div class="col-span-full py-24 text-center">
                <div class="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gray-50 mb-6">
                    <svg class="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
                    </svg>
                </div>
                <h3 class="text-xl font-bold text-[#1D1D1F] mb-2">No Profiles Found</h3>
                <p class="text-[#86868b] mb-8 text-[15px]">Get started by creating a new profile or importing defaults</p>
                <div class="flex justify-center gap-4">
                    <button class="apple-btn-secondary px-6 py-3 text-[15px] font-semibold" onclick="migrateFromConfig()">Import Defaults</button>
                    <button class="apple-btn-primary px-6 py-3 text-[15px] font-semibold" onclick="openProfileModal()">Create Profile</button>
                </div>
            </div>
        `;
        return;
    }

    let html = '';
    profiles.forEach((profile, idx) => {
        const keywordsHtml = (profile.keywords || []).slice(0, 4).map(kw =>
            `<span class="px-2.5 py-1 rounded-md text-[11px] font-medium bg-[#F5F5F7] text-[#1D1D1F] keyword-tag whitespace-nowrap" data-keyword="${kw.toLowerCase()}">${kw}</span>`
        ).join('');
        const moreKeywords = (profile.keywords || []).length > 4
            ? `<span class="px-2.5 py-1 rounded-md text-[11px] font-medium bg-[#F5F5F7] text-[#86868b]">+${profile.keywords.length - 4}</span>`
            : '';

        const keywordsJson = JSON.stringify((profile.keywords || []).map(k => k.toLowerCase()));

        // Stagger animation delay
        const delay = idx * 50;

        html += `
            <div class="apple-card p-6 flex flex-col h-full bg-white relative overflow-hidden group profile-card animate-fade-in-up" 
                 style="animation-delay: ${delay}ms; animation-fill-mode: both;"
                 data-keywords='${keywordsJson}'>
                
                <!-- Header -->
                <div class="flex justify-between items-start mb-5">
                    <div class="flex-1 min-w-0 pr-3">
                        <h4 class="text-[17px] font-semibold text-[#1D1D1F] truncate" title="${profile.displayName || profile.name}">
                            ${profile.displayName || profile.name}
                        </h4>
                        <div class="flex items-center gap-2 mt-1">
                            <span class="text-[13px] text-[#86868b]">
                                ${profile.businessLine?.displayName || 'Unknown'}
                            </span>
                            ${!profile.isActive ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-500">DISABLED</span>' : ''}
                        </div>
                    </div>
                </div>

                <!-- Keywords -->
                <div class="flex-1">
                    <div class="flex flex-wrap gap-2 content-start mb-4">
                        ${keywordsHtml}
                        ${moreKeywords}
                    </div>
                </div>

                <!-- Actions (Visible on Hover/Always visible but subtle) -->
                <div class="pt-5 mt-auto border-t border-gray-50 flex items-center justify-end gap-2">
                    <button class="px-3 py-1.5 text-[12px] font-semibold text-[#1D1D1F] hover:bg-gray-100 rounded-full transition-colors" onclick="viewProfile('${profile.id}')">
                        View
                    </button>
                    <button class="px-3 py-1.5 text-[12px] font-semibold text-[#007AFF] hover:bg-blue-50 rounded-full transition-colors" onclick="editProfile('${profile.id}')">
                        Edit
                    </button>
                    ${profile.isActive
                ? `<button class="p-1.5 text-[#86868b] hover:text-rose-600 transition-all" onclick="deleteProfile('${profile.id}')" title="Disable"><svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg></button>`
                : `<button class="p-1.5 text-[#86868b] hover:text-green-600 transition-all" onclick="enableProfile('${profile.id}')" title="Enable"><svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg></button>`
            }
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    renderPagination(total);
}

function handleMatchTest(value) {
    const cards = document.querySelectorAll('.profile-card');
    const input = value.toLowerCase().trim();

    if (!input) {
        cards.forEach(card => {
            // Reset state
            card.classList.remove('ring-2', 'ring-[#007AFF]', 'scale-[1.02]');
            card.classList.remove('opacity-30', 'grayscale', 'scale-95');
            // Reset keywords
            card.querySelectorAll('.keyword-tag').forEach(tag => {
                tag.classList.remove('bg-[#007AFF]', '!text-white');
                tag.classList.add('bg-[#F5F5F7]', 'text-[#1D1D1F]');
            });
        });
        return;
    }

    let hasMatch = false;

    cards.forEach(card => {
        try {
            const keywords = JSON.parse(card.dataset.keywords || '[]');
            const matchedKeyword = keywords.find(kw => input.includes(kw));

            if (matchedKeyword) {
                // Add Match Styles
                card.classList.add('ring-2', 'ring-[#007AFF]', 'scale-[1.02]');
                card.classList.remove('opacity-30', 'grayscale', 'scale-95');
                hasMatch = true;

                // Highlight Keyword
                card.querySelectorAll('.keyword-tag').forEach(tag => {
                    const tagKw = tag.dataset.keyword;
                    if (tagKw === matchedKeyword) {
                        tag.classList.remove('bg-[#F5F5F7]', 'text-[#1D1D1F]');
                        tag.classList.add('bg-[#007AFF]', '!text-white');
                    } else {
                        tag.classList.remove('bg-[#007AFF]', '!text-white');
                        tag.classList.add('bg-[#F5F5F7]', 'text-[#1D1D1F]');
                    }
                });
            } else {
                // Add Dimmed Styles
                card.classList.remove('ring-2', 'ring-[#007AFF]', 'scale-[1.02]');
                card.classList.add('opacity-30', 'grayscale', 'scale-95');

                // Reset Keyword highlights
                card.querySelectorAll('.keyword-tag').forEach(tag => {
                    tag.classList.remove('bg-[#007AFF]', '!text-white');
                    tag.classList.add('bg-[#F5F5F7]', 'text-[#1D1D1F]');
                });
            }
        } catch (e) {
            console.error('Error parsing keywords', e);
        }
    });
}

function renderPagination(total) {
    const container = document.getElementById('profile-pagination');
    if (!container) return;

    const totalPages = Math.ceil(total / pageSize);
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '<div class="flex justify-center items-center gap-2">';

    // 上一页
    html += `<button onclick="goToPage(${currentPage - 1})"
                ${currentPage === 1 ? 'disabled' : ''}
                class="w-10 h-10 rounded-full flex items-center justify-center bg-white border border-gray-100 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
        </button>`;

    // 页码
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            const isActive = i === currentPage;
            const activeClass = "bg-[#1D1D1F] text-white shadow-lg shadow-black/20 scale-110";
            const inactiveClass = "text-[#86868b] hover:text-[#1D1D1F]";

            html += `<button onclick="goToPage(${i})"
                        class="w-8 h-8 rounded-full text-sm font-medium transition-all flex items-center justify-center ${isActive ? activeClass : inactiveClass}">
                    ${i}
                </button>`;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            html += '<span class="w-8 text-center text-gray-300">...</span>';
        }
    }

    // 下一页
    html += `<button onclick="goToPage(${currentPage + 1})"
                ${currentPage === totalPages ? 'disabled' : ''}
                class="w-10 h-10 rounded-full flex items-center justify-center bg-white border border-gray-100 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
        </button>`;

    html += '</div>';
    html += `<div class="mt-4 text-center text-[11px] font-medium text-[#86868b] uppercase tracking-wide">Total ${total} items</div>`;

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

    modal.classList.remove('hidden');

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
    document.getElementById('profile-modal').classList.add('hidden');
}

function renderKeywords(isReadOnly = false) {
    const container = document.getElementById('keywords-list');
    if (!container) return;

    container.innerHTML = currentKeywords.map((kw, index) => `
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#007AFF] text-white shadow-sm ring-1 ring-white/10">
            ${kw}
            ${!isReadOnly ? `<button type="button" onclick="removeKeyword(${index})" class="hover:text-red-200 transition-colors bg-white/20 rounded-full w-4 h-4 flex items-center justify-center -mr-1">×</button>` : ''}
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
window.handleMatchTest = handleMatchTest;
