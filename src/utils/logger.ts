/**
 * 日志工具
 * 使用 Winston 记录日志
 */

import winston from 'winston';
import path from 'path';
import { configLoader } from '../config/config-loader';
import { RedisTransport } from './redis-transport';

const logConfig = configLoader.get('monitoring.logging', {
    level: 'info',
    format: 'json'
});

const logger = winston.createLogger({
    level: logConfig.level || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        logConfig.format === 'json'
            ? winston.format.json()
            : winston.format.simple()
    ),
    transports: [
        // 控制台输出
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(({ timestamp, level, message, ...meta }) => {
                    return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
                        }`;
                })
            )
        }),

        // 文件输出
        new winston.transports.File({
            filename: path.join(process.cwd(), 'logs', 'app.log'),
            maxsize: 100 * 1024 * 1024, // 100MB
            maxFiles: 10
        }),

        // 错误日志单独文件
        new winston.transports.File({
            filename: path.join(process.cwd(), 'logs', 'error.log'),
            level: 'error',
            maxsize: 100 * 1024 * 1024,
            maxFiles: 10
        }),

        // Redis 实时日志流
        new RedisTransport({
            channel: 'logs'
        })
    ]
});

export { logger };
