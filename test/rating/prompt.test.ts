/**
 * Prompt 构建逻辑测试
 * 测试评分prompt的各种场景
 */

import { createMockLead } from '../mocks/db.mock';

/**
 * 构建评分prompt（从rating.worker.ts提取）
 */
function constructPrompt(lead: any): string {
    const rawData = lead.rawData as any;
    const description = rawData?.description || rawData?.about || '';
    const categories = rawData?.categories || [];

    return `
        Company Name: ${lead.companyName}
        Website: ${lead.website || 'N/A'}
        Industry: ${lead.industry || categories.join(', ') || 'Unknown'}
        Region: ${lead.region || lead.address || 'Unknown'}
        Employee Count: ${lead.employeeCount || lead.estimatedSize || 'Unknown'}
        Google Rating: ${lead.rating || 'N/A'} (${lead.reviewCount || 0} reviews)
        
        Description: ${description}
        
        Task Context: We are looking for potential B2B clients in the construction/home decoration industry (e.g., Wall Panels, Flooring).
        `;
}

describe('Prompt Construction', () => {
    describe('完整数据场景', () => {
        test('应该包含所有必填字段', () => {
            const lead = createMockLead({
                companyName: 'Acme Corp',
                website: 'https://acme.com',
                industry: 'Construction',
                region: 'New York, USA',
                employeeCount: 100,
                rating: 4.5,
                reviewCount: 250
            });

            const prompt = constructPrompt(lead);

            expect(prompt).toContain('Acme Corp');
            expect(prompt).toContain('https://acme.com');
            expect(prompt).toContain('Construction');
            expect(prompt).toContain('New York, USA');
            expect(prompt).toContain('100');
            expect(prompt).toContain('4.5');
            expect(prompt).toContain('250 reviews');
        });

        test('应该包含任务上下文', () => {
            const lead = createMockLead();
            const prompt = constructPrompt(lead);

            expect(prompt).toContain('Task Context');
            expect(prompt).toContain('B2B clients');
            expect(prompt).toContain('construction/home decoration');
        });
    });

    describe('缺失字段处理', () => {
        test('应该用N/A替代缺失的website', () => {
            const lead = createMockLead({
                website: undefined
            });

            const prompt = constructPrompt(lead);
            expect(prompt).toContain('Website: N/A');
        });

        test('应该用Unknown替代缺失的industry', () => {
            const lead = createMockLead({
                industry: undefined,
                rawData: {}
            });

            const prompt = constructPrompt(lead);
            expect(prompt).toContain('Industry: Unknown');
        });

        test('应该从categories提取industry（如果未提供）', () => {
            const lead = createMockLead({
                industry: undefined,
                rawData: {
                    categories: ['Home Improvement', 'Construction']
                }
            });

            const prompt = constructPrompt(lead);
            expect(prompt).toContain('Industry: Home Improvement, Construction');
        });

        test('应该用address替代缺失的region', () => {
            const lead = createMockLead({
                region: undefined,
                address: '123 Main St, Boston, MA'
            });

            const prompt = constructPrompt(lead);
            expect(prompt).toContain('Region: 123 Main St, Boston, MA');
        });

        test('应该用estimatedSize替代缺失的employeeCount', () => {
            const lead = createMockLead({
                employeeCount: undefined,
                estimatedSize: 'medium'
            });

            const prompt = constructPrompt(lead);
            expect(prompt).toContain('Employee Count: medium');
        });

        test('应该正确处理缺失的rating', () => {
            const lead = createMockLead({
                rating: undefined,
                reviewCount: 0
            });

            const prompt = constructPrompt(lead);
            expect(prompt).toContain('Google Rating: N/A (0 reviews)');
        });
    });

    describe('rawData处理', () => {
        test('应该提取description字段', () => {
            const lead = createMockLead({
                rawData: {
                    description: 'Leading provider of construction materials'
                }
            });

            const prompt = constructPrompt(lead);
            expect(prompt).toContain('Leading provider of construction materials');
        });

        test('应该提取about字段作为替代', () => {
            const lead = createMockLead({
                rawData: {
                    about: 'Family-owned home improvement store'
                }
            });

            const prompt = constructPrompt(lead);
            expect(prompt).toContain('Family-owned home improvement store');
        });

        test('应该优先使用description而非about', () => {
            const lead = createMockLead({
                rawData: {
                    description: 'Primary description',
                    about: 'Secondary about'
                }
            });

            const prompt = constructPrompt(lead);
            expect(prompt).toContain('Primary description');
            expect(prompt).not.toContain('Secondary about');
        });

        test('应该处理空的rawData', () => {
            const lead = createMockLead({
                rawData: {}
            });

            const prompt = constructPrompt(lead);
            // 不应该抛出错误
            expect(prompt).toBeTruthy();
        });

        test('应该处理null的rawData', () => {
            const lead = createMockLead({
                rawData: null
            });

            const prompt = constructPrompt(lead);
            // 不应该抛出错误
            expect(prompt).toBeTruthy();
        });
    });

    describe('边界情况', () => {
        test('应该处理极长的公司名称', () => {
            const longName = 'A'.repeat(500);
            const lead = createMockLead({
                companyName: longName
            });

            const prompt = constructPrompt(lead);
            expect(prompt).toContain(longName);
        });

        test('应该处理特殊字符', () => {
            const lead = createMockLead({
                companyName: 'O\'Reilly & Sons, Inc.',
                region: 'São Paulo, Brazil'
            });

            const prompt = constructPrompt(lead);
            expect(prompt).toContain('O\'Reilly & Sons, Inc.');
            expect(prompt).toContain('São Paulo, Brazil');
        });

        test('应该处理数字为0的reviewCount', () => {
            const lead = createMockLead({
                reviewCount: 0
            });

            const prompt = constructPrompt(lead);
            expect(prompt).toContain('(0 reviews)');
        });

        test('应该处理employeeCount为0', () => {
            const lead = createMockLead({
                employeeCount: 0,
                estimatedSize: undefined
            });

            const prompt = constructPrompt(lead);
            // 0是falsy，所以会显示为Unknown
            expect(prompt).toContain('Employee Count: Unknown');
        });
    });

    describe('真实场景模拟', () => {
        test('Google Maps爬取的典型数据', () => {
            const lead = createMockLead({
                companyName: 'Home Depot',
                website: 'https://homedepot.com',
                industry: undefined,
                region: '1000 Market St, San Francisco, CA',
                employeeCount: undefined,
                estimatedSize: undefined,
                rating: 3.8,
                reviewCount: 1234,
                rawData: {
                    categories: ['Home Improvement Store', 'Hardware Store'],
                    description: 'The Home Depot is the world\'s largest home improvement retailer',
                    placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4'
                }
            });

            const prompt = constructPrompt(lead);

            expect(prompt).toContain('Home Depot');
            expect(prompt).toContain('https://homedepot.com');
            expect(prompt).toContain('Home Improvement Store, Hardware Store');
            expect(prompt).toContain('1000 Market St, San Francisco, CA');
            expect(prompt).toContain('3.8');
            expect(prompt).toContain('1234 reviews');
            expect(prompt).toContain('world\'s largest home improvement retailer');
        });

        test('最小化数据场景', () => {
            const lead = createMockLead({
                companyName: 'Unknown Business',
                website: undefined,
                industry: undefined,
                region: undefined,
                address: undefined,
                employeeCount: undefined,
                estimatedSize: undefined,
                rating: undefined,
                reviewCount: undefined,
                rawData: null
            });

            const prompt = constructPrompt(lead);

            // 应该包含公司名称和所有默认值
            expect(prompt).toContain('Unknown Business');
            expect(prompt).toContain('Website: N/A');
            expect(prompt).toContain('Industry: Unknown');
            expect(prompt).toContain('Region: Unknown');
            expect(prompt).toContain('Employee Count: Unknown');
            expect(prompt).toContain('Google Rating: N/A');
        });
    });
});
