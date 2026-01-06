/**
 * 清空数据库表
 */

import 'dotenv/config';
import { db } from './db';
import { companies, ratings, intentSignals, automationLogs } from './db/schema';
import { sql } from 'drizzle-orm';
import { logger } from './utils/logger';

async function clearDatabase() {
    try {
        logger.info('开始清空数据库...');

        // 删除所有表的数据
        await db.delete(automationLogs);
        logger.info('✓ 已清空 automation_logs 表');

        await db.delete(ratings);
        logger.info('✓ 已清空 ratings 表');

        await db.delete(intentSignals);
        logger.info('✓ 已清空 intent_signals 表');

        await db.delete(companies);
        logger.info('✓ 已清空 companies 表');

        logger.info('\n✓ 数据库清空完成!');
        process.exit(0);
    } catch (error) {
        logger.error('清空数据库失败:', error);
        process.exit(1);
    }
}

clearDatabase();
