
let currentPage = 1;
const pageSize = 20;

export async function init() {
    console.log('High Quality Leads Module Initialized');

    // Attach global functions to window so HTML onclick handlers can find them
    window.searchLeads = searchLeads;
    window.resetFilters = resetFilters;
    window.changePage = changePage;
    window.exportLeads = exportLeads;
    window.toggleAdvancedFilters = toggleAdvancedFilters;

    // Load filter options
    await loadFilterOptions();

    // Perform initial search
    searchLeads(1);
}

async function loadFilterOptions() {
    try {
        const res = await fetch('/api/leads/filters');
        if (!res.ok) throw new Error('Failed to load filters');
        const data = await res.json();

        populateSelect('filter-industry', data.industries, '全部行业');
        populateSelect('filter-region', data.regions, '全部地区');
        populateSelect('filter-source', data.sources, '全部来源');
    } catch (error) {
        console.error('Error loading filters:', error);
    }
}

function populateSelect(id, items, defaultText) {
    const select = document.getElementById(id);
    if (!select) return;
    select.innerHTML = `<option value="">${defaultText}</option>`;

    if (items && Array.isArray(items)) {
        items.forEach(item => {
            if (item) {
                const option = document.createElement('option');
                option.value = item;
                option.textContent = item;
                select.appendChild(option);
            }
        });
    }
}

function toggleAdvancedFilters() {
    const advancedFilters = document.getElementById('advanced-filters');
    if (advancedFilters) {
        advancedFilters.classList.toggle('expanded');
    }
}

async function searchLeads(page = 1) {
    currentPage = page;
    const body = document.getElementById('leads-table-body');
    if (!body) return;

    const loadingHtml = `
        <tr>
            <td colspan="8" class="py-20 text-center text-[#86868b]">
                <div class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 mb-2"></div>
                <p>查询中...</p>
            </td>
        </tr>
    `;
    body.innerHTML = loadingHtml;

    const filters = {
        keywords: getInputVal('filter-keywords'),
        rating: getMultiSelectVal('filter-rating'),
        industry: getInputVal('filter-industry'),
        region: getInputVal('filter-region'),
        source: getInputVal('filter-source'),
        startDate: getInputVal('filter-start-date'),
        endDate: getInputVal('filter-end-date'),
        crmSyncStatus: getInputVal('filter-crm-status'),
        ratingStatus: getInputVal('filter-rating-status'),
        taskName: getInputVal('filter-task-name'),
        page: page,
        pageSize: pageSize
    };

    try {
        const res = await fetch('/api/leads/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(filters)
        });

        if (!res.ok) {
            const textHTML = await res.text();
            let errorMessage;
            try {
                const err = JSON.parse(textHTML);
                errorMessage = err.error;
            } catch (e) {
                console.warn('Non-JSON error response:', textHTML);
                errorMessage = `Server Error (${res.status})`;
            }
            throw new Error(errorMessage || 'Query failed');
        }

        const data = await res.json();
        renderTable(data.leads);
        renderPagination(data.pagination);
    } catch (error) {
        console.error('Search failed:', error);
        body.innerHTML = `
            <tr>
                <td colspan="8" class="py-20 text-center text-rose-500">
                    <p class="font-bold">查询失败</p>
                    <p class="text-sm mt-1">${error.message}</p>
                </td>
            </tr>
        `;
    }
}

function getInputVal(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}

function getMultiSelectVal(id) {
    const el = document.getElementById(id);
    if (!el) return [];
    return Array.from(el.selectedOptions).map(option => option.value);
}

function renderTable(leads) {
    const tbody = document.getElementById('leads-table-body');
    if (!tbody) return;

    if (!leads || leads.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="py-20 text-center text-[#86868b]">
                    没有找到符合条件的线索
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = leads.map(lead => `
        <tr class="border-b border-gray-50 hover:bg-gray-50/50 transition-colors group">
            <!-- 公司信息 -->
            <td class="py-3 px-3 align-top">
                <div class="font-bold text-[#1D1D1F] text-sm table-cell-nowrap cursor-pointer hover:text-[#007AFF] transition-colors"
                     onclick="window.location.hash='#leads/${lead.id}'"
                     title="${lead.companyName || 'Unknown Company'}">
                    ${lead.companyName || 'Unknown Company'}
                </div>
                ${lead.website ? `
                    <a href="${lead.website.startsWith('http') ? lead.website : 'https://' + lead.website}"
                       target="_blank"
                       rel="noopener noreferrer"
                       class="text-[10px] text-[#86868b] hover:text-[#007AFF] hover:underline mt-1 block table-cell-nowrap flex items-center gap-1"
                       title="${lead.website}">
                       <svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                       ${lead.website}
                    </a>
                ` : ''}
                ${lead.domain ? `<div class="text-[10px] text-gray-400 mt-0.5 table-cell-nowrap" title="${lead.domain}">${lead.domain}</div>` : ''}
                ${lead.address ? `<div class="text-[10px] text-gray-400 mt-0.5 table-cell-nowrap" title="${lead.address}">${lead.address}</div>` : ''}
            </td>

            <!-- 评分 -->
            <td class="py-3 px-3 align-top">
                ${renderRatingBadge(lead.overallRating)}
            </td>

            <!-- 业务信息 -->
            <td class="py-3 px-3 align-top">
                <div class="text-xs font-medium text-[#1D1D1F] mb-1 table-cell-nowrap" title="${lead.industry || ''}">
                    ${lead.industry || '<span class="text-gray-300">-</span>'}
                </div>
                <div class="text-xs text-[#86868b] table-cell-nowrap" title="${lead.region || ''}">
                    ${lead.region || '<span class="text-gray-300">-</span>'}
                </div>
            </td>

            <!-- 联系人 -->
            <td class="py-3 px-3 align-top">
                ${renderContacts(lead.contacts)}
            </td>

            <!-- AI建议 -->
            <td class="py-3 px-3 align-top">
                <div class="text-[11px] text-[#555] bg-gray-50 p-2 rounded-lg border border-gray-100 leading-relaxed overflow-hidden"
                     style="display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;"
                     title="${lead.suggestion || lead.think || ''}">
                    ${lead.suggestion || lead.think || '暂无分析'}
                </div>
            </td>

            <!-- 任务/来源 -->
            <td class="py-3 px-3 align-top">
                ${lead.taskName ? `
                    <div class="text-[10px] text-gray-600 mb-1 flex items-center gap-1 table-cell-nowrap" title="${lead.taskName}">
                        <svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
                        ${lead.taskName}
                    </div>
                ` : ''}
                <div class="text-xs font-medium text-[#1D1D1F] px-2 py-0.5 bg-gray-100 rounded inline-block table-cell-nowrap">
                    ${lead.source || '-'}
                </div>
            </td>

            <!-- CRM同步状态 -->
            <td class="py-3 px-3 align-top text-center">
                ${renderSyncStatus(lead.crmSyncStatus)}
            </td>

            <!-- 日期 -->
            <td class="py-3 px-3 align-top text-right">
                <div class="text-xs text-[#86868b] table-cell-nowrap">
                    ${new Date(lead.createdAt).toLocaleDateString('zh-CN')}
                </div>
                ${lead.ratedAt ? `
                    <div class="text-[10px] text-gray-400 mt-1 table-cell-nowrap">
                        评分: ${new Date(lead.ratedAt).toLocaleDateString('zh-CN')}
                    </div>
                ` : ''}
            </td>
        </tr>
    `).join('');
}

function renderRatingBadge(rating) {
    if (!rating) return '<span class="text-gray-300 text-xs font-mono">-</span>';
    const classes = {
        'S': 'badge-S',
        'A': 'badge-A',
        'B': 'badge-B',
        'C': 'badge-C',
        'D': 'badge-D'
    };
    return `<span class="badge ${classes[rating] || 'badge-C'} shadow-sm">${rating}</span>`;
}

function renderSyncStatus(status) {
    if (status === 'synced') {
        return `
            <span class="text-[10px] font-medium text-green-700 bg-green-50 border border-green-100 px-2 py-1 rounded-md inline-flex items-center gap-1">
                已同步
                <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>
            </span>
        `;
    }
    if (status === 'failed') {
        return `
            <span class="text-[10px] font-medium text-red-700 bg-red-50 border border-red-100 px-2 py-1 rounded-md inline-flex items-center gap-1">
                失败
                <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>
            </span>
        `;
    }
    if (status === 'pending') {
        return `
            <span class="text-[10px] font-medium text-yellow-700 bg-yellow-50 border border-yellow-100 px-2 py-1 rounded-md inline-flex items-center gap-1">
                待同步
                <span class="w-1.5 h-1.5 rounded-full bg-yellow-500"></span>
            </span>
        `;
    }
    return '<span class="text-[10px] text-gray-400">未同步</span>';
}

function renderContacts(contacts) {
    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
        return '<span class="text-gray-300 text-xs">-</span>';
    }

    // 过滤掉空联系人
    const validContacts = contacts.filter(c => c.name || c.email || c.phone || c.mobile);
    if (validContacts.length === 0) {
        return '<span class="text-gray-300 text-xs">-</span>';
    }

    // 显示最多3个联系人
    const displayContacts = validContacts.slice(0, 3);
    const remaining = validContacts.length - 3;

    let html = '<div class="space-y-1.5">';

    displayContacts.forEach(contact => {
        html += '<div class="contact-item">';

        // 姓名和职位
        if (contact.name) {
            html += `
                <div class="text-xs font-medium text-[#1D1D1F] table-cell-nowrap">
                    ${contact.name}
                    ${contact.title ? `<span class="text-gray-400 font-normal text-[10px] ml-1">${contact.title}</span>` : ''}
                </div>
            `;
        }

        // 邮箱
        if (contact.email) {
            html += `
                <a href="mailto:${contact.email}"
                   class="text-[10px] text-[#007AFF] hover:underline flex items-center gap-1 mt-0.5 table-cell-nowrap"
                   title="${contact.email}">
                    <svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                    ${contact.email}
                </a>
            `;
        }

        // 电话
        const phone = contact.phone || contact.mobile;
        if (phone) {
            html += `
                <a href="tel:${phone}"
                   class="text-[10px] text-[#86868b] hover:text-[#1D1D1F] flex items-center gap-1 mt-0.5 table-cell-nowrap"
                   title="${phone}">
                    <svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
                    ${phone}
                </a>
            `;
        }

        html += '</div>';
    });

    if (remaining > 0) {
        html += `<div class="text-[10px] text-[#86868b] mt-1">+${remaining} 个联系人</div>`;
    }

    html += '</div>';
    return html;
}

function renderPagination(pagination) {
    const container = document.getElementById('pagination');
    if (!container) return;

    if (pagination.totalPages <= 1) {
        container.innerHTML = `<span class="text-xs text-[#86868b]">共 ${pagination.total} 条结果</span>`;
        return;
    }

    let html = '';

    // Previous
    html += `
        <button
            onclick="window.changePage(${pagination.page - 1})"
            ${pagination.page === 1 ? 'disabled' : ''}
            class="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
        </button>
    `;

    // Pages logic
    let startPage = Math.max(1, pagination.page - 2);
    let endPage = Math.min(pagination.totalPages, startPage + 4);
    if (endPage - startPage < 4) {
        startPage = Math.max(1, endPage - 4);
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `
            <button
                onclick="window.changePage(${i})"
                class="w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium transition-all ${
                    i === pagination.page
                        ? 'bg-[#1D1D1F] text-white shadow-md transform scale-105'
                        : 'text-[#1D1D1F] hover:bg-gray-100'
                }">
                ${i}
            </button>
        `;
    }

    // Next
    html += `
        <button
            onclick="window.changePage(${pagination.page + 1})"
            ${pagination.page === pagination.totalPages ? 'disabled' : ''}
            class="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
        </button>
    `;

    html += `<span class="ml-4 text-xs text-[#86868b]">共 ${pagination.total} 条</span>`;

    container.innerHTML = html;
}

async function exportLeads() {
    const btn = document.getElementById('btn-export');
    const originalText = btn.innerHTML;

    try {
        btn.disabled = true;
        btn.innerHTML = `<div class="inline-block animate-spin rounded-full h-3 w-3 border-b-2 border-current mr-2"></div> 正在导出...`;

        const filters = {
            keywords: getInputVal('filter-keywords'),
            rating: getMultiSelectVal('filter-rating'),
            industry: getInputVal('filter-industry'),
            region: getInputVal('filter-region'),
            source: getInputVal('filter-source'),
            startDate: getInputVal('filter-start-date'),
            endDate: getInputVal('filter-end-date'),
            crmSyncStatus: getInputVal('filter-crm-status'),
            ratingStatus: getInputVal('filter-rating-status'),
            taskName: getInputVal('filter-task-name')
        };

        const res = await fetch('/api/leads/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(filters)
        });

        if (!res.ok) throw new Error('Export failed');

        // Handle file download
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `优质线索导出_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

    } catch (error) {
        console.error('Export failed:', error);
        alert('导出失败: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

function changePage(page) {
    if (page < 1) return;
    searchLeads(page);
}

function resetFilters() {
    const inputs = [
        'filter-keywords',
        'filter-rating',
        'filter-industry',
        'filter-region',
        'filter-source',
        'filter-start-date',
        'filter-end-date',
        'filter-crm-status',
        'filter-rating-status',
        'filter-task-name'
    ];

    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (el.tagName === 'SELECT' && el.multiple) {
                // Clear multi-select
                Array.from(el.options).forEach(opt => opt.selected = false);
            } else {
                el.value = '';
            }
        }
    });

    searchLeads(1);
}
