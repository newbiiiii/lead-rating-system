/**
 * 主入口文件
 * 启动所有 Workers
 */

import 'dotenv/config';
import { logger } from './utils/logger';
import { config } from './config/config-loader';

async function main() {
    logger.info('🚀 启动 Lead Rating System...');
    logger.info(`环境: ${config.environment}`);

    // TODO: 根据需要启动不同的 Workers
    // 可以通过命令行参数或环境变量控制

    const workerType = process.env.WORKER_TYPE || 'all';

    logger.info(`Worker 类型: ${workerType}`);

    // 优雅关闭
    process.on('SIGTERM', async () => {
        logger.info('收到 SIGTERM 信号，开始优雅关闭...');
        // TODO: 关闭所有连接
        process.exit(0);
    });

    process.on('SIGINT', async () => {
        logger.info('收到 SIGINT 信号，开始优雅关闭...');
        process.exit(0);
    });
}

main().catch((error) => {
    logger.error('启动失败:', error);
    process.exit(1);
});
