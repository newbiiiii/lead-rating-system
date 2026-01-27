
let currentPage = 1;
const pageSize = 20;

export async function init() {
    console.log('High Quality Leads Module Initialized');

    // Attach global functions to window so HTML onclick handlers can find them
    window.searchLeads = searchLeads;
    window.resetFilters = resetFilters;
    window.changePage = changePage;

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

async function searchLeads(page = 1) {
    currentPage = page;
    const body = document.getElementById('leads-table-body');
    if (!body) return;

    const loadingHtml = `
        <tr>
            <td colspan="5" class="py-20 text-center text-[#86868b]">
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
                <td colspan="5" class="py-20 text-center text-rose-500">
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
                <td colspan="5" class="py-20 text-center text-[#86868b]">
                    没有找到符合条件的线索
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = leads.map(lead => `
        <tr class="border-b border-gray-50 hover:bg-gray-50/50 transition-colors group">
            <td class="py-4 px-6 align-top">
                <div class="font-bold text-[#1D1D1F] text-[15px] cursor-pointer hover:text-[#007AFF] transition-colors" onclick="window.location.hash='#leads/${lead.id}'">
                    ${lead.companyName || 'Unknown Company'}
                </div>
                ${lead.website ? `
                    <a href="${lead.website.startsWith('http') ? lead.website : 'https://' + lead.website}" 
                       target="_blank" 
                       rel="noopener noreferrer"
                       class="text-xs text-[#86868b] hover:text-[#007AFF] hover:underline mt-1 block truncate max-w-[220px] flex items-center gap-1">
                       <svg class="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                       ${lead.website}
                    </a>
                ` : ''}
                ${lead.taskName ? `<div class="text-[10px] text-gray-400 mt-1 flex items-center gap-1" title="来源任务"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg> ${lead.taskName}</div>` : ''}
                ${lead.domain ? `<div class="text-[11px] text-gray-400 mt-0.5">${lead.domain}</div>` : ''}
            </td>
            <td class="py-4 px-6 align-top">
                ${renderRatingBadge(lead.overallRating)}
            </td>
            <td class="py-4 px-6 align-top">
                 <div class="text-xs font-medium text-[#1D1D1F] mb-1">
                    ${lead.industry || '<span class="text-gray-300">-</span>'}
                </div>
                <div class="text-xs text-[#86868b]">
                    ${lead.region || '<span class="text-gray-300">-</span>'}
                </div>
            </td>
            <td class="py-4 px-6 align-top">
                ${renderContacts(lead.contacts)}
            </td>
             <td class="py-4 px-6 align-top">
                <div class="text-xs text-[#555] bg-gray-50 p-2 rounded-lg border border-gray-100 line-clamp-3 leading-relaxed" title="${lead.suggestion || ''}">
                    ${lead.suggestion || lead.think || '暂无分析'}
                </div>
            </td>
            <td class="py-4 px-6 align-top text-right">
                <div class="text-xs font-medium text-[#1D1D1F] mb-1 px-2 py-0.5 bg-gray-100 rounded inline-block">${lead.source}</div>
                <div class="text-xs text-[#86868b] mt-1">${new Date(lead.createdAt).toLocaleDateString()}</div>
                <div class="mt-2">
                    ${renderSyncStatus(lead.crmSyncStatus)}
                </div>
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
    if (status === 'synced') return '<span class="text-[10px] font-medium text-green-700 bg-green-50 border border-green-100 px-1.5 py-0.5 rounded-md flex items-center justify-end gap-1 ml-auto w-fit">已同步 <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span></span>';
    if (status === 'failed') return '<span class="text-[10px] font-medium text-red-700 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-md flex items-center justify-end gap-1 ml-auto w-fit">失败 <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span></span>';
    return '<span class="text-[10px] text-gray-400">未同步</span>';
}

function renderContacts(contacts) {
    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
        return '<span class="text-gray-300 text-xs">-</span>';
    }

    // Show top 2 contacts
    const topContacts = contacts.slice(0, 2);
    const remaining = contacts.length - 2;

    let html = '<div class="space-y-2">';

    topContacts.forEach(contact => {
        if (!contact.name && !contact.email && !contact.phone) return;

        html += `
            <div class="flex flex-col gap-0.5">
                ${contact.name ? `<div class="text-xs font-medium text-[#1D1D1F]">${contact.name} <span class="text-gray-400 font-normal scale-90 inline-block ml-1">${contact.title || ''}</span></div>` : ''}
                ${contact.email ? `<a href="mailto:${contact.email}" class="text-[10px] text-[#007AFF] hover:underline flex items-center gap-1"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>${contact.email}</a>` : ''}
                ${contact.phone ? `<a href="tel:${contact.phone}" class="text-[10px] text-[#86868b] hover:text-[#1D1D1F] flex items-center gap-1"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>${contact.phone}</a>` : ''}
            </div>
        `;
    });

    if (remaining > 0) {
        html += `<div class="text-[10px] text-[#86868b] mt-1">+${remaining} 更多联系人</div>`;
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
                class="w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium transition-all ${i === pagination.page
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

function changePage(page) {
    if (page < 1) return;
    searchLeads(page);
}

function resetFilters() {
    const inputs = ['filter-keywords', 'filter-rating', 'filter-industry', 'filter-region', 'filter-source', 'filter-start-date', 'filter-end-date'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    searchLeads(1);
}
