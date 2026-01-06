// WebSocket实时进度连接
const socket = io();

// 连接状态
socket.on('connect', () => {
    console.log('[WebSocket] 已连接到服务器');
});

socket.on('disconnect', () => {
    console.log('[WebSocket] 已断开连接');
});

// 接收实时进度事件
socket.on('progress', (event) => {
    console.log('[进度事件]', event);

    switch (event.type) {
        case 'task_start':
            showProgressStart(event);
            break;
        case 'progress':
            updateProgress(event);
            break;
        case 'task_complete':
            showProgressComplete(event);
            break;
        case 'task_error':
            showProgressError(event);
            break;
    }
});

// 显示任务开始
function showProgressStart(event) {
    const { source, query, totalCount } = event.data;
    showNotification(`开始搜索: ${query}`, 'info');
    console.log(`[任务开始] ${source} - ${query}, 目标${totalCount}条`);
}

// 更新进度
function updateProgress(event) {
    const { message, currentIndex, totalCount } = event.data;
    if (currentIndex && totalCount) {
        console.log(`[进度] ${currentIndex}/${totalCount} - ${message}`);
        // 可以在这里更新进度条
    }
}

// 显示任务完成
function showProgressComplete(event) {
    const { message, stats } = event.data;
    showNotification(message || '任务完成', 'success');
    console.log('[任务完成]', stats);

    // 刷新数据
    if (document.querySelector('#tasks-page').classList.contains('active')) {
        loadQueueStats();
    }
}

// 显示错误
function showProgressError(event) {
    showNotification(event.data.error || '任务失败', 'error');
}
