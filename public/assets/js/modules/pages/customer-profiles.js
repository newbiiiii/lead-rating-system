
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

    const baseClass = "px-5 py-2 rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap";
    const activeClass = "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/25";
    const inactiveClass = "bg-white text-slate-600 border border-slate-200 hover:border-indigo-200 hover:text-indigo-600 hover:bg-indigo-50/50 hover:shadow-sm";

    let html = `
        <button class="${baseClass} ${!currentBusinessLineId ? activeClass : inactiveClass}" 
                data-business-line="" onclick="switchBusinessLine(null)">
            全部
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
            <div class="text-center py-10 text-slate-400">
                <svg class="w-8 h-8 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                </svg>
                <p class="text-sm">暂无业务线，请先导入默认配置或手动创建</p>
            </div>`;
        return;
    }

    let html = '';
    businessLines.forEach(bl => {
        html += `
            <div class="flex justify-between items-center p-4 bg-gradient-to-r from-slate-50 to-white rounded-xl border border-slate-100 hover:border-indigo-200 hover:shadow-sm transition-all duration-200 group">
                <div class="flex flex-col gap-1">
                    <strong class="text-sm font-semibold text-slate-700 group-hover:text-indigo-600 transition-colors">${bl.displayName}</strong>
                    <span class="text-xs text-slate-400">标识: ${bl.name} | API Key: ${bl.apiKey || '-'} | 排序: ${bl.sortOrder}</span>
                </div>
                <div class="flex gap-2 opacity-70 group-hover:opacity-100 transition-opacity">
                    <button class="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 bg-white hover:bg-indigo-50 rounded-lg border border-slate-200 hover:border-indigo-200 transition-all" onclick="editBusinessLine('${bl.id}')">编辑</button>
                    ${bl.isActive
                ? `<button class="px-3 py-1.5 text-xs font-medium text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-all" onclick="deleteBusinessLine('${bl.id}')">停用</button>`
                : `<button class="px-3 py-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-all" onclick="enableBusinessLine('${bl.id}')">启用</button>`
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
        <div class="col-span-full py-16 text-center text-slate-400">
            <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-100 mb-4">
                <svg class="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
            </div>
            <p class="text-sm">加载中...</p>
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
            <div class="col-span-full py-20 text-center">
                <div class="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 mb-6">
                    <svg class="w-10 h-10 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
                    </svg>
                </div>
                <p class="text-slate-500 mb-6 text-base">暂无客户画像</p>
                <div class="flex justify-center gap-4">
                    <button class="px-5 py-2.5 text-sm font-medium text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all hover:shadow-md" onclick="migrateFromConfig()">导入默认配置</button>
                    <button class="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 rounded-xl shadow-lg shadow-indigo-500/25 hover:shadow-xl transition-all" onclick="openProfileModal()">新建画像</button>
                </div>
            </div>
        `;
        return;
    }

    let html = '';
    profiles.forEach(profile => {
        const keywordsHtml = (profile.keywords || []).slice(0, 5).map(kw =>
            `<span class="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200/50 keyword-tag whitespace-nowrap hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-colors cursor-default" data-keyword="${kw.toLowerCase()}">${kw}</span>`
        ).join('');
        const moreKeywords = (profile.keywords || []).length > 5
            ? `<span class="px-2.5 py-1 rounded-lg text-xs font-medium bg-gradient-to-r from-slate-50 to-slate-100 text-slate-400 border border-slate-200/50">+${profile.keywords.length - 5}</span>`
            : '';

        const keywordsJson = JSON.stringify((profile.keywords || []).map(k => k.toLowerCase()));

        html += `
            <div class="bg-white rounded-2xl p-6 border border-slate-100 hover:border-indigo-200 shadow-sm hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-300 group profile-card relative overflow-hidden" data-keywords='${keywordsJson}'>
                <div class="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-indigo-50 to-violet-50 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div class="relative">
                    <div class="flex justify-between items-start mb-4">
                        <h4 class="text-base font-bold text-slate-800 group-hover:text-indigo-600 transition-colors line-clamp-1 flex-1" title="${profile.displayName || profile.name}">${profile.displayName || profile.name}</h4>
                        <span class="text-[10px] px-2.5 py-1 rounded-full bg-gradient-to-r from-indigo-50 to-violet-50 text-indigo-600 font-semibold border border-indigo-100 whitespace-nowrap ml-3">${profile.businessLine?.displayName || '-'}</span>
                    </div>
                    <div class="flex flex-wrap gap-2 mb-5 min-h-[44px] content-start">
                        ${keywordsHtml}
                        ${moreKeywords}
                    </div>
                    <div class="flex items-center gap-3 text-xs text-slate-400 mb-5 pt-4 border-t border-slate-100">
                        <span class="flex items-center gap-1.5">
                            <span class="w-2 h-2 rounded-full ${profile.isActive ? 'bg-emerald-500 shadow-lg shadow-emerald-500/30' : 'bg-rose-400'}"></span>
                            <span class="font-medium ${profile.isActive ? 'text-emerald-600' : 'text-rose-500'}">${profile.isActive ? '已启用' : '已停用'}</span>
                        </span>
                        <span class="text-slate-200">|</span>
                        <span>排序: ${profile.sortOrder}</span>
                    </div>
                    <div class="flex justify-end gap-2 pt-4 border-t border-slate-100 opacity-100 lg:opacity-60 lg:group-hover:opacity-100 transition-opacity">
                        <button class="px-4 py-2 text-xs font-medium text-slate-600 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 rounded-lg border border-transparent hover:border-indigo-200 transition-all" onclick="viewProfile('${profile.id}')">查看</button>
                        <button class="px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-lg shadow-md shadow-indigo-500/20 hover:shadow-lg transition-all" onclick="editProfile('${profile.id}')">编辑</button>
                        ${profile.isActive
                ? `<button class="px-4 py-2 text-xs font-medium text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-all" onclick="deleteProfile('${profile.id}')">停用</button>`
                : `<button class="px-4 py-2 text-xs font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-all" onclick="enableProfile('${profile.id}')">启用</button>`
            }
                    </div>
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
            card.classList.remove('ring-2', 'ring-emerald-400', 'shadow-xl', 'shadow-emerald-500/20', 'scale-[1.02]');
            card.classList.remove('opacity-30', 'grayscale', 'scale-95');
            // Reset keywords
            card.querySelectorAll('.keyword-tag').forEach(tag => {
                tag.classList.remove('bg-emerald-500', '!text-white', 'border-emerald-400', 'ring-2', 'ring-emerald-300/50', 'shadow-md');
                tag.classList.add('bg-slate-100', 'text-slate-600', 'border-slate-200/50');
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
                card.classList.add('ring-2', 'ring-emerald-400', 'shadow-xl', 'shadow-emerald-500/20', 'scale-[1.02]');
                card.classList.remove('opacity-30', 'grayscale', 'scale-95');
                hasMatch = true;

                // Highlight Keyword
                card.querySelectorAll('.keyword-tag').forEach(tag => {
                    const tagKw = tag.dataset.keyword;
                    if (tagKw === matchedKeyword) {
                        tag.classList.remove('bg-slate-100', 'text-slate-600', 'border-slate-200/50');
                        tag.classList.add('bg-emerald-500', '!text-white', 'border-emerald-400', 'ring-2', 'ring-emerald-300/50', 'shadow-md');
                    } else {
                        tag.classList.remove('bg-emerald-500', '!text-white', 'border-emerald-400', 'ring-2', 'ring-emerald-300/50', 'shadow-md');
                        tag.classList.add('bg-slate-100', 'text-slate-600', 'border-slate-200/50');
                    }
                });
            } else {
                // Add Dimmed Styles
                card.classList.remove('ring-2', 'ring-emerald-400', 'shadow-xl', 'shadow-emerald-500/20', 'scale-[1.02]');
                card.classList.add('opacity-30', 'grayscale', 'scale-95');

                // Reset Keyword highlights
                card.querySelectorAll('.keyword-tag').forEach(tag => {
                    tag.classList.remove('bg-emerald-500', '!text-white', 'border-emerald-400', 'ring-2', 'ring-emerald-300/50', 'shadow-md');
                    tag.classList.add('bg-slate-100', 'text-slate-600', 'border-slate-200/50');
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
                class="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow">
            上一页
        </button>`;

    // 页码
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            const isActive = i === currentPage;
            const activeClass = "bg-gradient-to-r from-indigo-600 to-violet-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/25";
            const inactiveClass = "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 shadow-sm hover:shadow";

            html += `<button onclick="goToPage(${i})"
                        class="px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${isActive ? activeClass : inactiveClass}">
                    ${i}
                </button>`;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            html += '<span class="px-2 text-slate-300">...</span>';
        }
    }

    // 下一页
    html += `<button onclick="goToPage(${currentPage + 1})"
                ${currentPage === totalPages ? 'disabled' : ''}
                class="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow">
            下一页
        </button>`;

    html += `<span class="ml-6 text-sm text-slate-400">共 ${total} 条 · 第 ${currentPage}/${totalPages} 页</span>`;
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
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-sm ring-1 ring-white/10">
            ${kw}
            ${!isReadOnly ? `<button type="button" onclick="removeKeyword(${index})" class="hover:text-red-200 transition-colors bg-white/10 rounded-full w-4 h-4 flex items-center justify-center -mr-1">×</button>` : ''}
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
