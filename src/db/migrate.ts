import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import * as schema from './schema';

dotenv.config();

async function runMigration() {
    console.log('🚀 开始执行数据库migration...');

    const pool = new Pool({
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || '',
        database: process.env.POSTGRES_DB || 'lead_rating',
    });

    const db = drizzle(pool, { schema });

    try {
        console.log('📊 执行migration文件...');
        await migrate(db, { migrationsFolder: './drizzle' });
        console.log('✅ Migration执行成功！');
        console.log('📋 新增表:');
        console.log('  - tasks (任务表)');
        console.log('  - leads (线索表)');
        console.log('  - contacts (联系人表)');
        console.log('  - lead_ratings (AI评级表)');
    } catch (error) {
        console.error('❌ Migration失败:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

runMigration()
    .then(() => {
        console.log('✨ 数据库更新完成');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Migration错误:', error);
        process.exit(1);
    });
