/**
 * 数据源适配器基类
 * 所有爬虫适配器都应该实现这个接口
 */

export interface ScrapeParams {
  query: string;
  filters?: Record<string, any>;
  limit?: number;
  offset?: number;
  config?: Record<string, any>;
}

export interface RawData {
  source: string;
  url: string;
  scrapedAt: Date;
  data: Record<string, any>;
}

export interface StandardData {
  // 基础信息
  name: string;
  domain?: string;
  website?: string;
  industry?: string;
  region?: string;

  // 联系信息
  email?: string;
  phone?: string;

  // 规模信息
  employeeCount?: number;
  estimatedSize?: 'small' | 'medium' | 'large';

  // 意向信号
  jobPostings?: Array<{
    title: string;
    department?: string;
    postedAt?: Date;
  }>;
  recentNews?: Array<{
    title: string;
    publishedAt?: Date;
  }>;
  fundingInfo?: {
    stage?: string;
    amount?: number;
    date?: Date;
  };

  // 产品与痛点
  productDescription?: string;
  painPoints?: string[];

  // 元数据
  sourceUrl: string;
  scrapedAt: Date;
  rawDataId?: string;
}

export abstract class BaseScraperAdapter {
  abstract readonly source: string;

  /**
   * 执行爬取
   */
  abstract scrape(params: ScrapeParams): Promise<RawData[]>;

  /**
   * 验证数据完整性
   */
  abstract validate(data: RawData): boolean;

  /**
   * 转换为标准格式
   */
  abstract transform(data: RawData): StandardData;

  /**
   * 估算数据规模（用于判断公司大小）
   */
  protected estimateCompanySize(employeeCount?: number): 'small' | 'medium' | 'large' {
    if (!employeeCount) return 'small';
    if (employeeCount < 50) return 'small';
    if (employeeCount < 500) return 'medium';
    return 'large';
  }

  /**
   * 提取域名
   */
  protected extractDomain(url: string): string {
    try {
      const domain = new URL(url).hostname;
      return domain.replace(/^www\./, '');
    } catch {
      return '';
    }
  }
}
