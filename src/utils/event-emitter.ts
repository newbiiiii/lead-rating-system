/**
 * 事件发射器 - 用于跨进程通信
 * 使用Redis Pub/Sub实现Worker到API服务器的事件传递
 */

import Redis from 'ioredis';
import { logger } from './logger';
import { configLoader } from '../config/config-loader';

export interface ProgressEvent {
    type: 'task_start' | 'progress' | 'task_complete' | 'task_error';
    jobId: string;
    timestamp: string;
    data: {
        source?: string;
        query?: string;
        totalCount?: number;
        currentIndex?: number;
        currentItem?: string;
        message?: string;
        error?: string;
        stats?: {
            scraped?: number;
            saved?: number;
            failed?: number;
        };
    };
}

class EventEmitter {
    private publisher: Redis;
    private subscriber: Redis;
    private readonly CHANNEL = 'scraper:progress';

    constructor() {
        const redisConfig = configLoader.get('database.redis');

        this.publisher = new Redis({
            host: redisConfig.host,
            port: redisConfig.port,
            password: redisConfig.password,
            db: redisConfig.db
        });

        this.subscriber = new Redis({
            host: redisConfig.host,
            port: redisConfig.port,
            password: redisConfig.password,
            db: redisConfig.db
        });
    }

    /**
     * 发送事件
     */
    async emit(event: ProgressEvent): Promise<void> {
        try {
            await this.publisher.publish(this.CHANNEL, JSON.stringify(event));
        } catch (error) {
            logger.error('[EventEmitter] 发送事件失败:', error);
        }
    }

    /**
     * 订阅事件
     */
    async subscribe(callback: (event: ProgressEvent) => void): Promise<void> {
        await this.subscriber.subscribe(this.CHANNEL);

        this.subscriber.on('message', (channel, message) => {
            if (channel === this.CHANNEL) {
                try {
                    const event = JSON.parse(message) as ProgressEvent;
                    callback(event);
                } catch (error) {
                    logger.error('[EventEmitter] 解析事件失败:', error);
                }
            }
        });
    }

    /**
     * 关闭连接
     */
    async close(): Promise<void> {
        await this.publisher.quit();
        await this.subscriber.quit();
    }
}

export const eventEmitter = new EventEmitter();
