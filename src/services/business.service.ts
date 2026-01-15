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
export type BusinessType = '建材' | '成品' | '原料' | '机械';

// 业务线上下文返回结构
export interface BusinessContext {
    ratingPrompt: string;
    business: BusinessType;
    subCategory: string;  // 具体的材质/子类名称
    apiKey: number | null;
}

// 材质配置
interface SubCategoryConfig {
    name: string;           // 材质/子类名称
    keywords: string[];     // 匹配关键词
    ratingPrompt: string;   // 评级标准
}

// 业务线配置
interface BusinessConfig {
    apiKey: number | null,
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
        apiKey: 1,
        subCategories: [
            {
                name: '墙板',
                keywords: ['wall panel', 'acoustic panel', 'decoration panel', 'wpc panel', 'pvc panel'],
                ratingPrompt: `
Task Context: We are looking for potential B2B clients in wall panels. Target: distributors, NOT manufacturers.

### Tier A (Must meet ALL):
1. **Product**: Website explicitly mentions selling wall panels (check: product pages, catalogs, "we supply", "we distribute")
2. **Material**: Mentions PS, PVC, SPC, WPC, MDF, PE, PET, or Aluminum materials
3. **Role Indicators**: 
   - ✓ Uses terms: "distributor", "wholesaler", "retailer", "importer", "dealer"
   - ✗ Does NOT use: "manufacturer", "factory", "we produce", "our production line"
4. **Geographic Verification**:
   - Check company address (NOT in China mainland)
   - Check domain (.cn domains are usually Chinese)
   - Check phone country code
5. **Scale**: Has multiple locations OR mentions B2B/wholesale pricing

### Tier B (Must meet ALL):
1. **Adjacent Industry**: Explicitly in flooring, doors/windows, furniture, ceramics, ceilings, or acoustics
2. **Distribution Capability**: Website shows they distribute (not manufacture) products
3. **Market Position**: Uses words like "leading", "established", "years of experience"
4. **NOT Chinese**: Same geographic verification as Tier A
5. **Expansion Potential**: Serves construction/interior design market

### Tier C (ANY of these = automatic Tier C):
1. **Chinese Company**:
   - Address contains: 中国, China (unless it's "Made in China" referring to products)
   - Domain: .cn or .com.cn
   - Phone: starts with +86
2. **Manufacturer**:
   - Mentions: "our factory", "production capacity", "manufacturing facility"
   - Has factory photos or production line images
3. **B2B Platform**: URL contains alibaba, made-in-china, indiamart, tradekey, etc.
4. **Irrelevant**: Main business clearly not related (check homepage, about us)

# Decision Logic
- If company meets ANY Tier C criteria → Rating: C
- If company meets ALL Tier A criteria → Rating: A  
- If company meets ALL Tier B criteria → Rating: B
- If uncertain or mixed signals → Rating: C (be conservative)
                `.trim()
            },
            {
                name: '地板',
                keywords: ['flooring', 'floor', 'spc floor', 'laminate floor', 'vinyl floor', 'wpc floor'],
                ratingPrompt: `
Task Context: We are looking for flooring distributors (SPC, WPC, Laminate, Vinyl). Target: distributors, NOT manufacturers.

### Tier A (Must meet ALL):
1. **Product**: Website explicitly shows flooring products (check product catalog, "flooring" section)
   - Types: SPC, WPC, Laminate, Vinyl, LVT, or Hardwood flooring
2. **Role Indicators**: 
   - ✓ Uses: "flooring distributor", "flooring supplier", "flooring wholesaler", "flooring retailer"
   - ✗ Does NOT use: "flooring manufacturer", "flooring factory", "we produce floors"
3. **Geographic Verification**:
   - NOT in China mainland (check address, domain .cn, phone +86)
4. **Distribution Evidence**: 
   - Has showrooms/warehouses OR multiple locations
   - Mentions "stocking dealer", "authorized distributor", "certified installer network"
5. **Scale**: Established business with market presence

### Tier B (Must meet ALL):
1. **Adjacent Industry**: Major player in construction materials, home improvement, or interior design
   - Examples: tile distributor, cabinet supplier, building materials dealer
2. **Distribution Model**: Clearly a distributor/retailer (not manufacturer)
3. **Market Position**: Significant presence ("20+ years", "regional leader", "100+ projects")
4. **NOT Chinese**: Verified non-Chinese company
5. **Expansion Potential**: Could add flooring to existing product mix

### Tier C (ANY = Tier C):
1. **Chinese Company**: Address/domain/phone indicates China-based
2. **Manufacturer**: Mentions factory, production, manufacturing facility
3. **B2B Platform**: alibaba, indiamart, made-in-china, etc.
4. **Irrelevant**: Not related to flooring, construction, or home improvement
5. **Invalid**: Not a corporate website (directory, listing site)

# Decision Logic
- ANY Tier C criteria → Rating: C
- ALL Tier A criteria → Rating: A
- ALL Tier B criteria → Rating: B
- Uncertain → Rating: C
                `.trim()
            },
            {
                name: '吸音板',
                keywords: ['acoustic', 'sound absorbing', 'soundproof', 'acoustic panel', 'acoustic board'],
                ratingPrompt: `
Task Context: We are looking for acoustic panel distributors. Target: distributors/installers, NOT manufacturers.

### Tier A (Must meet ALL):
1. **Product**: Website explicitly lists acoustic panels or soundproofing products
   - Types: acoustic wall panels, sound absorbing boards, acoustic ceiling tiles
2. **Role Indicators**: 
   - ✓ Uses: "acoustic solutions provider", "soundproofing supplier", "acoustic distributor"
   - ✗ Does NOT use: "acoustic panel manufacturer", "we produce acoustic panels"
3. **Geographic Verification**: NOT in China mainland
4. **Market Focus**: 
   - Serves: offices, studios, theaters, schools, or commercial spaces
   - Mentions installation services or acoustic consulting
5. **Distribution Evidence**: Has project portfolio, showroom, or dealer network

### Tier B (Must meet ALL):
1. **Adjacent Industry**: Strong player in related sectors:
   - Interior fit-out, ceiling systems, partition walls, office furniture
   - Construction materials with acoustic applications
2. **Distribution Model**: Clearly distributes (not manufactures) products
3. **Market Position**: Established with commercial/residential project experience
4. **NOT Chinese**: Verified non-Chinese company
5. **Synergy Potential**: Could add acoustic products to complement existing offerings

### Tier C (ANY = Tier C):
1. **Chinese Company**: Based in China (address/domain/phone)
2. **Manufacturer**: Produces acoustic panels in own factory
3. **B2B Platform**: alibaba, indiamart, etc.
4. **Irrelevant**: Not related to construction, acoustics, or interior design
5. **Invalid**: Not a real corporate website

# Decision Logic
- ANY Tier C criteria → Rating: C
- ALL Tier A criteria → Rating: A
- ALL Tier B criteria → Rating: B
- Uncertain → Rating: C
                `.trim()
            }
        ]
    },

    // ============================================================
    // 成品业务线（目标：非制造商 - 经销商、批发商、零售商）
    // ============================================================
    '成品': {
        apiKey: 2,
        subCategories: [
            {
                name: '相框',
                keywords: ['photo frame', 'picture frame', 'photo holder'],
                ratingPrompt: `
Task Context: We are looking for photo frame distributors/retailers. Target: distributors, NOT manufacturers.

### Tier A (Must meet ALL):
1. **Product**: Website clearly sells photo frames or picture frames
   - Check: product catalog, "frames" section, shopping cart
2. **Role Indicators**: 
   - ✓ Uses: "frame retailer", "frame distributor", "home decor store", "gift shop"
   - ✗ Does NOT use: "frame manufacturer", "frame factory", "custom framing manufacturer"
3. **Geographic Verification**: NOT in China mainland
4. **Retail/Distribution Evidence**: 
   - Has physical stores OR online shop
   - Mentions "in stock", "ready to ship", "wholesale available"
5. **Scale**: Established retail/distribution business

### Tier B (Must meet ALL):
1. **Adjacent Industry**: Strong player in home decor, gifts, or interior accessories
   - Examples: furniture store, home goods retailer, gift wholesaler
2. **Retail Model**: Clearly sells (not manufactures) products
3. **Market Position**: Established business with customer base
4. **NOT Chinese**: Verified non-Chinese company
5. **Expansion Potential**: Product mix could naturally include photo frames

### Tier C (ANY = Tier C):
1. **Chinese Company**: Based in China
2. **Manufacturer**: Produces frames in factory ("custom framing shop" offering framing services is OK)
3. **B2B Platform**: alibaba, indiamart, etc.
4. **Irrelevant**: Not related to home decor, gifts, or frames
5. **Invalid**: Not a corporate/retail website

# Decision Logic
- ANY Tier C criteria → Rating: C
- ALL Tier A criteria → Rating: A
- ALL Tier B criteria → Rating: B
- Uncertain → Rating: C
                `.trim()
            },
            {
                name: '镜框',
                keywords: ['mirror frame', 'decorative mirror', 'wall mirror frame'],
                ratingPrompt: `
Task Context: We are looking for mirror frame distributors/retailers. Target: distributors, NOT manufacturers.

### Tier A (Must meet ALL):
1. **Product**: Website clearly sells decorative mirrors or mirror frames
   - Check: product pages, "mirrors" section, mirror collections
2. **Role Indicators**: 
   - ✓ Uses: "mirror retailer", "home decor distributor", "furniture store"
   - ✗ Does NOT use: "mirror manufacturer", "mirror factory", "mirror production"
3. **Geographic Verification**: NOT in China mainland
4. **Retail/Distribution Evidence**: 
   - Has showrooms, stores, or e-commerce site
   - Mentions brands they carry or "curated collection"
5. **Scale**: Established retail or distribution business

### Tier B (Must meet ALL):
1. **Adjacent Industry**: Strong player in home decor, furniture, or interior design
   - Examples: furniture retailer, home accessories store, interior design shop
2. **Retail Model**: Clearly sells (not manufactures) products
3. **Market Position**: Established with good market presence
4. **NOT Chinese**: Verified non-Chinese company
5. **Product Fit**: Decorative mirrors would complement existing products

### Tier C (ANY = Tier C):
1. **Chinese Company**: Based in China
2. **Manufacturer**: Produces mirrors or mirror frames in factory
3. **B2B Platform**: alibaba, indiamart, etc.
4. **Irrelevant**: Not related to home decor or furniture
5. **Invalid**: Not a real retail/corporate website

# Decision Logic
- ANY Tier C criteria → Rating: C
- ALL Tier A criteria → Rating: A
- ALL Tier B criteria → Rating: B
- Uncertain → Rating: C
                `.trim()
            },
            {
                name: '画框',
                keywords: ['art frame', 'canvas frame', 'painting frame', 'gallery frame'],
                ratingPrompt: `
Task Context: We are looking for art/painting frame distributors. Target: distributors/retailers, NOT manufacturers.

### Tier A (Must meet ALL):
1. **Product**: Website clearly sells art frames, canvas frames, or gallery frames
   - Check: frame selection, "art supplies" section, gallery framing
2. **Role Indicators**: 
   - ✓ Uses: "frame distributor", "art supply store", "framing materials supplier"
   - ✗ Does NOT use: "frame manufacturer", "frame production", (but "custom framing service" is OK)
3. **Geographic Verification**: NOT in China mainland
4. **Distribution Evidence**: 
   - Sells to artists, galleries, or frame shops
   - Mentions brands, bulk pricing, or "framing supplies"
5. **Market**: Serves art industry, galleries, or professional framers

### Tier B (Must meet ALL):
1. **Adjacent Industry**: Strong player in art supplies, craft materials, or gallery services
   - Examples: art supply distributor, craft store chain, gallery supplier
2. **Retail Model**: Clearly distributes (not manufactures) products
3. **Market Position**: Established in art/craft industry
4. **NOT Chinese**: Verified non-Chinese company
5. **Expansion Potential**: Could add art frames to complement existing art supplies

### Tier C (ANY = Tier C):
1. **Chinese Company**: Based in China
2. **Manufacturer**: Produces art frames in factory (custom framing shop doing finishing work is OK)
3. **B2B Platform**: alibaba, indiamart, etc.
4. **Irrelevant**: Not related to art, framing, or craft supplies
5. **Invalid**: Not a real corporate website

# Decision Logic
- ANY Tier C criteria → Rating: C
- ALL Tier A criteria → Rating: A
- ALL Tier B criteria → Rating: B
- Uncertain → Rating: C
                `.trim()
            },
            {
                name: '框条',
                keywords: ['moulding', 'frame moulding', 'ps moulding', 'picture moulding', 'decorative moulding'],
                ratingPrompt: `
Task Context: We are looking for frame moulding distributors. Target: distributors, NOT manufacturers.

### Tier A (Must meet ALL):
1. **Product**: Website clearly sells frame mouldings or picture mouldings
   - Types: PS moulding, wood moulding, decorative profiles
2. **Role Indicators**: 
   - ✓ Uses: "moulding distributor", "frame moulding supplier", "framing supplies wholesaler"
   - ✗ Does NOT use: "moulding manufacturer", "extrusion factory", "moulding production"
3. **Geographic Verification**: NOT in China mainland
4. **Distribution Evidence**: 
   - Supplies to frame shops, professional framers, or retailers
   - Mentions "stocking distributor", brands carried, or wholesale pricing
5. **Market**: Serves framing industry or home decor market

### Tier B (Must meet ALL):
1. **Adjacent Industry**: Strong player in framing supplies, home decor trim, or construction mouldings
   - Examples: building trim distributor, interior finishing supplier
2. **Distribution Model**: Clearly distributes (not manufactures) products
3. **Market Position**: Established in related industry
4. **NOT Chinese**: Verified non-Chinese company
5. **Expansion Potential**: Could add frame mouldings to existing trim/moulding offerings

### Tier C (ANY = Tier C):
1. **Chinese Company**: Based in China
2. **Manufacturer**: Produces mouldings (extrusion, manufacturing facility)
3. **B2B Platform**: alibaba, indiamart, etc.
4. **Irrelevant**: Not related to framing, mouldings, or trim
5. **Invalid**: Not a real corporate website

# Decision Logic
- ANY Tier C criteria → Rating: C
- ALL Tier A criteria → Rating: A
- ALL Tier B criteria → Rating: B
- Uncertain → Rating: C
                `.trim()
            }
        ]
    },

    // ============================================================
    // 原料业务线（目标：制造商）
    // ============================================================
    '原料': {
        apiKey: 3,
        subCategories: [
            {
                name: 'PS保温板厂',
                keywords: ['eps insulation', 'xps insulation', 'ps foam', 'polystyrene insulation', 'insulation board'],
                ratingPrompt: `
Task Context: We SELL PS raw materials. Target: EPS/XPS insulation board MANUFACTURERS.

### Tier A (Must meet ALL):
1. **Manufacturer**: Explicitly states they MANUFACTURE/PRODUCE insulation boards
   - Look for: "manufacturer", "factory", "production", "we produce"
2. **Product**: Makes EPS or XPS insulation boards, PS foam products
   - Types: expanded polystyrene, extruded polystyrene, foam boards
3. **Facility Evidence**: 
   - Mentions: production lines, manufacturing capacity, factory size
   - Has: factory photos, equipment images, production process
4. **Scale Indicators**: 
   - Production capacity numbers (e.g., "10,000 m³/day", "5 production lines")
   - Large facility or multiple factories
5. **NOT Chinese**: NOT based in China (we export to them, they're competitors domestically)

### Tier B (Must meet ALL):
1. **Related Manufacturing**: Produces foam products, packaging, or construction materials
   - Could use PS raw materials in production
2. **Has Facilities**: Owns manufacturing equipment and production capability
3. **Expansion Potential**: Could expand into EPS/XPS production
4. **NOT Chinese**: Verified non-Chinese manufacturer
5. **Scale**: Mid to large manufacturing operation

### Tier C (ANY = Tier C):
1. **Chinese Manufacturer**: Based in China (we don't export PS raw materials to China)
2. **Distributor Only**: Only sells/distributes insulation, doesn't manufacture
3. **Installer/Contractor**: Only installs insulation, no manufacturing
4. **Irrelevant**: Doesn't manufacture anything related to PS/foam
5. **Invalid**: B2B platform or directory site

# Decision Logic (REVERSE: We want manufacturers!)
- Based in China → Rating: C (automatic)
- Is a distributor/trader → Rating: C
- ALL Tier A criteria → Rating: A (ideal: foreign EPS/XPS manufacturer)
- ALL Tier B criteria → Rating: B (potential: related manufacturer)
- Otherwise → Rating: C
                `.trim()
            },
            {
                name: 'PS框条制造商',
                keywords: ['ps moulding manufacturer', 'polystyrene moulding', 'ps frame manufacturer', 'foam moulding'],
                ratingPrompt: `
Task Context: We SELL PS raw materials. Target: PS moulding MANUFACTURERS.

### Tier A (Must meet ALL):
1. **Manufacturer**: Explicitly states they MANUFACTURE PS mouldings
   - Look for: "manufacturer", "factory", "we produce", "extrusion"
2. **Product**: Makes PS mouldings, polystyrene frame profiles, or foam mouldings
3. **Facility Evidence**: 
   - Mentions: extrusion lines, production facility, manufacturing capacity
   - Has: factory images, production equipment, machinery
4. **Scale Indicators**: 
   - Production capacity, number of extrusion lines
   - Large product range (100+ profiles)
5. **NOT Chinese**: NOT based in China

### Tier B (Must meet ALL):
1. **Related Manufacturing**: Produces plastic extrusion, foam products, or decorative profiles
   - Could use PS raw materials
2. **Has Equipment**: Owns extrusion or molding equipment
3. **Expansion Potential**: Could manufacture PS mouldings
4. **NOT Chinese**: Verified non-Chinese manufacturer
5. **Plastics Experience**: Has plastics manufacturing background

### Tier C (ANY = Tier C):
1. **Chinese Manufacturer**: Based in China
2. **Distributor Only**: Only sells/distributes mouldings, no manufacturing
3. **Frame Shop**: Custom framing service (cuts/assembles frames, doesn't extrude mouldings)
4. **Irrelevant**: Doesn't manufacture plastics or mouldings
5. **Invalid**: B2B platform or directory

# Decision Logic (REVERSE: We want manufacturers!)
- Based in China → Rating: C
- Only distributes → Rating: C
- ALL Tier A criteria → Rating: A (ideal: foreign PS moulding manufacturer)
- ALL Tier B criteria → Rating: B (potential: plastics extrusion manufacturer)
- Otherwise → Rating: C
                `.trim()
            },
            {
                name: 'PE管道制造商',
                keywords: ['pe pipe', 'hdpe pipe', 'polyethylene pipe', 'plastic pipe manufacturer', 'water pipe'],
                ratingPrompt: `
Task Context: We SELL PE raw materials. Target: PE pipe MANUFACTURERS.

### Tier A (Must meet ALL):
1. **Manufacturer**: Explicitly states they MANUFACTURE PE/HDPE pipes
   - Look for: "pipe manufacturer", "pipe factory", "we produce pipes"
2. **Product**: Makes PE pipes, HDPE pipes, or polyethylene piping systems
3. **Facility Evidence**: 
   - Mentions: extrusion lines, pipe production, manufacturing capacity
   - Has: factory photos, pipe production equipment
4. **Scale Indicators**: 
   - Production capacity (tons/year, meters/year)
   - Multiple extrusion lines or pipe diameters
5. **NOT Chinese**: NOT based in China

### Tier B (Must meet ALL):
1. **Related Manufacturing**: Produces plastic pipes, irrigation systems, or infrastructure products
   - Could use PE raw materials
2. **Has Equipment**: Owns pipe extrusion equipment
3. **Expansion Potential**: Could expand PE pipe production
4. **NOT Chinese**: Verified non-Chinese manufacturer
5. **Plastics Experience**: Has pipe or plastics extrusion background

### Tier C (ANY = Tier C):
1. **Chinese Manufacturer**: Based in China
2. **Distributor/Trader**: Only sells/distributes pipes, no manufacturing
3. **Installer/Contractor**: Only installs piping systems
4. **Irrelevant**: Doesn't manufacture pipes or plastics
5. **Invalid**: B2B platform or directory

# Decision Logic (REVERSE: We want manufacturers!)
- Based in China → Rating: C
- Only distributes/installs → Rating: C
- ALL Tier A criteria → Rating: A (ideal: foreign PE pipe manufacturer)
- ALL Tier B criteria → Rating: B (potential: plastics manufacturer)
- Otherwise → Rating: C
                `.trim()
            },
            {
                name: 'PE土工膜制造商',
                keywords: ['geomembrane', 'hdpe liner', 'pe liner', 'geosynthetic', 'pond liner'],
                ratingPrompt: `
Task Context: We SELL PE raw materials. Target: Geomembrane/liner MANUFACTURERS.

### Tier A (Must meet ALL):
1. **Manufacturer**: Explicitly states they MANUFACTURE geomembranes or liners
   - Look for: "geomembrane manufacturer", "liner production", "we manufacture"
2. **Product**: Makes HDPE geomembranes, PE liners, or geosynthetic products
3. **Facility Evidence**: 
   - Mentions: blown film lines, calendering, manufacturing facility
   - Has: production equipment, factory images
4. **Scale Indicators**: 
   - Production capacity (sqm/year, thickness range)
   - Multiple production lines or facilities
5. **NOT Chinese**: NOT based in China

### Tier B (Must meet ALL):
1. **Related Manufacturing**: Produces geosynthetics, plastic films, or environmental products
   - Could use PE raw materials
2. **Has Equipment**: Owns film extrusion or calendering equipment
3. **Expansion Potential**: Could produce geomembranes
4. **NOT Chinese**: Verified non-Chinese manufacturer
5. **Film Experience**: Has plastic film manufacturing background

### Tier C (ANY = Tier C):
1. **Chinese Manufacturer**: Based in China
2. **Distributor/Trader**: Only sells/distributes geomembranes
3. **Installer Only**: Only installs liners, no manufacturing
4. **Irrelevant**: Doesn't manufacture films or geosynthetics
5. **Invalid**: B2B platform or directory

# Decision Logic (REVERSE: We want manufacturers!)
- Based in China → Rating: C
- Only distributes/installs → Rating: C
- ALL Tier A criteria → Rating: A (ideal: foreign geomembrane manufacturer)
- ALL Tier B criteria → Rating: B (potential: film manufacturer)
- Otherwise → Rating: C
                `.trim()
            },
            {
                name: 'PE垃圾袋制造商',
                keywords: ['garbage bag manufacturer', 'trash bag manufacturer', 'bin liner manufacturer', 'plastic bag factory'],
                ratingPrompt: `
Task Context: We SELL PE raw materials. Target: Garbage bag/plastic bag MANUFACTURERS.

### Tier A (Must meet ALL):
1. **Manufacturer**: Explicitly states they MANUFACTURE garbage bags or plastic bags
   - Look for: "bag manufacturer", "bag factory", "we produce bags"
2. **Product**: Makes garbage bags, trash bags, bin liners, or plastic bags
3. **Facility Evidence**: 
   - Mentions: blown film lines, bag making machines, production capacity
   - Has: factory photos, production equipment
4. **Scale Indicators**: 
   - Production capacity (tons/year, bags/day)
   - Multiple production lines or facilities
5. **NOT Chinese**: NOT based in China

### Tier B (Must meet ALL):
1. **Related Manufacturing**: Produces plastic packaging, flexible packaging, or plastic films
   - Could use PE raw materials
2. **Has Equipment**: Owns blown film or bag making equipment
3. **Expansion Potential**: Could produce garbage bags
4. **NOT Chinese**: Verified non-Chinese manufacturer
5. **Packaging Experience**: Has plastic film or bag manufacturing background

### Tier C (ANY = Tier C):
1. **Chinese Manufacturer**: Based in China
2. **Distributor/Trader**: Only sells/distributes garbage bags
3. **Retailer**: Only retails bags to consumers
4. **Irrelevant**: Doesn't manufacture bags or packaging
5. **Invalid**: B2B platform or directory

# Decision Logic (REVERSE: We want manufacturers!)
- Based in China → Rating: C
- Only distributes/retails → Rating: C
- ALL Tier A criteria → Rating: A (ideal: foreign garbage bag manufacturer)
- ALL Tier B criteria → Rating: B (potential: packaging manufacturer)
- Otherwise → Rating: C
                `.trim()
            }
        ]
    },
    '机械': {
        apiKey: null,
        subCategories: [
            {
                name: 'EPE/PE泡沫制造及转换商',
                keywords: ['epe foam', 'pe foam', 'polyethylene foam', 'foam converter', 'foam fabricator', 'plastazote', 'evazote', 'ethafoam', 'stratocell'],
                ratingPrompt: `
Task Context: We sell foam compactors/densifiers to EPE/PE foam manufacturers and converters globally. Target: companies that produce or process significant volumes of EPE/PE foam.

### Tier A (Must meet ALL):
1. **Core Business**: Manufactures OR converts/fabricates EPE/PE/polyolefin foam (not just PU or EPS)
   - Material keywords: "EPE foam", "polyethylene foam", "PE foam", "Plastazote", "Evazote", "Ethafoam", "Stratocell"
   - Process keywords: "foam converter", "foam fabrication", "CNC cutting", "die cutting", "custom foam inserts"
2. **Manufacturing Capability**: 
   - Manufacturer: owns extrusion/foaming production lines
   - Converter: operates cutting/shaping/laminating facility
   - NOT a pure trading/distribution company
3. **Target Industries**: Serves packaging, protective inserts, industrial/automotive/aerospace/electronics applications
4. **Scale**: Indicates high volume production or large facility
5. **Origin**: Is NOT a Chinese company

### Tier B (Must meet ALL):
1. **Foam Processing**: Confirmed EPE/PE foam manufacturing or conversion activity
2. **Capability**: Has own production or conversion facility
3. **Applications**: Industrial packaging or protective solutions
4. **Origin**: Is NOT a Chinese company
5. **Signal**: Mentions EPE/PE materials, but limited info on scale

### Tier C (ANY = Tier C):
1. **Chinese Company**: 
   - Address in China mainland
   - Domain: .cn or .com.cn
   - Phone: +86
   - Company name in Chinese characters
2. **Wrong Material**: Only works with PU foam, EPS/XPS - no EPE/PE mentioned
3. **No Manufacturing**: Pure distributor with no manufacturing/converting capability
4. **Consumer Only**: Only consumer products (mattresses, cushions) without B2B industrial packaging
5. **Invalid Source**: B2B platform (Alibaba, Made-in-China), directory site

# Decision Logic
- Chinese company (address/domain/phone) → C
- Only PU/EPS foam, no EPE/PE → C
- No manufacturing/converting facility → C
- If passes above:
  - Large EPE/PE manufacturer/converter, clear packaging/industrial focus → A
  - Medium scale with confirmed EPE/PE activity → B
  - Unclear or limited information → C
`.trim()
            }
        ]
    },
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
                        subCategory: subCategory.name,
                        apiKey: config.apiKey,
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
