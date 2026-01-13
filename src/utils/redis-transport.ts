import Transport from 'winston-transport';
import Redis from 'ioredis';
import { configLoader } from '../config/config-loader';

interface RedisTransportOptions extends Transport.TransportStreamOptions {
    channel?: string;
}

export class RedisTransport extends Transport {
    private redis: Redis;
    private channel: string;
    private isReady: boolean = false;

    constructor(opts: RedisTransportOptions = {}) {
        super(opts);
        this.channel = opts.channel || 'logs';

        const redisConfig = configLoader.get('database.redis');
        this.redis = new Redis({
            host: redisConfig.host,
            port: redisConfig.port,
            password: redisConfig.password,
            retryStrategy: (times) => Math.min(times * 100, 3000),
            maxRetriesPerRequest: null,
        });

        this.redis.on('connect', () => {
            this.isReady = true;
        });

        this.redis.on('error', (err) => {
            console.error('Redis transport error:', err.message);
            this.isReady = false;
        });
    }

    log(info: any, callback: () => void) {
        // 立即触发 logged 事件
        setImmediate(() => this.emit('logged', info));

        // 如果 Redis 未就绪，跳过发布
        if (!this.isReady) {
            callback();
            return;
        }

        // 发布日志到 Redis (不阻塞)
        this.redis.publish(this.channel, JSON.stringify(info)).catch(err => {
            // 静默处理错误，避免影响主日志流程
        });

        callback();
    }
}
