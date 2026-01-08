// Tasks页面逻辑模块
import { fetchAPI, postAPI } from '../api.js';
import { getQueueName, showNotification } from '../utils.js';

export async function init() {
    // 绑定表单提交
    const form = document.querySelector('#add-task-form');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }

    // 加载国家和城市数据
    await loadCountries();

    // 绑定国家/城市选择事件
    bindLocationEvents();

    // 加载队列统计
    await loadQueueStats();
}

async function handleFormSubmit(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const taskData = {
        source: 'google_maps',
        query: formData.get('query'),
        limit: 99,
        priority: parseInt(formData.get('priority')),
        config: {}
    };

    // 如果选择了城市,添加地理位置信息
    const lat = formData.get('latitude');
    const lng = formData.get('longitude');
    const radius = formData.get('radius');
    if (lat && lng && radius) {
        const citySelect = document.getElementById('city-select');
        const countrySelect = document.getElementById('country-select');
        taskData.config = {
            geolocation: {
                country: countrySelect?.value || '',
                city: citySelect?.value || '',
                latitude: parseFloat(lat),
                longitude: parseFloat(lng),
                radius: parseFloat(radius),
                step: 0.1,
                zoom: 15
            }
        };
    }

    const result = await postAPI('/api/tasks/scrape', taskData);
    if (result && result.success) {
        showNotification('任务已添加成功！', 'success');
        e.target.reset();
        document.getElementById('city-select').disabled = true;
        document.getElementById('city-select').innerHTML = '<option value="">请先选择国家</option>';
    }
}

async function loadCountries() {
    const data = await fetchAPI('/api/cities/countries');
    if (!data || !data.success) return;

    const select = document.getElementById('country-select');
    select.innerHTML = '<option value="">不限制国家</option>';

    data.countries.forEach(country => {
        const option = document.createElement('option');
        option.value = country;
        option.textContent = country;
        select.appendChild(option);
    });
}

function bindLocationEvents() {
    const countrySelect = document.getElementById('country-select');
    const citySelect = document.getElementById('city-select');

    if (countrySelect) {
        countrySelect.addEventListener('change', async (e) => {
            await onCountryChange(e.target.value);
        });
    }

    if (citySelect) {
        citySelect.addEventListener('change', (e) => {
            onCityChange(e.target.value);
        });
    }
}

async function onCountryChange(country) {
    const citySelect = document.getElementById('city-select');
    const latInput = document.getElementById('latitude');
    const lngInput = document.getElementById('longitude');
    const radiusInput = document.getElementById('radius');

    // 重置
    citySelect.innerHTML = '<option value="">请选择城市</option>';
    citySelect.disabled = !country;
    latInput.value = '';
    lngInput.value = '';
    radiusInput.value = '';

    if (!country) return;

    const data = await fetchAPI(`/api/cities/${encodeURIComponent(country)}`);
    if (!data || !data.success) return;

    data.cities.forEach(city => {
        const option = document.createElement('option');
        option.value = city.name;
        option.textContent = city.name;
        option.dataset.lat = city.lat;
        option.dataset.lng = city.lng;
        option.dataset.radius = city.radius;
        citySelect.appendChild(option);
    });
}

function onCityChange(cityName) {
    if (!cityName) {
        document.getElementById('latitude').value = '';
        document.getElementById('longitude').value = '';
        document.getElementById('radius').value = '';
        return;
    }

    const citySelect = document.getElementById('city-select');
    const selectedOption = citySelect.selectedOptions[0];

    document.getElementById('latitude').value = selectedOption.dataset.lat;
    document.getElementById('longitude').value = selectedOption.dataset.lng;
    document.getElementById('radius').value = selectedOption.dataset.radius;
}

async function loadQueueStats() {
    const stats = await fetchAPI('/api/queues/stats');
    if (!stats) return;

    const container = document.querySelector('#queue-stats-container');
    if (!container) return;

    container.innerHTML = `
        <div class="stats-grid">
            ${Object.entries(stats).map(([name, data]) => `
                <div class="stat-card">
                    <div class="stat-content">
                        <h4>${getQueueName(name)}</h4>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 12px;">
                            <div>
                                <div class="stat-value" style="font-size: 24px;">${data.waiting || 0}</div>
                                <div class="stat-label">等待中</div>
                            </div>
                            <div>
                                <div class="stat-value" style="font-size: 24px;">${data.active || 0}</div>
                                <div class="stat-label">处理中</div>
                            </div>
                            <div>
                                <div class="stat-value" style="font-size: 24px;">${data.completed || 0}</div>
                                <div class="stat-label">已完成</div>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// 导出给HTML调用
window.loadQueueStats = loadQueueStats;
