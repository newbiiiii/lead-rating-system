/**
 * 清空所有队列任务的脚本（包括 repeat jobs）
 * 使用方法: npx tsx scripts/clear-queues.ts
 */

import { Queue } from 'bullmq';

async function clearAllQueues() {
    const connection = {
        host: '8.155.174.211',
        port: 6379,
        password: 'yourpassword',
    };

    const queueNames = ['scrape', 'process', 'rating', 'crm', 'enrich', 'import'];

    console.log('🧹 开始清空所有队列（包括定时任务）...\n');

    for (const name of queueNames) {
        const queue = new Queue(name, { connection });

        try {
            // 获取当前任务数量
            const waiting = await queue.getWaitingCount();
            const active = await queue.getActiveCount();
            const delayed = await queue.getDelayedCount();
            const failed = await queue.getFailedCount();
            const completed = await queue.getCompletedCount();

            // 获取 repeat jobs
            const repeatableJobs = await queue.getRepeatableJobs();

            console.log(`📦 队列 [${name}]:`);
            console.log(`   等待中: ${waiting}, 活动中: ${active}, 延迟: ${delayed}, 失败: ${failed}, 已完成: ${completed}`);
            console.log(`   定时任务: ${repeatableJobs.length} 个`);

            // 清除所有 repeat jobs
            for (const job of repeatableJobs) {
                await queue.removeRepeatableByKey(job.key);
                console.log(`   - 移除定时任务: ${job.name} (${job.key})`);
            }

            // 清空队列
            await queue.obliterate({ force: true });  // 强制彻底清空（包括活动任务）

            console.log(`   ✅ 已彻底清空\n`);
        } catch (error: any) {
            console.error(`   ❌ 清空失败: ${error.message}\n`);
        } finally {
            await queue.close();
        }
    }

    console.log('🎉 所有队列已彻底清空！');
    process.exit(0);
}

clearAllQueues().catch(console.error);
