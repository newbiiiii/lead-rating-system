/**
 * AI 评级引擎
 * 支持配置化评分维度和 Prompt 模板
 */

import OpenAI from 'openai';
import { StandardData } from './1-scraper-adapter-base';

// ============ 类型定义 ============

export interface ScoringRule {
    condition: (data: StandardData) => boolean;
    score: number;
    reason: string;
}

export interface DimensionConfig {
    name: string;
    weight: number;
    maxScore: number;
    rules: ScoringRule[];
}

export interface RatingConfig {
    model: 'gpt-4o' | 'gpt-4o-mini' | 'claude-3.5-sonnet';
    temperature: number;
    dimensions: DimensionConfig[];
    thresholds: {
        high: number;
        medium: number;
        low: number;
    };
    productName: string;
    productDescription: string;
}

export interface RatingResult {
    leadId: string;
    totalScore: number;
    breakdown: Record<string, number>;
    confidence: number;
    reasoning: string;
    icebreaker: string;
    ratedAt: Date;
}

// ============ Prompt 模板 ============

export class PromptBuilder {
    constructor(private config: RatingConfig) { }

    buildRatingPrompt(data: StandardData): string {
        return `
# 角色
你是一位资深的 B2B 销售分析师，擅长识别高价值潜在客户。

# 任务
评估以下公司与"${this.config.productName}"的匹配度，输出 0-10 分评分。

# 产品信息
${this.config.productDescription}

# 公司信息
\`\`\`json
${this.formatCompanyData(data)}
\`\`\`

# 评分准则
${this.formatDimensions()}

# 输出格式（严格 JSON，不要添加任何额外文字）
\`\`\`json
{
  "score": 8.5,
  "breakdown": {
    "firmographics": 3,
    "intentSignals": 3,
    "painPoints": 2.5
  },
  "confidence": 0.85,
  "reasoning": "该公司属于目标行业，正在招聘相关岗位（强意向信号），且官网显示存在明确痛点。",
  "icebreaker": "注意到贵司正在扩招客服团队，我们的 AI 系统可帮助新员工 3 天上岗，减少 60% 培训成本。"
}
\`\`\`
`.trim();
    }

    private formatCompanyData(data: StandardData): string {
        return JSON.stringify({
            name: data.name,
            industry: data.industry,
            region: data.region,
            estimatedSize: data.estimatedSize,
            employeeCount: data.employeeCount,
            jobPostings: data.jobPostings?.map(j => j.title).slice(0, 5),
            recentNews: data.recentNews?.map(n => n.title).slice(0, 3),
            productDescription: data.productDescription?.slice(0, 500),
            painPoints: data.painPoints
        }, null, 2);
    }

    private formatDimensions(): string {
        return this.config.dimensions.map(dim => {
            const rules = dim.rules.map(rule => `- ${rule.reason}: ${rule.score > 0 ? '+' : ''}${rule.score} 分`).join('\n');
            return `## ${dim.name} (权重 ${dim.weight}, 最高 ${dim.maxScore} 分)\n${rules}`;
        }).join('\n\n');
    }
}

// ============ 评级引擎 ============

export class RatingEngine {
    private openai: OpenAI;
    private promptBuilder: PromptBuilder;

    constructor(
        private config: RatingConfig,
        apiKey: string
    ) {
        this.openai = new OpenAI({ apiKey });
        this.promptBuilder = new PromptBuilder(config);
    }

    /**
     * 单条评级
     */
    async rate(data: StandardData): Promise<RatingResult> {
        const prompt = this.promptBuilder.buildRatingPrompt(data);

        const response = await this.openai.chat.completions.create({
            model: this.config.model,
            temperature: this.config.temperature,
            messages: [
                { role: 'user', content: prompt }
            ],
            response_format: { type: 'json_object' }
        });

        const content = response.choices[0].message.content!;
        const result = JSON.parse(content);

        return {
            leadId: data.domain || data.name,
            totalScore: result.score,
            breakdown: result.breakdown,
            confidence: result.confidence,
            reasoning: result.reasoning,
            icebreaker: result.icebreaker,
            ratedAt: new Date()
        };
    }

    /**
     * 批量评级（节省 Token）
     */
    async rateBatch(dataList: StandardData[]): Promise<RatingResult[]> {
        const batchSize = 5;
        const results: RatingResult[] = [];

        for (let i = 0; i < dataList.length; i += batchSize) {
            const batch = dataList.slice(i, i + batchSize);
            const batchPrompt = this.buildBatchPrompt(batch);

            const response = await this.openai.chat.completions.create({
                model: this.config.model,
                temperature: this.config.temperature,
                messages: [
                    { role: 'user', content: batchPrompt }
                ],
                response_format: { type: 'json_object' }
            });

            const content = response.choices[0].message.content!;
            const batchResults = JSON.parse(content);

            results.push(...batchResults.ratings.map((r: any, idx: number) => ({
                leadId: batch[idx].domain || batch[idx].name,
                ...r,
                ratedAt: new Date()
            })));
        }

        return results;
    }

    private buildBatchPrompt(dataList: StandardData[]): string {
        const companies = dataList.map((data, idx) =>
            `${idx + 1}. ${JSON.stringify(this.simplifyData(data))}`
        ).join('\n');

        return `
评估以下 ${dataList.length} 家公司，为每家输出评分。

# 公司列表
${companies}

# 输出格式
\`\`\`json
{
  "ratings": [
    {"score": 8.5, "breakdown": {...}, "confidence": 0.85, "reasoning": "...", "icebreaker": "..."},
    ...
  ]
}
\`\`\`
`.trim();
    }

    private simplifyData(data: StandardData) {
        return {
            name: data.name,
            industry: data.industry,
            size: data.estimatedSize,
            jobs: data.jobPostings?.map(j => j.title).slice(0, 3),
            desc: data.productDescription?.slice(0, 200)
        };
    }
}

// ============ 规则评分器（混合模式） ============

export class HybridScorer {
    /**
     * 先用规则快速筛选，再用 LLM 精确评分
     */
    async score(data: StandardData, engine: RatingEngine, config: RatingConfig): Promise<RatingResult | null> {
        // 1. 规则预筛选
        const ruleScore = this.calculateRuleScore(data, config);

        // 2. 低于阈值直接过滤
        if (ruleScore < config.thresholds.low - 2) {
            return {
                leadId: data.domain || data.name,
                totalScore: ruleScore,
                breakdown: {},
                confidence: 1,
                reasoning: '未满足基本条件，不符合 ICP',
                icebreaker: '',
                ratedAt: new Date()
            };
        }

        // 3. 高于阈值才调用 LLM
        return await engine.rate(data);
    }

    private calculateRuleScore(data: StandardData, config: RatingConfig): number {
        let score = 0;

        for (const dimension of config.dimensions) {
            for (const rule of dimension.rules) {
                if (rule.condition(data)) {
                    score += rule.score;
                }
            }
        }

        return Math.min(score, 10);
    }
}

// ============ 使用示例 ============

/*
const config: RatingConfig = {
  model: 'gpt-4o',
  temperature: 0.3,
  productName: '全自动AI客服系统',
  productDescription: '帮助企业实现客服自动化，减少 80% 人力成本',
  dimensions: [
    {
      name: '基础匹配度',
      weight: 0.3,
      maxScore: 3,
      rules: [
        {
          condition: (d) => ['电商', '物流', '金融'].includes(d.industry || ''),
          score: 3,
          reason: '属于目标行业'
        },
        {
          condition: (d) => d.estimatedSize === 'large',
          score: 2,
          reason: '企业规模达标'
        }
      ]
    },
    {
      name: '意向信号',
      weight: 0.4,
      maxScore: 4,
      rules: [
        {
          condition: (d) => d.jobPostings?.some(j => /客服|售后/.test(j.title)),
          score: 3,
          reason: '正在招聘客服岗位'
        }
      ]
    }
  ],
  thresholds: { high: 9, medium: 6, low: 6 }
};

const engine = new RatingEngine(config, process.env.OPENAI_API_KEY!);
const result = await engine.rate(companyData);
console.log(result);
*/
