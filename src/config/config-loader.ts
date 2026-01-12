/**
 * 配置加载器
 * 从 config.yaml 和环境变量加载配置
 */

import fs from 'fs';
import path from 'path';
import yaml from 'yaml';

export interface AppConfig {
    scraper: any;
    processor: any;
    rating: any;
    automation: any;
    integrations: any;
    database: any;
    queue: any;
    monitoring: any;
    environment: string;
}

class ConfigLoader {
    private config: AppConfig | null = null;

    /**
     * 加载配置
     */
    load(): AppConfig {
        if (this.config) {
            return this.config;
        }

        const configPath = path.join(process.cwd(), 'config.yaml');

        if (!fs.existsSync(configPath)) {
            throw new Error('配置文件不存在: config.yaml，请复制 config.example.yaml');
        }

        const fileContent = fs.readFileSync(configPath, 'utf-8');
        const rawConfig = yaml.parse(fileContent);

        // 替换环境变量
        this.config = this.replaceEnvVars(rawConfig);

        return this.config as AppConfig;
    }

    /**
     * 递归替换环境变量占位符
     */
    private replaceEnvVars(obj: any): any {
        if (typeof obj === 'string') {
            // 匹配 ${VAR_NAME} 或 ${VAR_NAME:-default_value}
            const envVarRegex = /\$\{([^}:]+)(?::-(.*))?\}/g;
            return obj.replace(envVarRegex, (match, varName, defaultValue) => {
                return process.env[varName] || defaultValue || '';
            });
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.replaceEnvVars(item));
        }

        if (typeof obj === 'object' && obj !== null) {
            const result: any = {};
            for (const key in obj) {
                result[key] = this.replaceEnvVars(obj[key]);
            }
            return result;
        }

        return obj;
    }

    /**
     * 获取配置值
     */
    get<T = any>(path: string, defaultValue?: T): T {
        const config = this.load();
        const keys = path.split('.');
        let value: any = config;

        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return defaultValue as T;
            }
        }

        return value;
    }
}

// 单例
export const configLoader = new ConfigLoader();
export const config = configLoader.load();
