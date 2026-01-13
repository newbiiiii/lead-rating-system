import { getSocket } from '../socket.js';

let statusInterval;
let logHandler;

export async function init() {
    console.log('Initializing Monitoring Center...');

    // 初始化 Socket 连接
    const socket = getSocket();

    // 绑定日志处理
    setupLogStream(socket);

    // 初始加载状态
    await loadStatus();

    // 定时轮询状态 (每5秒)
    statusInterval = setInterval(loadStatus, 5000);

    // 绑定清屏按钮
    document.getElementById('clear-logs')?.addEventListener('click', () => {
        const terminal = document.getElementById('terminal-logs');
        if (terminal) terminal.innerHTML = '';
    });
}

// 页面销毁时的清理工作 (router 需要支持 cleanup，但目前 app.js 好像没调用，先留着)
export function cleanup() {
    if (statusInterval) clearInterval(statusInterval);
    const socket = getSocket();
    if (socket && logHandler) {
        socket.off('log', logHandler);
    }
}

const QUEUE_CONFIG = [
    {
        key: 'scraper',
        name: '爬虫任务队列',
        icon: '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>',
        type: 'queue-scraper'
    },
    {
        key: 'rating',
        name: 'AI 评分队列',
        icon: '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path></svg>',
        type: 'queue-rating'
    },
    {
        key: 'crm',
        name: 'CRM 同步队列',
        icon: '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>',
        type: 'queue-crm'
    }
];

async function loadStatus() {
    try {
        const response = await fetch('/api/monitoring/status');
        const result = await response.json();

        if (result.success && result.stats) {
            renderQueueCards(result.stats);
        }
    } catch (error) {
        console.error('Failed to load status:', error);
    }
}

function renderQueueCards(stats) {
    const container = document.getElementById('queue-grid');
    if (!container) return;

    // 如果还没有内容（第一次），或者只是为了更新数字，
    // 这里我们直接innerHTML重绘，因为元素不多，性能影响不大。
    // 如果想要更精细的 updates，可以做 DOM diff，但这里没必要。

    container.innerHTML = QUEUE_CONFIG.map(queue => {
        const queueData = stats[queue.key] || {};
        return `
            <div class="queue-card ${queue.type} p-4 bg-white rounded-lg shadow border border-gray-100 flex flex-col justify-between h-40">
                <div class="queue-card-header flex items-center mb-4">
                    <div class="queue-card-icon p-2 rounded-lg bg-gray-50 text-gray-600 mr-3">
                        ${queue.icon}
                    </div>
                    <div class="queue-card-title font-medium text-gray-700">${queue.name}</div>
                </div>
                <div class="queue-card-stats grid grid-cols-4 gap-2 text-center">
                    <div class="queue-stat-item">
                        <div class="queue-stat-value text-lg font-bold text-gray-500">${queueData.waiting || 0}</div>
                        <div class="queue-stat-label text-xs text-gray-400">等待中</div>
                    </div>
                    <div class="queue-stat-item">
                        <div class="queue-stat-value text-lg font-bold text-blue-600">${queueData.active || 0}</div>
                        <div class="queue-stat-label text-xs text-gray-400">运行中</div>
                    </div>
                    <div class="queue-stat-item">
                        <div class="queue-stat-value text-lg font-bold text-green-600">${queueData.completed || 0}</div>
                        <div class="queue-stat-label text-xs text-gray-400">已完成</div>
                    </div>
                    <div class="queue-stat-item">
                        <div class="queue-stat-value text-lg font-bold text-red-600">${queueData.failed || 0}</div>
                        <div class="queue-stat-label text-xs text-gray-400">已失败</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function setupLogStream(socket) {
    // 订阅所有频道
    socket.on('log:scraper', (log) => appendLogToTerminal('terminal-scraper', log));
    socket.on('log:rating', (log) => appendLogToTerminal('terminal-rating', log));
    socket.on('log:crm', (log) => appendLogToTerminal('terminal-crm', log));

    // 绑定清除按钮
    document.querySelectorAll('.clear-logs').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.target.dataset.target;
            const terminal = document.getElementById(targetId);
            if (terminal) terminal.innerHTML = '';
        });
    });
}

function appendLogToTerminal(terminalId, log) {
    const terminal = document.getElementById(terminalId);
    if (!terminal) return;

    // 清除"Waiting..." 提示
    if (terminal.querySelector('.italic')) {
        const italic = terminal.querySelector('.italic');
        if (italic.textContent.includes('Waiting')) {
            terminal.removeChild(italic);
        }
    }

    const div = document.createElement('div');
    div.className = 'font-mono break-all border-b border-gray-800 pb-0.5 mb-0.5';

    // 格式化时间戳
    const time = new Date(log.timestamp).toLocaleTimeString();

    // 颜色映射
    let colorClass = 'text-gray-300';
    let levelLabel = '[INFO]';

    if (log.level === 'error') {
        colorClass = 'text-red-400';
        levelLabel = '[ERROR]';
    } else if (log.level === 'warn') {
        colorClass = 'text-yellow-400';
        levelLabel = '[WARN]';
    } else if (log.level === 'debug') {
        colorClass = 'text-gray-500';
        levelLabel = '[DEBUG]';
    } else if (log.message.includes('Processing')) {
        colorClass = 'text-blue-400';
    } else if (log.message.includes('Completed')) {
        colorClass = 'text-green-400';
    }

    div.innerHTML = `
        <span class="text-gray-600 text-[10px] w-16 inline-block">[${time}]</span>
        <span class="${colorClass}">${log.message}</span>
        ${log.meta && Object.keys(log.meta).length > 0 ? `<br/><span class="text-xs text-gray-600 ml-16 transform scale-90 origin-left inline-block">${JSON.stringify(log.meta)}</span>` : ''}
    `;

    terminal.appendChild(div);

    // 限制日志条数 (每个终端保留 200 条)
    while (terminal.children.length > 200) {
        terminal.removeChild(terminal.firstChild);
    }

    // 始终自动滚动
    terminal.scrollTop = terminal.scrollHeight;
}
