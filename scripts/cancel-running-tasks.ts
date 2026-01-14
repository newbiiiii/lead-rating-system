/**
 * 终止所有 running 状态的任务
 * 使用方法: npx tsx scripts/cancel-running-tasks.ts
 */

import 'dotenv/config';
import { db } from '../src/db';
import { tasks, aggregateTasks } from '../src/db/schema';
import { eq, sql } from 'drizzle-orm';

async function cancelRunningTasks() {
    console.log('🛑 正在终止所有运行中的任务...\n');

    try {
        // 1. 更新普通任务
        const result = await db.update(tasks)
            .set({
                status: 'cancelled',
                error: 'Manually cancelled by admin',
                completedAt: new Date()
            })
            .where(eq(tasks.status, 'running'))
            .returning({ id: tasks.id, name: tasks.name });

        console.log(`✅ 已取消 ${result.length} 个普通任务:`);
        result.forEach(t => console.log(`   - ${t.name} (${t.id})`));

        // 2. 更新聚合任务
        const aggResult = await db.update(aggregateTasks)
            .set({
                status: 'cancelled',
                completedAt: new Date()
            })
            .where(eq(aggregateTasks.status, 'running'))
            .returning({ id: aggregateTasks.id, name: aggregateTasks.name });

        console.log(`✅ 已取消 ${aggResult.length} 个聚合任务:`);
        aggResult.forEach(t => console.log(`   - ${t.name} (${t.id})`));

        // 3. 同时取消 pending 状态的子任务（属于已取消的聚合任务）
        const pendingResult = await db.update(tasks)
            .set({
                status: 'cancelled',
                error: 'Parent aggregate task cancelled',
                completedAt: new Date()
            })
            .where(eq(tasks.status, 'pending'))
            .returning({ id: tasks.id });

        console.log(`✅ 已取消 ${pendingResult.length} 个待处理的子任务`);

        console.log('\n🎉 完成！现在可以安全启动 Worker 了。');
    } catch (error: any) {
        console.error('❌ 操作失败:', error.message);
    }

    process.exit(0);
}

cancelRunningTasks();
