/**
 * 简化版爬虫 Worker（带数据库保存）
 * 用于快速测试
 */

import 'dotenv/config';
import { Worker } from 'bullmq';
import { randomUUID } from 'crypto';
import { configLoader } from '../config/config-loader';
import { db } from '../db';
import { companies } from '../db/schema';

const redisConfig = configLoader.get('database.redis');

console.log('🚀 启动爬虫 Worker...');
console.log('Redis 配置:', { host: redisConfig.host, port: redisConfig.port });

const worker = new Worker(
    'scrape',
    async (job) => {
        console.log(`\n📝 处理任务 ${job.id}:`, job.data);

        // 模拟爬取数据
        await new Promise(resolve => setTimeout(resolve, 2000));

        const companyId = randomUUID();
        const mockData = {
            id: companyId,
            name: `测试公司-${job.data.query}`,
            domain: `test-${companyId.substring(0, 8)}.com`,
            website: `https://test-${companyId.substring(0, 8)}.com`,
            industry: '电商',
            region: '上海',
            estimatedSize: 'medium',
            source: job.data.source,
            sourceUrl: `https://maps.google.com/test`,
            scrapedAt: new Date(),
            rawData: job.data
        };

        console.log('✅ 爬取完成:', mockData.name);

        // 💾 保存到数据库
        try {
            await db.insert(companies).values(mockData);
            console.log('💾 数据已保存到数据库');
        } catch (error: any) {
            console.error('❌ 保存失败:', error.message);
            throw error;
        }

        return { success: true, companyId };
    },
    {
        connection: {
            host: redisConfig.host,
            port: redisConfig.port,
            password: redisConfig.password || undefined,
        },
        concurrency: 2
    }
);

worker.on('completed', (job) => {
    console.log(`✓ 任务 ${job.id} 完成\n`);
});

worker.on('failed', (job, err) => {
    console.error(`✗ 任务 ${job?.id} 失败:`, err.message);
});

worker.on('error', (err) => {
    console.error('Worker 错误:', err);
});

console.log('✅ Worker 已启动，等待任务...\n');

// 优雅关闭
process.on('SIGINT', async () => {
    console.log('\n⏹️  停止 Worker...');
    await worker.close();
    process.exit(0);
});
