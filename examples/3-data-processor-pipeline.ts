/**
 * 数据处理管道
 * 使用责任链模式构建可扩展的处理流程
 */

import { StandardData } from './1-scraper-adapter-base';
import { encoding_for_model } from 'tiktoken';

// ============ 处理器接口 ============

export interface IDataProcessor {
    process(data: StandardData): Promise<StandardData>;
    setNext(processor: IDataProcessor): IDataProcessor;
}

export abstract class BaseProcessor implements IDataProcessor {
    private nextProcessor?: IDataProcessor;

    setNext(processor: IDataProcessor): IDataProcessor {
        this.nextProcessor = processor;
        return processor;
    }

    async process(data: StandardData): Promise<StandardData> {
        const processed = await this.handle(data);

        if (this.nextProcessor) {
            return this.nextProcessor.process(processed);
        }

        return processed;
    }

    protected abstract handle(data: StandardData): Promise<StandardData>;
}

// ============ 具体处理器 ============

/**
 * 1. HTML 清理器
 */
export class HtmlCleaner extends BaseProcessor {
    protected async handle(data: StandardData): Promise<StandardData> {
        return {
            ...data,
            productDescription: this.stripHtml(data.productDescription || ''),
            painPoints: data.painPoints?.map(p => this.stripHtml(p))
        };
    }

    private stripHtml(html: string): string {
        return html
            .replace(/<[^>]*>/g, '')           // 移除 HTML 标签
            .replace(/&nbsp;/g, ' ')           // 替换 &nbsp;
            .replace(/&[a-z]+;/gi, '')         // 移除其他 HTML 实体
            .replace(/\s+/g, ' ')              // 压缩空格
            .trim();
    }
}

/**
 * 2. 文本规范化器
 */
export class TextNormalizer extends BaseProcessor {
    protected async handle(data: StandardData): Promise<StandardData> {
        return {
            ...data,
            name: this.normalize(data.name),
            industry: this.normalize(data.industry || ''),
            region: this.normalize(data.region || ''),
            email: data.email?.toLowerCase().trim(),
            phone: this.normalizePhone(data.phone || '')
        };
    }

    private normalize(text: string): string {
        return text
            .trim()
            .replace(/\s+/g, ' ')              // 统一空格
            .replace(/[\u200B-\u200D\uFEFF]/g, ''); // 移除零宽字符
    }

    private normalizePhone(phone: string): string {
        return phone.replace(/[\s\-\(\)]/g, ''); // 仅保留数字和+
    }
}

/**
 * 3. 联系方式提取器
 */
export class ContactExtractor extends BaseProcessor {
    private emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
    private phoneRegex = /(\+?\d{1,4}[\s\-]?)?\(?\d{2,4}\)?[\s\-]?\d{3,4}[\s\-]?\d{3,4}/g;

    protected async handle(data: StandardData): Promise<StandardData> {
        const text = [
            data.productDescription,
            data.painPoints?.join(' ')
        ].join(' ');

        return {
            ...data,
            email: data.email || this.extractEmail(text),
            phone: data.phone || this.extractPhone(text)
        };
    }

    private extractEmail(text: string): string | undefined {
        const matches = text.match(this.emailRegex);
        return matches?.[0];
    }

    private extractPhone(text: string): string | undefined {
        const matches = text.match(this.phoneRegex);
        return matches?.[0];
    }
}

/**
 * 4. 域名去重器（使用 Redis）
 */
export class DomainDeduplicator extends BaseProcessor {
    constructor(private redis: any) { // 简化类型，实际使用 ioredis
        super();
    }

    protected async handle(data: StandardData): Promise<StandardData> {
        if (!data.domain) return data;

        const key = `dedup:domain:${data.domain}`;
        const exists = await this.redis.exists(key);

        if (exists) {
            throw new Error(`域名已存在: ${data.domain}`);
        }

        // 设置 7 天过期
        await this.redis.setex(key, 7 * 24 * 3600, '1');

        return data;
    }
}

/**
 * 5. Token 估算器
 */
export class TokenEstimator extends BaseProcessor {
    private encoder = encoding_for_model('gpt-4o');

    protected async handle(data: StandardData): Promise<StandardData> {
        const text = this.prepareTextForEncoding(data);
        const tokens = this.encoder.encode(text).length;

        return {
            ...data,
            // @ts-ignore 添加元数据
            _estimatedTokens: tokens
        };
    }

    private prepareTextForEncoding(data: StandardData): string {
        return JSON.stringify({
            name: data.name,
            industry: data.industry,
            region: data.region,
            employeeCount: data.employeeCount,
            jobPostings: data.jobPostings?.map(j => j.title),
            productDescription: data.productDescription?.slice(0, 500), // 仅前 500 字
            painPoints: data.painPoints
        });
    }
}

// ============ 管道构建器 ============

export class ProcessorPipelineBuilder {
    private redis: any;

    constructor(redis: any) {
        this.redis = redis;
    }

    /**
     * 构建标准处理管道
     */
    buildStandardPipeline(): IDataProcessor {
        const htmlCleaner = new HtmlCleaner();
        const textNormalizer = new TextNormalizer();
        const contactExtractor = new ContactExtractor();
        const deduplicator = new DomainDeduplicator(this.redis);
        const tokenEstimator = new TokenEstimator();

        // 链式连接
        htmlCleaner
            .setNext(textNormalizer)
            .setNext(contactExtractor)
            .setNext(deduplicator)
            .setNext(tokenEstimator);

        return htmlCleaner;
    }

    /**
     * 构建轻量级管道（跳过去重）
     */
    buildLightweightPipeline(): IDataProcessor {
        const htmlCleaner = new HtmlCleaner();
        const textNormalizer = new TextNormalizer();
        const tokenEstimator = new TokenEstimator();

        htmlCleaner
            .setNext(textNormalizer)
            .setNext(tokenEstimator);

        return htmlCleaner;
    }
}

// ============ 使用示例 ============

/*
import Redis from 'ioredis';

const redis = new Redis();
const builder = new ProcessorPipelineBuilder(redis);
const pipeline = builder.buildStandardPipeline();

try {
  const processed = await pipeline.process(rawData);
  console.log('处理完成:', processed);
} catch (error) {
  if (error.message.includes('域名已存在')) {
    console.log('重复数据，已跳过');
  } else {
    throw error;
  }
}
*/
