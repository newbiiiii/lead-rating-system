import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { configLoader } from '../config/config-loader';
import { logger } from '../utils/logger';

async function runMigrations() {
    const dbConfig = configLoader.get('database.postgres');

    const pool = new Pool({
        host: dbConfig.host,
        port: dbConfig.port,
        database: dbConfig.database,
        user: dbConfig.username,
        password: dbConfig.password,
    });

    const db = drizzle(pool);

    logger.info('开始执行数据库迁移...');

    try {
        await migrate(db, { migrationsFolder: './drizzle' });
        logger.info('✓ 数据库迁移完成');
    } catch (error) {
        logger.error('✗ 数据库迁移失败:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

runMigrations().catch((err) => {
    logger.error('迁移脚本执行失败:', err);
    process.exit(1);
});
