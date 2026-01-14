/**
 * 业务线服务
 * 根据任务名称识别业务线和材质，返回对应的评级标准
 * 
 * 结构说明：
 * - Business (大类): 建材 / 成品 / 原料
 * - SubCategory (材质/小类): 每个业务线下有多种材质，各有不同的评级标准
 * 
 * 业务线特点：
 * - 建材、成品：目标客户为非制造商（经销商、批发商、零售商）
 * - 原料：目标客户为制造商
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

// ============================================================
// 业务线映射配置
// ============================================================
const BUSINESS_CONFIG: Record<BusinessType, BusinessConfig> = {
    // ============================================================
    // 建材业务线（目标：非制造商 - 经销商、批发商、零售商）
    // ============================================================
    '建材': {
        subCategories: [
            {
                name: '墙板',
                keywords: ['wall panel', 'acoustic panel', 'decoration panel', 'wpc panel', 'pvc panel'],
                ratingPrompt: `
Task Context: We are looking for potential B2B clients in the construction/home decoration industry, specifically Wall Panels. Focus on their wholesale capacity and distribution network.

Please classify this company into Tier A, B, or C based on the following strict criteria:

### Tier A (Must meet ALL):
1. **Product**: Explicitly sells Wall Panels (Flat Wall Panel, Acoustic Wall Panel, WPC Panel, PVC Panel, etc.).
2. **Material**: Made of PS, PVC, SPC, WPC, MDF, PE, PET, or Aluminum Alloy.
3. **Role**: Is a distributor, wholesaler, or retailer (Sales Channel).
4. **Non-Manufacturer**: Does NOT produce these panels in their own factory.
5. **Origin**: Is NOT a Chinese company.

### Tier B (Must meet ALL):
1. **Industry Synergy**: Does not explicitly list wall panels, but is a large player in related sectors: Flooring, Doors/Windows, Furniture, Sanitary Ware, Ceramics, Ceilings, or Acoustic Systems.
2. **Potential**: High potential to become a distributor or importer.
3. **Capability**: Has importer, wholesaler, or distributor qualifications.
4. **Origin**: Is NOT a Chinese company.

### Tier C (Meets ANY):
1. **Chinese Entity**: Is a Chinese factory or trading company.
2. **Manufacturer**: Produces wall panels in their own factory.
3. **Irrelevant**: Main business is unrelated to construction or home decor.
4. **Invalid Source**: The page is a B2B platform (Alibaba, Indiamart) or directory site.
                `.trim()
            },
            {
                name: '地板',
                keywords: ['flooring', 'floor', 'spc floor', 'laminate floor', 'vinyl floor', 'wpc floor'],
                ratingPrompt: `
Task Context: We are looking for B2B clients in the flooring industry (SPC, WPC, Laminate, Vinyl flooring). Target is distributors, not manufacturers.

Please classify this company into Tier A, B, or C:

### Tier A (Must meet ALL):
1. **Product**: Sells flooring products (SPC, WPC, Laminate, Vinyl, or Hardwood flooring).
2. **Role**: Is a distributor, wholesaler, importer, or retailer.
3. **Non-Manufacturer**: Does NOT produce flooring in their own factory.
4. **Scale**: Has significant market presence or distribution network.
5. **Origin**: Is NOT a Chinese company.

### Tier B (Must meet ALL):
1. **Industry Synergy**: Operates in home improvement, interior design, or construction materials.
2. **Potential**: Could expand into flooring distribution.
3. **Non-Manufacturer**: Not a flooring manufacturer.
4. **Origin**: Is NOT a Chinese company.

### Tier C (Meets ANY):
1. **Chinese Entity**: Is a Chinese manufacturer or trading company.
2. **Manufacturer**: Produces flooring in their own factory.
3. **Irrelevant**: Main business unrelated to flooring or construction.
4. **Invalid Source**: Not a corporate website.
                `.trim()
            },
            {
                name: '吸音板',
                keywords: ['acoustic', 'sound absorbing', 'soundproof', 'acoustic panel', 'acoustic board'],
                ratingPrompt: `
Task Context: We are looking for B2B clients in the acoustic solutions industry (Acoustic Panels, Sound Absorbing Boards). Target is distributors, not manufacturers.

Please classify this company into Tier A, B, or C:

### Tier A (Must meet ALL):
1. **Product**: Sells acoustic panels, sound absorbing boards, or soundproofing materials.
2. **Role**: Is a distributor, wholesaler, or acoustic solutions provider.
3. **Non-Manufacturer**: Does NOT produce acoustic panels in their own factory.
4. **Market**: Serves commercial/residential construction, studios, offices, or theaters.
5. **Origin**: Is NOT a Chinese company.

### Tier B (Must meet ALL):
1. **Industry Synergy**: Operates in interior fit-out, ceiling systems, or construction materials.
2. **Potential**: Could add acoustic products to their portfolio.
3. **Non-Manufacturer**: Not an acoustic panel manufacturer.
4. **Origin**: Is NOT a Chinese company.

### Tier C (Meets ANY):
1. **Chinese Entity**: Is a Chinese manufacturer or trading company.
2. **Manufacturer**: Produces acoustic panels in their own factory.
3. **Irrelevant**: Main business unrelated to construction or acoustics.
4. **Invalid Source**: Not a corporate website.
                `.trim()
            }
        ]
    },

    // ============================================================
    // 成品业务线（目标：非制造商 - 经销商、批发商、零售商）
    // ============================================================
    '成品': {
        subCategories: [
            {
                name: '相框',
                keywords: ['photo frame', 'picture frame', 'photo holder'],
                ratingPrompt: `
Task Context: We are looking for B2B clients in the photo frame industry. Target is distributors and retailers, not manufacturers.

Please classify this company into Tier A, B, or C:

### Tier A (Must meet ALL):
1. **Product**: Sells photo frames, picture frames, or related products.
2. **Role**: Is a distributor, wholesaler, retailer, or home decor chain.
3. **Non-Manufacturer**: Does NOT produce frames in their own factory.
4. **Scale**: Has retail stores, online presence, or distribution network.
5. **Origin**: Is NOT a Chinese company.

### Tier B (Must meet ALL):
1. **Industry Synergy**: Operates in home decor, gift items, or interior accessories.
2. **Potential**: Could add photo frames to their product range.
3. **Non-Manufacturer**: Not a frame manufacturer.
4. **Origin**: Is NOT a Chinese company.

### Tier C (Meets ANY):
1. **Chinese Entity**: Is a Chinese manufacturer or trading company.
2. **Manufacturer**: Produces frames in their own factory.
3. **Irrelevant**: Main business unrelated to home decor or gifts.
4. **Invalid Source**: Not a corporate website.
                `.trim()
            },
            {
                name: '镜框',
                keywords: ['mirror frame', 'decorative mirror', 'wall mirror frame'],
                ratingPrompt: `
Task Context: We are looking for B2B clients in the mirror frame industry. Target is distributors and retailers, not manufacturers.

Please classify this company into Tier A, B, or C:

### Tier A (Must meet ALL):
1. **Product**: Sells mirror frames, decorative mirrors, or wall mirror products.
2. **Role**: Is a distributor, wholesaler, retailer, or furniture/home decor chain.
3. **Non-Manufacturer**: Does NOT produce mirror frames in their own factory.
4. **Scale**: Has retail presence or distribution network.
5. **Origin**: Is NOT a Chinese company.

### Tier B (Must meet ALL):
1. **Industry Synergy**: Operates in home decor, furniture, or interior design.
2. **Potential**: Could add mirror frames to their portfolio.
3. **Non-Manufacturer**: Not a mirror frame manufacturer.
4. **Origin**: Is NOT a Chinese company.

### Tier C (Meets ANY):
1. **Chinese Entity**: Is a Chinese manufacturer or trading company.
2. **Manufacturer**: Produces mirror frames in their own factory.
3. **Irrelevant**: Main business unrelated to home decor.
4. **Invalid Source**: Not a corporate website.
                `.trim()
            },
            {
                name: '画框',
                keywords: ['art frame', 'canvas frame', 'painting frame', 'gallery frame'],
                ratingPrompt: `
Task Context: We are looking for B2B clients in the art/painting frame industry. Target is distributors and retailers, not manufacturers.

Please classify this company into Tier A, B, or C:

### Tier A (Must meet ALL):
1. **Product**: Sells art frames, canvas frames, painting frames, or gallery framing supplies.
2. **Role**: Is a distributor, wholesaler, art supply store, or gallery supplier.
3. **Non-Manufacturer**: Does NOT produce frames in their own factory.
4. **Market**: Serves art galleries, artists, or framing shops.
5. **Origin**: Is NOT a Chinese company.

### Tier B (Must meet ALL):
1. **Industry Synergy**: Operates in art supplies, craft materials, or home decor.
2. **Potential**: Could add art frames to their product range.
3. **Non-Manufacturer**: Not a frame manufacturer.
4. **Origin**: Is NOT a Chinese company.

### Tier C (Meets ANY):
1. **Chinese Entity**: Is a Chinese manufacturer or trading company.
2. **Manufacturer**: Produces art frames in their own factory.
3. **Irrelevant**: Main business unrelated to art or home decor.
4. **Invalid Source**: Not a corporate website.
                `.trim()
            },
            {
                name: '框条',
                keywords: ['moulding', 'frame moulding', 'ps moulding', 'picture moulding', 'decorative moulding'],
                ratingPrompt: `
Task Context: We are looking for B2B clients in the moulding/frame moulding industry. Target is distributors, not manufacturers.

Please classify this company into Tier A, B, or C:

### Tier A (Must meet ALL):
1. **Product**: Sells frame mouldings, PS mouldings, or decorative mouldings.
2. **Role**: Is a distributor, wholesaler, or framing industry supplier.
3. **Non-Manufacturer**: Does NOT produce mouldings in their own factory.
4. **Market**: Supplies to frame shops, picture framers, or home decor retailers.
5. **Origin**: Is NOT a Chinese company.

### Tier B (Must meet ALL):
1. **Industry Synergy**: Operates in framing supplies, home decor, or construction trim.
2. **Potential**: Could add mouldings to their product range.
3. **Non-Manufacturer**: Not a moulding manufacturer.
4. **Origin**: Is NOT a Chinese company.

### Tier C (Meets ANY):
1. **Chinese Entity**: Is a Chinese manufacturer or trading company.
2. **Manufacturer**: Produces mouldings in their own factory.
3. **Irrelevant**: Main business unrelated to framing or decor.
4. **Invalid Source**: Not a corporate website.
                `.trim()
            }
        ]
    },

    // ============================================================
    // 原料业务线（目标：制造商）
    // ============================================================
    '原料': {
        subCategories: [
            {
                name: 'PS保温板厂',
                keywords: ['eps insulation', 'xps insulation', 'ps foam', 'polystyrene insulation', 'insulation board'],
                ratingPrompt: `
Task Context: We are looking for EPS/XPS insulation board MANUFACTURERS who could be potential buyers of PS raw materials.

Please classify this company into Tier A, B, or C:

### Tier A (Must meet ALL):
1. **Product**: Manufactures EPS or XPS insulation boards, PS foam products.
2. **Role**: Is a MANUFACTURER with their own production facility.
3. **Scale**: Has significant production capacity or multiple production lines.
4. **Market**: Supplies to construction industry or insulation distributors.
5. **Origin**: Is NOT a Chinese company.

### Tier B (Must meet ALL):
1. **Industry Synergy**: Operates in foam products, packaging, or construction materials manufacturing.
2. **Potential**: Has or could establish PS foam production capabilities.
3. **Manufacturer**: Has manufacturing experience.
4. **Origin**: Is NOT a Chinese company.

### Tier C (Meets ANY):
1. **Chinese Entity**: Is a Chinese manufacturer or trading company.
2. **Non-Manufacturer**: Only trades or distributes, does not manufacture.
3. **Irrelevant**: Main business unrelated to foam or insulation.
4. **Invalid Source**: Not a corporate website.
                `.trim()
            },
            {
                name: 'PS框条制造商',
                keywords: ['ps moulding manufacturer', 'polystyrene moulding', 'ps frame manufacturer', 'foam moulding'],
                ratingPrompt: `
Task Context: We are looking for PS moulding/frame MANUFACTURERS who could be potential buyers of PS raw materials.

Please classify this company into Tier A, B, or C:

### Tier A (Must meet ALL):
1. **Product**: Manufactures PS mouldings, polystyrene frame profiles, or foam mouldings.
2. **Role**: Is a MANUFACTURER with their own extrusion/production facility.
3. **Scale**: Has significant production capacity.
4. **Market**: Supplies to frame industry or home decor manufacturers.
5. **Origin**: Is NOT a Chinese company.

### Tier B (Must meet ALL):
1. **Industry Synergy**: Operates in plastic extrusion, foam products, or decorative profiles manufacturing.
2. **Potential**: Could manufacture PS mouldings.
3. **Manufacturer**: Has plastics manufacturing experience.
4. **Origin**: Is NOT a Chinese company.

### Tier C (Meets ANY):
1. **Chinese Entity**: Is a Chinese manufacturer or trading company.
2. **Non-Manufacturer**: Only trades or distributes mouldings.
3. **Irrelevant**: Main business unrelated to plastics or mouldings.
4. **Invalid Source**: Not a corporate website.
                `.trim()
            },
            {
                name: 'PE管道制造商',
                keywords: ['pe pipe', 'hdpe pipe', 'polyethylene pipe', 'plastic pipe manufacturer', 'water pipe'],
                ratingPrompt: `
Task Context: We are looking for PE pipe MANUFACTURERS who could be potential buyers of PE raw materials.

Please classify this company into Tier A, B, or C:

### Tier A (Must meet ALL):
1. **Product**: Manufactures PE pipes, HDPE pipes, or polyethylene piping systems.
2. **Role**: Is a MANUFACTURER with their own extrusion facility.
3. **Scale**: Has significant production capacity for pipe manufacturing.
4. **Market**: Supplies to construction, water utilities, or infrastructure projects.
5. **Origin**: Is NOT a Chinese company.

### Tier B (Must meet ALL):
1. **Industry Synergy**: Operates in plastic pipe, irrigation, or infrastructure products manufacturing.
2. **Potential**: Could expand into PE pipe production.
3. **Manufacturer**: Has plastics extrusion experience.
4. **Origin**: Is NOT a Chinese company.

### Tier C (Meets ANY):
1. **Chinese Entity**: Is a Chinese manufacturer or trading company.
2. **Non-Manufacturer**: Only trades or distributes pipes.
3. **Irrelevant**: Main business unrelated to pipes or plastics.
4. **Invalid Source**: Not a corporate website.
                `.trim()
            },
            {
                name: 'PE土工膜制造商',
                keywords: ['geomembrane', 'hdpe liner', 'pe liner', 'geosynthetic', 'pond liner'],
                ratingPrompt: `
Task Context: We are looking for geomembrane/liner MANUFACTURERS who could be potential buyers of PE raw materials.

Please classify this company into Tier A, B, or C:

### Tier A (Must meet ALL):
1. **Product**: Manufactures HDPE geomembranes, PE liners, or geosynthetic products.
2. **Role**: Is a MANUFACTURER with their own production facility.
3. **Scale**: Has significant production capacity for film/liner manufacturing.
4. **Market**: Supplies to environmental, mining, or civil engineering projects.
5. **Origin**: Is NOT a Chinese company.

### Tier B (Must meet ALL):
1. **Industry Synergy**: Operates in geosynthetics, environmental products, or plastic film manufacturing.
2. **Potential**: Could produce geomembranes or liners.
3. **Manufacturer**: Has film extrusion experience.
4. **Origin**: Is NOT a Chinese company.

### Tier C (Meets ANY):
1. **Chinese Entity**: Is a Chinese manufacturer or trading company.
2. **Non-Manufacturer**: Only trades or installs geomembranes.
3. **Irrelevant**: Main business unrelated to geosynthetics or plastics.
4. **Invalid Source**: Not a corporate website.
                `.trim()
            },
            {
                name: 'PE垃圾袋制造商',
                keywords: ['garbage bag manufacturer', 'trash bag manufacturer', 'bin liner manufacturer', 'plastic bag factory'],
                ratingPrompt: `
Task Context: We are looking for garbage bag/plastic bag MANUFACTURERS who could be potential buyers of PE raw materials.

Please classify this company into Tier A, B, or C:

### Tier A (Must meet ALL):
1. **Product**: Manufactures garbage bags, trash bags, bin liners, or plastic bags.
2. **Role**: Is a MANUFACTURER with their own blown film/bag making facility.
3. **Scale**: Has significant production capacity.
4. **Market**: Supplies to distributors, retailers, or industrial clients.
5. **Origin**: Is NOT a Chinese company.

### Tier B (Must meet ALL):
1. **Industry Synergy**: Operates in plastic packaging, flexible packaging, or film manufacturing.
2. **Potential**: Could produce garbage bags or plastic bags.
3. **Manufacturer**: Has film or bag manufacturing experience.
4. **Origin**: Is NOT a Chinese company.

### Tier C (Meets ANY):
1. **Chinese Entity**: Is a Chinese manufacturer or trading company.
2. **Non-Manufacturer**: Only trades or distributes garbage bags.
3. **Irrelevant**: Main business unrelated to plastic bags or packaging.
4. **Invalid Source**: Not a corporate website.
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
