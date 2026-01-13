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

async function loadStatus() {
    try {
        const response = await fetch('/api/monitoring/status');
        const result = await response.json();

        if (result.success && result.stats) {
            updateQueueStatus('scraper', result.stats.scraper);
            updateQueueStatus('rating', result.stats.rating);
            updateQueueStatus('crm', result.stats.crm);
        }
    } catch (error) {
        console.error('Failed to load status:', error);
    }
}

function updateQueueStatus(queueName, stats) {
    if (!stats) return;

    updateElementText(`${queueName}-active`, stats.active);
    updateElementText(`${queueName}-waiting`, stats.waiting);
    updateElementText(`${queueName}-completed`, stats.completed);
    updateElementText(`${queueName}-failed`, stats.failed);
}

function updateElementText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
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
