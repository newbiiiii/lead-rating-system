// 聚合任务页面逻辑模块
import { fetchAPI, postAPI } from '../api.js';
import { showNotification, formatDate, getStatusBadge } from '../utils.js';

// 状态存储
let currentStep = 1;
let keywords = [];
let selectedCities = [];
let countriesData = {};
let currentCountry = null;

export async function init() {
    // 加载国家数据
    await loadCountriesForSelection();

    // 绑定表单提交
    const form = document.querySelector('#aggregate-task-form');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }

    // 绑定手动添加关键词的回车事件
    const manualInput = document.getElementById('manual-keyword-input');
    if (manualInput) {
        manualInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addManualKeyword();
            }
        });
    }

    // 加载聚合任务列表
    await loadAggregateTasks();
}

// 生成关键词
window.generateKeywords = async function() {
    const description = document.getElementById('keyword-description').value.trim();
    if (!description) {
        showNotification('请先输入需求描述', 'warning');
        return;
    }

    const result = await postAPI('/api/aggregate-tasks/generate-keywords', {
        description,
        count: 20
    });

    if (result && result.success) {
        keywords = result.keywords;
        renderKeywordTags();
        document.getElementById('keyword-count-hint').textContent = `已生成 ${keywords.length} 个关键词`;
        showNotification(`成功生成 ${keywords.length} 个关键词`, 'success');
    }
};

// 手动添加关键词
window.addManualKeyword = function() {
    const input = document.getElementById('manual-keyword-input');
    const keyword = input.value.trim();

    if (!keyword) return;

    if (!keywords.includes(keyword)) {
        keywords.push(keyword);
        renderKeywordTags();
    }

    input.value = '';
};

// 移除关键词
window.removeKeyword = function(index) {
    keywords.splice(index, 1);
    renderKeywordTags();
};

// 渲染关键词标签
function renderKeywordTags() {
    const container = document.getElementById('keyword-tags-container');
    if (keywords.length === 0) {
        container.innerHTML = '<div class="empty-hint">请先输入需求描述并生成关键词</div>';
        return;
    }

    container.innerHTML = keywords.map((kw, index) => `
        <span class="keyword-tag">
            ${kw}
            <button type="button" class="remove-btn" onclick="removeKeyword(${index})">×</button>
        </span>
    `).join('');
}

// 加载国家列表用于选择
async function loadCountriesForSelection() {
    const data = await fetchAPI('/api/cities/countries');
    if (!data || !data.success) return;

    const container = document.getElementById('country-list');
    container.innerHTML = data.countries.map(country => `
        <div class="country-item" data-country="${country}" onclick="toggleCountry('${country}')">
            <input type="checkbox" id="country-${country}">
            <label>${country}</label>
        </div>
    `).join('');
}

// 切换国家选择
window.toggleCountry = async function(country) {
    currentCountry = country;

    // 更新国家选中状态
    document.querySelectorAll('.country-item').forEach(item => {
        item.classList.toggle('selected', item.dataset.country === country);
    });

    // 加载该国家的城市
    await loadCitiesForCountry(country);
};

// 加载指定国家的城市
async function loadCitiesForCountry(country) {
    const data = await fetchAPI(`/api/cities/${encodeURIComponent(country)}`);
    if (!data || !data.success) return;

    countriesData[country] = data.cities;

    const container = document.getElementById('city-list');
    container.innerHTML = data.cities.map(city => {
        const isSelected = selectedCities.some(c => c.country === country && c.city === city.name);
        return `
            <div class="city-item" onclick="toggleCity('${country}', '${city.name}', ${city.lat}, ${city.lng}, ${city.radius})">
                <input type="checkbox" ${isSelected ? 'checked' : ''}>
                <label>${city.name}</label>
            </div>
        `;
    }).join('');
}

// 切换城市选择
window.toggleCity = function(country, cityName, lat, lng, radius) {
    const index = selectedCities.findIndex(c => c.country === country && c.city === cityName);

    if (index > -1) {
        selectedCities.splice(index, 1);
    } else {
        selectedCities.push({ country, city: cityName, lat, lng, radius });
    }

    // 更新城市列表中的checkbox
    if (currentCountry === country) {
        loadCitiesForCountry(country);
    }

    // 更新已选择的城市显示
    renderSelectedCities();
};

// 全选当前国家的城市
window.selectAllCities = function() {
    if (!currentCountry || !countriesData[currentCountry]) return;

    const cities = countriesData[currentCountry];
    cities.forEach(city => {
        const exists = selectedCities.some(c => c.country === currentCountry && c.city === city.name);
        if (!exists) {
            selectedCities.push({
                country: currentCountry,
                city: city.name,
                lat: city.lat,
                lng: city.lng,
                radius: city.radius
            });
        }
    });

    loadCitiesForCountry(currentCountry);
    renderSelectedCities();
};

// 取消全选当前国家的城市
window.deselectAllCities = function() {
    if (!currentCountry) return;

    selectedCities = selectedCities.filter(c => c.country !== currentCountry);

    loadCitiesForCountry(currentCountry);
    renderSelectedCities();
};

// 渲染已选择的城市
function renderSelectedCities() {
    const container = document.getElementById('selected-cities-container');

    if (selectedCities.length === 0) {
        container.innerHTML = '<div class="empty-hint">暂无选择</div>';
        return;
    }

    container.innerHTML = selectedCities.map((city, index) => `
        <span class="selected-city-tag">
            ${city.city}, ${city.country}
            <button type="button" class="remove-btn" onclick="removeSelectedCity(${index})">×</button>
        </span>
    `).join('');
}

// 移除已选择的城市
window.removeSelectedCity = function(index) {
    const removed = selectedCities.splice(index, 1)[0];
    renderSelectedCities();

    // 如果当前正在查看该国家，更新城市列表
    if (removed && currentCountry === removed.country) {
        loadCitiesForCountry(currentCountry);
    }
};

// 搜索国家
window.filterCountries = function() {
    const searchTerm = document.getElementById('country-search').value.toLowerCase();
    const items = document.querySelectorAll('.country-item');

    items.forEach(item => {
        const country = item.dataset.country.toLowerCase();
        item.style.display = country.includes(searchTerm) ? '' : 'none';
    });
};

// 步骤导航
window.nextStep = function() {
    if (currentStep === 1 && keywords.length === 0) {
        showNotification('请先生成或添加关键词', 'warning');
        return;
    }
    if (currentStep === 2 && selectedCities.length === 0) {
        showNotification('请选择至少一个城市', 'warning');
        return;
    }

    if (currentStep < 3) {
        setStep(currentStep + 1);

        // 如果进入第3步，更新预览
        if (currentStep === 3) {
            updatePreview();
        }
    }
};

window.prevStep = function() {
    if (currentStep > 1) {
        setStep(currentStep - 1);
    }
};

function setStep(step) {
    currentStep = step;

    // 更新步骤指示器
    document.querySelectorAll('.step').forEach((el, index) => {
        const stepNum = index + 1;
        el.classList.remove('active', 'completed');
        if (stepNum === step) {
            el.classList.add('active');
        } else if (stepNum < step) {
            el.classList.add('completed');
        }
    });

    // 更新步骤内容
    document.querySelectorAll('.step-content').forEach(el => {
        el.classList.toggle('active', parseInt(el.dataset.step) === step);
    });

    // 更新按钮
    document.getElementById('prev-step-btn').style.display = step > 1 ? '' : 'none';
    document.getElementById('next-step-btn').style.display = step < 3 ? '' : 'none';
    document.getElementById('submit-btn').style.display = step === 3 ? '' : 'none';
}

// 更新预览
function updatePreview() {
    const taskName = document.getElementById('aggregate-task-name').value || '-';
    const taskCount = keywords.length * selectedCities.length;

    document.getElementById('summary-keywords-count').textContent = keywords.length;
    document.getElementById('summary-cities-count').textContent = selectedCities.length;
    document.getElementById('summary-tasks-count').textContent = taskCount;

    document.getElementById('preview-task-name').textContent = taskName;

    // 关键词预览（最多显示10个）
    const keywordsPreview = document.getElementById('preview-keywords');
    const displayKeywords = keywords.slice(0, 10);
    keywordsPreview.innerHTML = displayKeywords.map(kw => 
        `<span class="preview-tag">${kw}</span>`
    ).join('') + (keywords.length > 10 ? `<span class="preview-tag">+${keywords.length - 10} 更多</span>` : '');

    // 城市预览（最多显示10个）
    const citiesPreview = document.getElementById('preview-cities');
    const displayCities = selectedCities.slice(0, 10);
    citiesPreview.innerHTML = displayCities.map(city => 
        `<span class="preview-tag">${city.city}, ${city.country}</span>`
    ).join('') + (selectedCities.length > 10 ? `<span class="preview-tag">+${selectedCities.length - 10} 更多</span>` : '');
}

// 提交表单
async function handleFormSubmit(e) {
    e.preventDefault();

    const taskName = document.getElementById('aggregate-task-name').value.trim();
    const description = document.getElementById('keyword-description').value.trim();

    if (!taskName) {
        showNotification('请输入任务名称', 'warning');
        return;
    }
    if (keywords.length === 0) {
        showNotification('请添加至少一个关键词', 'warning');
        return;
    }
    if (selectedCities.length === 0) {
        showNotification('请选择至少一个城市', 'warning');
        return;
    }

    // 获取唯一的国家列表
    const countries = [...new Set(selectedCities.map(c => c.country))];

    const result = await postAPI('/api/aggregate-tasks', {
        name: taskName,
        description,
        keywords,
        countries,
        cities: selectedCities
    });

    if (result && result.success) {
        showNotification(`聚合任务创建成功！共创建 ${result.totalSubTasks} 个子任务`, 'success');

        // 重置表单
        resetForm();

        // 刷新任务列表
        await loadAggregateTasks();
    }
}

// 重置表单
function resetForm() {
    document.getElementById('aggregate-task-form').reset();
    keywords = [];
    selectedCities = [];
    currentCountry = null;
    currentStep = 1;

    renderKeywordTags();
    renderSelectedCities();
    setStep(1);

    document.getElementById('keyword-count-hint').textContent = '';

    // 重置城市列表
    document.getElementById('city-list').innerHTML = '<div class="empty-hint">请先选择国家</div>';

    // 取消国家选中状态
    document.querySelectorAll('.country-item').forEach(item => {
        item.classList.remove('selected');
        item.querySelector('input[type="checkbox"]').checked = false;
    });
}

// 加载聚合任务列表
window.loadAggregateTasks = async function() {
    const container = document.getElementById('aggregate-tasks-container');
    container.innerHTML = '<div class="loading-placeholder">加载中...</div>';

    const data = await fetchAPI('/api/aggregate-tasks?limit=20');
    if (!data) {
        container.innerHTML = '<div class="empty-hint">加载失败</div>';
        return;
    }

    if (!data.aggregateTasks || data.aggregateTasks.length === 0) {
        container.innerHTML = '<div class="empty-hint">暂无聚合任务</div>';
        return;
    }

    container.innerHTML = `
        <div class="aggregate-task-list">
            ${data.aggregateTasks.map(task => `
                <div class="aggregate-task-item">
                    <div class="aggregate-task-info">
                        <h4>
                            <a href="#aggregate-task-detail?id=${task.id}" style="color: inherit; text-decoration: none;">
                                ${task.name}
                            </a>
                            ${getStatusBadge(task.status)}
                        </h4>
                        <div class="aggregate-task-meta">
                            <span>关键词: ${Array.isArray(task.keywords) ? task.keywords.length : 0} 个</span>
                            <span>国家: ${Array.isArray(task.countries) ? task.countries.join(', ') : '-'}</span>
                            <span>创建时间: ${formatDate(task.createdAt)}</span>
                        </div>
                    </div>
                    <div class="aggregate-task-stats">
                        <div class="task-stat">
                            <div class="task-stat-value">${task.totalSubTasks || 0}</div>
                            <div class="task-stat-label">总任务</div>
                        </div>
                        <div class="task-stat">
                            <div class="task-stat-value" style="color: var(--success);">${task.completedSubTasks || 0}</div>
                            <div class="task-stat-label">已完成</div>
                        </div>
                        <div class="task-stat">
                            <div class="task-stat-value" style="color: var(--danger);">${task.failedSubTasks || 0}</div>
                            <div class="task-stat-label">失败</div>
                        </div>
                    </div>
                    <div class="aggregate-task-actions">
                        <a href="#aggregate-task-detail?id=${task.id}" class="btn-secondary btn-sm">查看详情</a>
                        ${task.status === 'running' ? `
                            <button class="btn-danger btn-sm" onclick="terminateAggregateTask('${task.id}')">终止</button>
                        ` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
};

// 终止聚合任务
window.terminateAggregateTask = async function(taskId) {
    if (!confirm('确定要终止此聚合任务及其所有子任务吗？')) return;

    const result = await postAPI(`/api/aggregate-tasks/${taskId}/terminate`);
    if (result && result.success) {
        showNotification('聚合任务已终止', 'success');
        await loadAggregateTasks();
    }
};
