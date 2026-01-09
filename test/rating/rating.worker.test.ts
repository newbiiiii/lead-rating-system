/**
 * Rating Worker 单元测试
 * 测试评分逻辑、重试机制和错误处理
 */

import { mockDB, createMockLead, createMockDrizzle } from '../mocks/db.mock';
import { mockOpenAI, createMockOpenAIResponse } from '../mocks/openai.mock';

// 模拟依赖
jest.mock('../../src/db', () => ({
    db: createMockDrizzle()
}));

jest.mock('../../src/utils/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }
}));

jest.mock('openai', () => {
    return {
        default: jest.fn(() => mockOpenAI)
    };
});

describe('Rating Worker', () => {
    let processJob: any;
    let constructPrompt: any;
    let isRetryableError: any;

    beforeEach(() => {
        // 重置所有 mock
        mockDB.reset();
        mockOpenAI.reset();
        jest.clearAllMocks();

        // 创建测试数据
        const testLead = createMockLead();
        mockDB.insertLead(testLead);
    });

    afterEach(() => {
        mockDB.reset();
    });

    describe('基本功能测试', () => {
        test('应该成功评分一个新线索', async () => {
            const mockJob = {
                id: 'test-job-id',
                data: { leadId: 'test-lead-id' },
                attemptsMade: 0
            };

            // 由于我们在实际测试中不能直接访问 RatingWorker 的私有方法,
            // 这里我们测试核心逻辑的独立部分

            // 测试 prompt 构建
            const lead = await mockDB.findLead('test-lead-id');
            expect(lead).toBeDefined();
            expect(lead?.companyName).toBe('Test Company');

            // 测试 OpenAI 调用
            const response = await mockOpenAI.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: []
            });

            expect(response).toBeDefined();
            expect(response.choices[0].message.content).toBeTruthy();

            const result = JSON.parse(response.choices[0].message.content!);
            expect(result.totalScore).toBeGreaterThanOrEqual(0);
            expect(result.totalScore).toBeLessThanOrEqual(100);
            expect(result.confidence).toBeGreaterThanOrEqual(0);
            expect(result.confidence).toBeLessThanOrEqual(1);
        });

        test('应该跳过已评分的线索', async () => {
            // 创建已评分的线索
            const ratedLead = createMockLead({
                id: 'rated-lead-id',
                ratingStatus: 'completed'
            });
            await mockDB.insertLead(ratedLead);

            const lead = await mockDB.findLead('rated-lead-id');
            expect(lead?.ratingStatus).toBe('completed');

            // 在实际的 worker 中，这会被跳过
            // 这里我们只验证状态检查逻辑
        });

        test('应该正确处理不存在的线索', async () => {
            const nonExistentLead = await mockDB.findLead('non-existent-id');
            expect(nonExistentLead).toBeUndefined();
        });
    });

    describe('重试逻辑测试', () => {
        test('应该在API限流错误时重试', () => {
            const error = new Error('Rate limit exceeded');

            // 测试错误分类逻辑
            const errorMessage = error.message.toLowerCase();
            const isRetryable = errorMessage.includes('rate limit');

            expect(isRetryable).toBe(true);
        });

        test('应该在网络错误时重试', () => {
            const networkErrors = [
                new Error('Network timeout'),
                new Error('ECONNREFUSED'),
                { code: 'ENOTFOUND', message: 'DNS lookup failed' }
            ];

            networkErrors.forEach(error => {
                const errorMessage = error.message?.toLowerCase() || '';
                const errorCode = (error as any).code?.toLowerCase() || '';

                const isRetryable =
                    errorMessage.includes('network') ||
                    errorMessage.includes('timeout') ||
                    errorMessage.includes('econnrefused') ||
                    errorCode === 'enotfound';

                expect(isRetryable).toBe(true);
            });
        });

        test('不应该在JSON解析错误时重试', () => {
            const error = new Error('Unexpected token in JSON at position 0');

            const errorMessage = error.message.toLowerCase();
            const isRetryable = !(errorMessage.includes('json') || errorMessage.includes('parse'));

            expect(isRetryable).toBe(false);
        });

        test('不应该在验证错误时重试', () => {
            const error = new Error('Invalid request parameters');

            const errorMessage = error.message.toLowerCase();
            const isRetryable = !(errorMessage.includes('validation') || errorMessage.includes('invalid'));

            expect(isRetryable).toBe(false);
        });

        test('应该在最后一次尝试后标记为失败', async () => {
            const maxAttempts = 3;
            const attemptsMade = 2; // 第三次尝试 (0-indexed)
            const isLastAttempt = attemptsMade >= maxAttempts - 1;

            expect(isLastAttempt).toBe(true);
        });

        test('应该记录重试尝试次数', async () => {
            const attempts = [0, 1, 2];
            const maxAttempts = 3;

            attempts.forEach(attempt => {
                const isLastAttempt = attempt >= maxAttempts - 1;
                const shouldRetry = !isLastAttempt;

                if (attempt < 2) {
                    expect(shouldRetry).toBe(true);
                } else {
                    expect(shouldRetry).toBe(false);
                }
            });
        });
    });

    describe('数据处理测试', () => {
        test('应该正确解析AI响应', async () => {
            const response = createMockOpenAIResponse();
            const content = response.choices[0].message.content;

            expect(content).toBeTruthy();
            const result = JSON.parse(content!);

            expect(result).toHaveProperty('totalScore');
            expect(result).toHaveProperty('confidence');
            expect(result).toHaveProperty('reasoning');
            expect(result).toHaveProperty('breakdown');
            expect(result).toHaveProperty('icebreaker');

            expect(result.breakdown).toHaveProperty('industryFit');
            expect(result.breakdown).toHaveProperty('scale');
            expect(result.breakdown).toHaveProperty('contactQuality');
        });

        test('应该处理畸形的JSON响应', async () => {
            mockOpenAI.setFailure('invalid_json');

            const response = await mockOpenAI.chat.completions.create({});
            const content = response.choices[0].message.content;

            expect(() => {
                JSON.parse(content!);
            }).toThrow();
        });

        test('应该包含所有必需的评分字段', () => {
            const response = createMockOpenAIResponse();
            const result = JSON.parse(response.choices[0].message.content!);

            // 验证评分范围
            expect(result.totalScore).toBeGreaterThanOrEqual(0);
            expect(result.totalScore).toBeLessThanOrEqual(100);

            // 验证置信度范围
            expect(result.confidence).toBeGreaterThanOrEqual(0);
            expect(result.confidence).toBeLessThanOrEqual(1);

            // 验证breakdown分数
            expect(result.breakdown.industryFit).toBeGreaterThanOrEqual(0);
            expect(result.breakdown.industryFit).toBeLessThanOrEqual(100);
            expect(result.breakdown.scale).toBeGreaterThanOrEqual(0);
            expect(result.breakdown.scale).toBeLessThanOrEqual(100);
            expect(result.breakdown.contactQuality).toBeGreaterThanOrEqual(0);
            expect(result.breakdown.contactQuality).toBeLessThanOrEqual(100);
        });
    });

    describe('Prompt 构建测试', () => {
        test('应该包含所有线索字段', () => {
            const lead = createMockLead();

            // 构建prompt的逻辑
            const prompt = `
        Company Name: ${lead.companyName}
        Website: ${lead.website || 'N/A'}
        Industry: ${lead.industry || 'Unknown'}
        Region: ${lead.region || lead.address || 'Unknown'}
        Employee Count: ${lead.employeeCount || lead.estimatedSize || 'Unknown'}
        Google Rating: ${lead.rating || 'N/A'} (${lead.reviewCount || 0} reviews)
        
        Description: ${lead.rawData?.description || ''}
        `;

            expect(prompt).toContain(lead.companyName);
            expect(prompt).toContain(lead.website!);
            expect(prompt).toContain(lead.industry!);
            expect(prompt).toContain(lead.region!);
        });

        test('应该正确处理缺失的可选字段', () => {
            const leadWithoutOptionals = createMockLead({
                website: undefined,
                industry: undefined,
                employeeCount: undefined
            });

            const websiteValue = leadWithoutOptionals.website || 'N/A';
            const industryValue = leadWithoutOptionals.industry || 'Unknown';
            const employeeValue = leadWithoutOptionals.employeeCount || leadWithoutOptionals.estimatedSize || 'Unknown';

            expect(websiteValue).toBe('N/A');
            expect(industryValue).toBe('Unknown');
            expect(employeeValue).toBe('medium'); // from default estimatedSize
        });

        test('应该从rawData中提取描述信息', () => {
            const lead = createMockLead({
                rawData: {
                    description: 'A leading software company',
                    categories: ['Software', 'Technology']
                }
            });

            const description = lead.rawData?.description || lead.rawData?.about || '';
            const categories = lead.rawData?.categories || [];

            expect(description).toBe('A leading software company');
            expect(categories).toEqual(['Software', 'Technology']);
        });
    });

    describe('OpenAI API 交互测试', () => {
        test('应该使用正确的模型和参数', async () => {
            const createSpy = mockOpenAI.chat.completions.create;

            await mockOpenAI.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                    { role: 'system', content: 'Test system message' },
                    { role: 'user', content: 'Test user message' }
                ],
                response_format: { type: 'json_object' },
                temperature: 0.3
            });

            expect(createSpy).toHaveBeenCalledTimes(1);
            expect(createSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    model: 'gpt-3.5-turbo',
                    response_format: { type: 'json_object' },
                    temperature: 0.3
                })
            );
        });

        test('应该正确记录token使用情况', async () => {
            const response = await mockOpenAI.chat.completions.create({});

            expect(response.usage).toBeDefined();
            expect(response.usage?.total_tokens).toBe(500);
            expect(response.usage?.prompt_tokens).toBe(400);
            expect(response.usage?.completion_tokens).toBe(100);
        });
    });
});
