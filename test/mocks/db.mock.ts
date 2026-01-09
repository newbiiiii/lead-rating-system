/**
 * 数据库模拟工具
 * 提供内存数据库和查询模拟
 */

export interface MockLead {
    id: string;
    companyName: string;
    website?: string;
    industry?: string;
    region?: string;
    address?: string;
    employeeCount?: number;
    estimatedSize?: string;
    rating?: number;
    reviewCount?: number;
    rawData?: any;
    source: string;
    sourceUrl?: string;
    ratingStatus: string;
    scrapedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface MockLeadRating {
    id: string;
    leadId: string;
    totalScore: number;
    breakdown: any;
    confidence: number;
    reasoning: string;
    icebreaker?: string;
    model?: string;
    tokensUsed?: number;
    ratedAt: Date;
    createdAt: Date;
}

/**
 * 内存数据存储
 */
class InMemoryDB {
    private leads: Map<string, MockLead> = new Map();
    private leadRatings: Map<string, MockLeadRating> = new Map();

    reset() {
        this.leads.clear();
        this.leadRatings.clear();
    }

    // Lead 操作
    async insertLead(lead: MockLead): Promise<void> {
        this.leads.set(lead.id, lead);
    }

    async findLead(id: string): Promise<MockLead | undefined> {
        return this.leads.get(id);
    }

    async updateLead(id: string, updates: Partial<MockLead>): Promise<void> {
        const lead = this.leads.get(id);
        if (lead) {
            this.leads.set(id, { ...lead, ...updates });
        }
    }

    // LeadRating 操作
    async insertLeadRating(rating: MockLeadRating): Promise<void> {
        this.leadRatings.set(rating.id, rating);
    }

    async findLeadRating(leadId: string): Promise<MockLeadRating | undefined> {
        return Array.from(this.leadRatings.values()).find(r => r.leadId === leadId);
    }

    getAllLeads(): MockLead[] {
        return Array.from(this.leads.values());
    }

    getAllRatings(): MockLeadRating[] {
        return Array.from(this.leadRatings.values());
    }
}

export const mockDB = new InMemoryDB();

/**
 * 创建 Drizzle ORM 模拟
 */
export function createMockDrizzle() {
    return {
        query: {
            leads: {
                findFirst: jest.fn(async ({ where }: any) => {
                    // 简单模拟: 假设where是一个id查询
                    const allLeads = mockDB.getAllLeads();
                    return allLeads.length > 0 ? allLeads[0] : undefined;
                })
            }
        },
        insert: jest.fn((table: any) => ({
            values: jest.fn(async (data: any) => {
                if (table === 'lead_ratings') {
                    await mockDB.insertLeadRating(data);
                }
            })
        })),
        update: jest.fn((table: any) => ({
            set: jest.fn((updates: any) => ({
                where: jest.fn(async (condition: any) => {
                    const allLeads = mockDB.getAllLeads();
                    if (allLeads.length > 0) {
                        await mockDB.updateLead(allLeads[0].id, updates);
                    }
                })
            }))
        })),
        transaction: jest.fn(async (callback: any) => {
            // 简单模拟事务 - 直接执行回调
            const tx = createMockDrizzle();
            return await callback(tx);
        })
    };
}

/**
 * Lead 工厂函数
 */
export function createMockLead(overrides?: Partial<MockLead>): MockLead {
    return {
        id: 'test-lead-id',
        companyName: 'Test Company',
        website: 'https://test.com',
        industry: 'Technology',
        region: 'California, USA',
        address: '123 Test St, San Francisco, CA',
        employeeCount: 50,
        estimatedSize: 'medium',
        rating: 4.5,
        reviewCount: 100,
        rawData: {
            categories: ['Software Development', 'Technology'],
            description: 'A test company for software development'
        },
        source: 'google_maps',
        sourceUrl: 'https://maps.google.com/test',
        ratingStatus: 'pending',
        scrapedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides
    };
}

/**
 * LeadRating 工厂函数
 */
export function createMockLeadRating(overrides?: Partial<MockLeadRating>): MockLeadRating {
    return {
        id: 'test-rating-id',
        leadId: 'test-lead-id',
        totalScore: 75,
        breakdown: {
            industryFit: 80,
            scale: 70,
            contactQuality: 75
        },
        confidence: 0.85,
        reasoning: 'This is a solid mid-sized company in the target industry.',
        icebreaker: 'I noticed your company specializes in software development...',
        model: 'gpt-3.5-turbo',
        tokensUsed: 500,
        ratedAt: new Date(),
        createdAt: new Date(),
        ...overrides
    };
}
