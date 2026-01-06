import Transport from 'winston-transport';
import Redis from 'ioredis';
import { configLoader } from '../config/config-loader';

interface RedisTransportOptions extends Transport.TransportStreamOptions {
    channel?: string;
}

export class RedisTransport extends Transport {
    private redis: Redis;
    private channel: string;

    constructor(opts: RedisTransportOptions = {}) {
        super(opts);
        this.channel = opts.channel || 'logs';

        const redisConfig = configLoader.get('database.redis');
        this.redis = new Redis({
            host: redisConfig.host,
            port: redisConfig.port,
            password: redisConfig.password,
        });
    }

    log(info: any, callback: () => void) {
        setImmediate(() => {
            this.emit('logged', info);
        });

        // Publish log to Redis channel
        this.redis.publish(this.channel, JSON.stringify(info)).catch(err => {
            console.error('Failed to publish log to Redis:', err);
        });

        callback();
    }
}
