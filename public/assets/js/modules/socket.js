// WebSocket管理模块
let socket = null;

export function initSocket() {
    // 强制使用 WebSocket 传输，避免轮询延迟
    socket = io({
        transports: ['websocket'],
        upgrade: false,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000
    });

    socket.on('connect', () => {
        console.log('[Socket] Connected with id:', socket.id);
        appendLog({ type: 'system', message: '实时日志连接成功。' });
    });

    socket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected:', reason);
        appendLog({ type: 'system', message: '实时日志连接断开。' });
    });

    socket.on('connect_error', (error) => {
        console.error('[Socket] Connection error:', error.message);
    });

    socket.on('log', (data) => {
        appendLog(data);
    });
}


export function appendLog(data) {
    const logContent = document.getElementById('log-content');
    if (!logContent) return;

    const line = document.createElement('div');
    line.className = `log-line ${data.level || 'info'}`;

    const timestamp = new Date().toLocaleTimeString();
    line.innerHTML = `<span class="log-timestamp">[${timestamp}]</span>${data.message}`;

    logContent.appendChild(line);

    // 保持最多 1000 行日志
    if (logContent.children.length > 1000) {
        logContent.removeChild(logContent.firstChild);
    }

    // 自动滚动到底部
    const terminal = document.getElementById('log-terminal');
    if (terminal) {
        terminal.scrollTop = terminal.scrollHeight;
    }
}

export function clearLogs() {
    const logContent = document.getElementById('log-content');
    if (logContent) {
        logContent.innerHTML = '<div class="log-line system">日志已清空</div>';
    }
}

export function getSocket() {
    return socket;
}

// 全局导出给HTML调用
window.clearLogs = clearLogs;
