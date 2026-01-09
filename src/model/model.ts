/**
 * 谷歌地图爬取的引导数据实体
 */
export interface TaskLead {
    taskId: string;
    taskName: string;
    source: 'google_maps' | string;
    query: string;
    country: string;
    city: string;
    progress: number;
    leadId: string;
    rawData: {},
    companyName: string;
    domain: string;
    website: string;
    industry: string;
    region: string;
    address: string;
    sourceUrl: string;
    ratingStatus: 'pending' | 'completed' | string;
    scrapedAt: Date;
    config: {};
    employeeCount: number,
    estimatedSize: string,
    rating: number,
    reviewCount: number,
}

export interface RatingResult {
    companyName: string;
    overallRating: string;
    country: string;
    suggestion: string;
    think: string;
}