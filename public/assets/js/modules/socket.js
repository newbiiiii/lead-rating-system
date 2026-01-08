// WebSocket管理模块
let socket = null;

export function initSocket() {
    socket = io();

    socket.on('connect', () => {
        appendLog({ type: 'system', message: '实时日志连接成功。' });
    });

    socket.on('disconnect', () => {
        appendLog({ type: 'system', message: '实时日志连接断开。' });
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

// 全局导出给HTML调用
window.clearLogs = clearLogs;
