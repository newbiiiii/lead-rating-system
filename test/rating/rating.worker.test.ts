/**
 * Rating Worker 单元测试
 * 测试评分逻辑、重试机制和错误处理
 */
import 'dotenv/config';
import { isRetryableError, constructPrompt, shouldRetry, rateLeadWithAI } from '../../src/services/rating.service';

// ============ 测试数据工厂 ============
function createMockLead(overrides?: any) {
    return {
        id: 'test-lead-id',
        companyName: 'Test Company',
        website: 'https://test.com',
        industry: 'Technology',
        region: 'California',
        address: '123 Test St',
        employeeCount: 50,
        estimatedSize: 'medium',
        rating: 4.5,
        reviewCount: 100,
        rawData: {
            description: 'A test company',
            categories: ['Software']
        },
        ...overrides
    };
}

// console.log('测试1: API限流错误应该重试');
// const rateLimitError = new Error('Rate limit exceeded');
// console.log('结果:', isRetryableError(rateLimitError) === true ? '✓ 通过' : '✗ 失败');

// console.log('\n测试2: 网络错误应该重试');
// const networkError = new Error('Network timeout');
// console.log('结果:', isRetryableError(networkError) === true ? '✓ 通过' : '✗ 失败');

// console.log('\n测试3: 服务器错误应该重试');
// const serverError = new Error('503 Service Unavailable');
// console.log('结果:', isRetryableError(serverError) === true ? '✓ 通过' : '✗ 失败');

// console.log('\n测试4: JSON解析错误不应该重试');
// const jsonError = new Error('Unexpected token in JSON');
// console.log('结果:', isRetryableError(jsonError) === false ? '✓ 通过' : '✗ 失败');

// console.log('\n测试5: 验证错误不应该重试');
// const validationError = new Error('Invalid request parameters');
// console.log('结果:', isRetryableError(validationError) === false ? '✓ 通过' : '✗ 失败');

// console.log('\n测试6: Prompt 应该包含所有字段');
// const lead = createMockLead();
// const prompt = constructPrompt(lead);
// const hasAllFields =
//     prompt.includes('Test Company') &&
//     prompt.includes('https://test.com') &&
//     prompt.includes('Technology') &&
//     prompt.includes('California');
// console.log('结果:', hasAllFields ? '✓ 通过' : '✗ 失败');


// console.log('\n测试8: 第一次失败应该重试');
// const decision1 = shouldRetry(networkError, 0, 3);
// console.log('结果:', decision1.shouldRetry === true ? '✓ 通过' : '✗ 失败');
// console.log('原因:', decision1.reason);

// console.log('\n测试9: 最后一次失败不应该重试');
// const decision2 = shouldRetry(networkError, 2, 3);
// console.log('结果:', decision2.shouldRetry === false ? '✓ 通过' : '✗ 失败');
// console.log('原因:', decision2.reason);

// console.log('\n测试10: 不可重试错误不应该重试（即使是第一次）');
// const decision3 = shouldRetry(jsonError, 0, 3);
// console.log('结果:', decision3.shouldRetry === false ? '✓ 通过' : '✗ 失败');
// console.log('原因:', decision3.reason);

// 测试11: 测试真实的 AI 调用（需要配置 OpenAI API）
console.log('\n测试11: 评级');
const testRealAI = async () => {
    try {
        const testLead = createMockLead();
        const result = await rateLeadWithAI(testLead);
        console.log('结果:', result)
    } catch (error: any) {
        console.log('✗ 失败:', error.message);
    }
};

// 运行异步测试
testRealAI().then(() => {
    console.log('\n=== Rating Worker 测试完成 ===');
});