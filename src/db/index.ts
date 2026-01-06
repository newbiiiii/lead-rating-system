import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { configLoader } from '../config/config-loader';
import * as schema from './schema';

const dbConfig = configLoader.get('database.postgres');

const pool = new Pool({
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.username,
    password: dbConfig.password,
    min: dbConfig.pool?.min || 2,
    max: dbConfig.pool?.max || 10,
});

export const db = drizzle(pool, { schema });

export async function closeDatabase() {
    await pool.end();
}
