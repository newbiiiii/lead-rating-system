// 工具函数模块

export function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

export function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 24px;
        background: ${type === 'success' ? '#48bb78' : type === 'error' ? '#f56565' : '#4299e1'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

export function getSourceName(source) {
    const names = {
        'google_maps': 'Google地图',
        'linkedin': '领英',
        'qichacha': '企查查'
    };
    return names[source] || source;
}

export function getQueueName(key) {
    const names = {
        scrape: '搜索任务',
        process: '处理任务',
        rating: '评分任务',
        automation: '自动化任务'
    };
    return names[key] || key;
}

export function viewDetail(companyId) {
    console.log('查看详情:', companyId);
    // TODO: 实现详情页面
}

// 全局导出给HTML调用
window.viewDetail = viewDetail;
