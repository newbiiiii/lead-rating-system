/**
 * 业务线服务
 * 根据任务名称识别业务线和材质，返回对应的评级标准
 * 
 * 结构说明：
 * - Business (大类): 建材 / 成品 / 原料
 * - SubCategory (材质/小类): 每个业务线下有多种材质，各有不同的评级标准
 */

import { logger } from '../utils/logger';

// 业务线类型
export type BusinessType = '建材' | '成品' | '原料';

// 业务线上下文返回结构
export interface BusinessContext {
    ratingPrompt: string;
    business: BusinessType;
    subCategory: string;  // 具体的材质/子类名称
}

// 材质配置
interface SubCategoryConfig {
    name: string;           // 材质/子类名称
    keywords: string[];     // 匹配关键词
    ratingPrompt: string;   // 评级标准
}

// 业务线配置
interface BusinessConfig {
    subCategories: SubCategoryConfig[];
}

// 业务线映射配置
const BUSINESS_CONFIG: Record<BusinessType, BusinessConfig> = {
    '建材': {
        subCategories: [
            {
                name: '墙板',
                keywords: ['wall panel', 'acoustic panel', 'decoration panel'],
                ratingPrompt: `
Task Context: We are looking for potential B2B clients in the construction/home decoration industry (e.g., Wall Panels, Flooring). Focus on their wholesale capacity and project experience.

Please classify this company into Tier A, B, or C based on the following strict criteria:

### Tier A (Must meet ALL):
1. **Product**: Explicitly sells Flat Wall Panel, Acoustic Wall Panel, or Wall Panel.
2. **Material**: Made of PS, PVC, SPC, WPC, MDF, PE, PET, or Aluminum Alloy.
3. **Role**: Is a distributor, wholesaler, or retailer (Sales Channel).
4. **Non-Manufacturer**: Does not produce these panels in their own local factory.
5. **Origin**: Is NOT a Chinese company.

### Tier B (Must meet ALL):
1. **Industry Synergy**: Does not explicitly list wall panels, but is a large/strong player in related sectors: Flooring, Doors/Windows, Furniture, Sanitary Ware, Ceramics, Ceilings, or Acoustic Systems.
2. **Potential**: High potential to become a distributor, importer, or strategic partner.
3. **Capability**: Has importer, wholesaler, or distributor qualifications.
4. **Origin**: Is NOT a Chinese company.

### Tier C (Meets ANY):
1. **Chinese Entity**: Is a Chinese factory or trading company (based on address, domain, or phone).
2. **Irrelevant**: Main business is unrelated to construction or home decor (e.g., electronics, apparel, food).
3. **Invalid Source**: The page is not a corporate official website (e.g., B2B platform like Indiamart/Alibaba, directory site).
                `.trim()
            },
        ]
    },
    '成品': {
        subCategories: []
    },
    '原料': {
        subCategories: [
            {
                name: '垃圾袋制造商',
                keywords: [],
                ratingPrompt: `
Task Context: We are identifying high-quality B2B leads in the plastic packaging and waste management industry, specifically focusing on Garbage Bags/Bin Liners.

Please classify this company into Tier A, B, or C based on the following strict criteria:

### Tier A (Must meet ALL):
1. **Product**: Explicitly sells or distributes Garbage Bags, Trash Bags, Bin Liners, or Refuse Sacks.
2. **Material/Specialty**: Offers standard PE bags or specialized bags (e.g., Biodegradable, Compostable, or Heavy-duty Industrial bags).
3. **Role**: Functions as a professional Distributor, Wholesaler, or Cleaning Supply Provider.
4. **Target Market**: Serves B2B sectors like facility management, hospitality, hospitals, or large-scale retail.
5. **Origin**: Is NOT a Chinese company.

### Tier B (Must meet ALL):
1. **Industry Synergy**: Does not focus primarily on garbage bags, but is a major player in General Plastic Packaging, Professional Cleaning Chemicals, or Janitorial Supplies.
2. **Potential**: Strong potential to add garbage bags to their existing product portfolio as a key distributor or importer.
3. **Scale**: Shows significant business scale (e.g., large warehouse, multiple branches, or high employee count).
4. **Origin**: Is NOT a Chinese company.

### Tier C (Meets ANY):
1. **Chinese Entity**: Is a Chinese manufacturer or trading company (based on address, domain, or phone).
2. **Irrelevant**: Main business is unrelated to packaging or cleaning supplies (e.g., software, food ingredients, textiles).
3. **End User Only**: Is merely a consumer of bags (like a single restaurant or a small office) rather than a reseller/distributor.
4. **Invalid Source**: The link is a B2B directory (Indiamart, Justdial) or a social media profile, not an official corporate website.
                `.trim()
            }
        ]
    }
};

/**
 * 根据任务名称获取业务上下文
 * @param taskName 任务名称
 * @returns 业务上下文，包含评级标准、业务线和材质；如果没有匹配返回 null
 */
export function getBusinessContext(taskName: string): BusinessContext | null {
    const name = taskName.toLowerCase();

    for (const [businessType, config] of Object.entries(BUSINESS_CONFIG)) {
        for (const subCategory of config.subCategories) {
            for (const keyword of subCategory.keywords) {
                if (name.includes(keyword)) {
                    logger.debug(`[BusinessService] 任务 "${taskName}" 匹配业务线: ${businessType}, 材质: ${subCategory.name}`);
                    return {
                        ratingPrompt: subCategory.ratingPrompt,
                        business: businessType as BusinessType,
                        subCategory: subCategory.name
                    };
                }
            }
        }
    }

    logger.debug(`[BusinessService] 任务 "${taskName}" 未匹配任何业务线`);
    return null;
}

/**
 * 获取所有支持的业务线
 */
export function getSupportedBusinessTypes(): BusinessType[] {
    return Object.keys(BUSINESS_CONFIG) as BusinessType[];
}

/**
 * 获取指定业务线下的所有材质/子类
 */
export function getSubCategoriesByBusiness(businessType: BusinessType): string[] {
    const config = BUSINESS_CONFIG[businessType];
    return config ? config.subCategories.map(sc => sc.name) : [];
}

/**
 * 根据业务线和材质获取评级标准
 */
export function getRatingPromptBySubCategory(businessType: BusinessType, subCategoryName: string): string | null {
    const config = BUSINESS_CONFIG[businessType];
    if (!config) return null;

    const subCategory = config.subCategories.find(sc => sc.name === subCategoryName);
    return subCategory ? subCategory.ratingPrompt : null;
}

/**
 * 兼容旧接口：仅返回评级标准字符串
 * @param taskName 任务名称
 */
export function getDynamicRatingContext(taskName: string): string | null {
    const context = getBusinessContext(taskName);
    return context ? context.ratingPrompt : null;
}
