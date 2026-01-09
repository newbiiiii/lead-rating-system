/**
 * Jest 测试配置和全局设置
 */

// 设置环境变量
process.env.NODE_ENV = 'test';
process.env.OPENAI_API_KEY = 'test-key';
process.env.OPENAI_API_BASE_URL = 'https://api.openai.com/v1';
process.env.OPENAI_MODEL = 'gpt-3.5-turbo';

// 配置Jest超时
jest.setTimeout(10000);

// 全局清理函数
afterAll(() => {
    // 清理资源
});
