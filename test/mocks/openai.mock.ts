/**
 * OpenAI API 模拟
 * 用于测试 rating worker 而不需要真实的 API 调用
 */

export interface MockChatCompletion {
    choices: Array<{
        message: {
            role: string;
            content: string | null;
        };
    }>;
    usage?: {
        total_tokens: number;
        prompt_tokens: number;
        completion_tokens: number;
    };
}

/**
 * 创建模拟的 OpenAI 响应
 */
export function createMockOpenAIResponse(overrides?: Partial<{
    totalScore: number;
    confidence: number;
    reasoning: string;
    breakdown: any;
    icebreaker: string;
}>): MockChatCompletion {
    const responseData = {
        totalScore: 75,
        confidence: 0.85,
        reasoning: 'This is a solid mid-sized company in the target industry.',
        breakdown: {
            industryFit: 80,
            scale: 70,
            contactQuality: 75
        },
        icebreaker: 'I noticed your company specializes in the technology sector...',
        ...overrides
    };

    return {
        choices: [{
            message: {
                role: 'assistant',
                content: JSON.stringify(responseData)
            }
        }],
        usage: {
            total_tokens: 500,
            prompt_tokens: 400,
            completion_tokens: 100
        }
    };
}

/**
 * 创建模拟的 OpenAI 客户端
 */
export class MockOpenAI {
    private shouldFail: boolean = false;
    private failureType: 'rate_limit' | 'network' | 'invalid_json' | 'validation' | null = null;
    private callCount: number = 0;

    chat = {
        completions: {
            create: jest.fn(async (params: any) => {
                this.callCount++;

                // 模拟失败场景
                if (this.shouldFail) {
                    switch (this.failureType) {
                        case 'rate_limit':
                            throw new Error('Rate limit exceeded');
                        case 'network':
                            throw new Error('Network timeout');
                        case 'invalid_json':
                            return {
                                choices: [{
                                    message: {
                                        role: 'assistant',
                                        content: 'Invalid JSON response'
                                    }
                                }],
                                usage: { total_tokens: 100 }
                            };
                        case 'validation':
                            throw new Error('Invalid request parameters');
                        default:
                            throw new Error('Unknown error');
                    }
                }

                // 正常响应
                return createMockOpenAIResponse();
            })
        }
    };

    /**
     * 配置模拟失败
     */
    setFailure(type: 'rate_limit' | 'network' | 'invalid_json' | 'validation' | null) {
        this.shouldFail = type !== null;
        this.failureType = type;
    }

    /**
     * 重置失败状态
     */
    resetFailure() {
        this.shouldFail = false;
        this.failureType = null;
    }

    /**
     * 获取调用次数
     */
    getCallCount(): number {
        return this.callCount;
    }

    /**
     * 重置调用次数
     */
    resetCallCount() {
        this.callCount = 0;
    }

    /**
     * 重置所有状态
     */
    reset() {
        this.resetFailure();
        this.resetCallCount();
        (this.chat.completions.create as jest.Mock).mockClear();
    }
}

/**
 * 创建并导出一个全局的 mock 实例
 */
export const mockOpenAI = new MockOpenAI();

/**
 * 工厂函数：创建新的 MockOpenAI 实例
 */
export function createMockOpenAI(): MockOpenAI {
    return new MockOpenAI();
}
