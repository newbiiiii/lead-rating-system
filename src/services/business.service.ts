/**
 * 业务线服务 - 客户画像管理
 * 
 * 支持从数据库读取配置，同时保留硬编码配置作为回退
 * 
 * 结构说明：
 * - BusinessLine (业务线): 建材 / 成品 / 原料 / 机械
 * - CustomerProfile (客户画像): 每个业务线下有多种客户画像，各有不同的评级标准
 * 
 * 业务线特点：
 * - 建材、成品：目标客户为非制造商（经销商、批发商、零售商）
 * - 原料：目标客户为制造商
 */

import { db } from '../db';
import { businessLines, customerProfiles } from '../db/schema';
import { eq, and, like, sql } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

// ============================================================
// 类型定义
// ============================================================

// 业务线类型（保持兼容）
export type BusinessType = '建材' | '成品' | '原料' | '机械' | string;

// 业务上下文返回结构（保持兼容）
export interface BusinessContext {
   ratingPrompt: string;
   business: BusinessType;
   subCategory: string;  // 具体的材质/子类名称
   apiKey: number | null;
}

// 业务线实体
export interface BusinessLineEntity {
   id: string;
   name: string;
   displayName: string;
   description: string | null;
   apiKey: number | null;
   sortOrder: number;
   isActive: boolean;
   createdAt: Date;
   updatedAt: Date;
}

// 客户画像实体
export interface CustomerProfileEntity {
   id: string;
   businessLineId: string;
   name: string;
   displayName: string | null;
   description: string | null;
   keywords: string[];
   ratingPrompt: string;
   isActive: boolean;
   sortOrder: number;
   createdAt: Date;
   updatedAt: Date;
   // 关联数据
   businessLine?: BusinessLineEntity;
}

// 创建/更新业务线DTO
export interface CreateBusinessLineDto {
   name: string;
   displayName: string;
   description?: string;
   apiKey?: number | null;
   sortOrder?: number;
   isActive?: boolean;
}

// 创建/更新客户画像DTO
export interface CreateCustomerProfileDto {
   businessLineId: string;
   name: string;
   displayName?: string;
   description?: string;
   keywords: string[];
   ratingPrompt: string;
   isActive?: boolean;
   sortOrder?: number;
}

// 缓存配置
interface CacheEntry {
   data: CustomerProfileEntity[];
   timestamp: number;
}

// ============================================================
// 缓存机制
// ============================================================

let profilesCache: CacheEntry | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

function isCacheValid(): boolean {
   if (!profilesCache) return false;
   return Date.now() - profilesCache.timestamp < CACHE_TTL;
}

function clearCache(): void {
   profilesCache = null;
   logger.debug('[BusinessService] 缓存已清除');
}

async function getCachedProfiles(): Promise<CustomerProfileEntity[]> {
   if (isCacheValid() && profilesCache) {
      return profilesCache.data;
   }

   try {
      const profiles = await db.query.customerProfiles.findMany({
         where: eq(customerProfiles.isActive, true),
         with: {
            businessLine: true,
         },
         orderBy: (profile, { asc }) => [asc(profile.sortOrder)],
      });

      const mappedProfiles: CustomerProfileEntity[] = profiles.map(p => ({
         id: p.id,
         businessLineId: p.businessLineId,
         name: p.name,
         displayName: p.displayName,
         description: p.description,
         keywords: p.keywords as string[],
         ratingPrompt: p.ratingPrompt,
         isActive: p.isActive ?? true,
         sortOrder: p.sortOrder ?? 0,
         createdAt: p.createdAt,
         updatedAt: p.updatedAt,
         businessLine: p.businessLine ? {
            id: p.businessLine.id,
            name: p.businessLine.name,
            displayName: p.businessLine.displayName,
            description: p.businessLine.description,
            apiKey: p.businessLine.apiKey,
            sortOrder: p.businessLine.sortOrder ?? 0,
            isActive: p.businessLine.isActive ?? true,
            createdAt: p.businessLine.createdAt,
            updatedAt: p.businessLine.updatedAt,
         } : undefined,
      }));

      profilesCache = {
         data: mappedProfiles,
         timestamp: Date.now(),
      };

      logger.debug(`[BusinessService] 从数据库加载了 ${mappedProfiles.length} 个客户画像配置`);
      return mappedProfiles;
   } catch (error) {
      logger.warn('[BusinessService] 从数据库加载配置失败，将使用硬编码配置', error);
      return [];
   }
}

// ============================================================
// 核心业务方法（保持兼容）
// ============================================================

/**
 * 根据任务名称获取业务上下文
 * 优先从数据库读取，失败时回退到硬编码配置
 * @param taskName 任务名称
 * @returns 业务上下文，包含评级标准、业务线和材质；如果没有匹配返回 null
 */
export async function getBusinessContext(taskName: string): Promise<BusinessContext | null> {
   const name = taskName.toLowerCase();

   // 尝试从数据库获取
   const profiles = await getCachedProfiles();

   if (profiles.length > 0) {
      for (const profile of profiles) {
         for (const keyword of profile.keywords) {
            if (name.includes(keyword.toLowerCase())) {
               logger.debug(`[BusinessService] 任务 "${taskName}" 匹配画像: ${profile.businessLine?.displayName} - ${profile.name}`);
               return {
                  ratingPrompt: profile.ratingPrompt,
                  business: (profile.businessLine?.name || '') as BusinessType,
                  subCategory: profile.name,
                  apiKey: profile.businessLine?.apiKey || null,
               };
            }
         }
      }
   }

   // 回退到硬编码配置
   return getBusinessContextFromHardcoded(taskName);
}

/**
 * 同步版本的 getBusinessContext（保持向后兼容）
 * 如果缓存有效则使用缓存，否则使用硬编码配置
 */
export function getBusinessContextSync(taskName: string): BusinessContext | null {
   const name = taskName.toLowerCase();

   // 如果缓存有效，使用缓存
   if (isCacheValid() && profilesCache) {
      for (const profile of profilesCache.data) {
         for (const keyword of profile.keywords) {
            if (name.includes(keyword.toLowerCase())) {
               return {
                  ratingPrompt: profile.ratingPrompt,
                  business: (profile.businessLine?.name || '') as BusinessType,
                  subCategory: profile.name,
                  apiKey: profile.businessLine?.apiKey || null,
               };
            }
         }
      }
   }

   // 回退到硬编码配置
   return getBusinessContextFromHardcoded(taskName);
}

// ============================================================
// 业务线 CRUD
// ============================================================

/**
 * 获取所有业务线
 */
export async function getAllBusinessLines(includeInactive = false): Promise<BusinessLineEntity[]> {
   const conditions = includeInactive ? undefined : eq(businessLines.isActive, true);

   const lines = await db.query.businessLines.findMany({
      where: conditions,
      orderBy: (line, { asc }) => [asc(line.sortOrder)],
   });

   return lines.map(l => ({
      id: l.id,
      name: l.name,
      displayName: l.displayName,
      description: l.description,
      apiKey: l.apiKey,
      sortOrder: l.sortOrder ?? 0,
      isActive: l.isActive ?? true,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
   }));
}

/**
 * 获取业务线详情
 */
export async function getBusinessLineById(id: string): Promise<BusinessLineEntity | null> {
   const line = await db.query.businessLines.findFirst({
      where: eq(businessLines.id, id),
   });

   if (!line) return null;

   return {
      id: line.id,
      name: line.name,
      displayName: line.displayName,
      description: line.description,
      apiKey: line.apiKey,
      sortOrder: line.sortOrder ?? 0,
      isActive: line.isActive ?? true,
      createdAt: line.createdAt,
      updatedAt: line.updatedAt,
   };
}

/**
 * 创建业务线
 */
export async function createBusinessLine(dto: CreateBusinessLineDto): Promise<BusinessLineEntity> {
   const id = uuidv4();
   const now = new Date();

   await db.insert(businessLines).values({
      id,
      name: dto.name,
      displayName: dto.displayName,
      description: dto.description || null,
      apiKey: dto.apiKey ?? null,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
      createdAt: now,
      updatedAt: now,
   });

   clearCache();

   return {
      id,
      name: dto.name,
      displayName: dto.displayName,
      description: dto.description || null,
      apiKey: dto.apiKey ?? null,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
      createdAt: now,
      updatedAt: now,
   };
}

/**
 * 更新业务线
 */
export async function updateBusinessLine(id: string, dto: Partial<CreateBusinessLineDto>): Promise<BusinessLineEntity | null> {
   const existing = await getBusinessLineById(id);
   if (!existing) return null;

   const now = new Date();

   await db.update(businessLines)
      .set({
         ...(dto.name !== undefined && { name: dto.name }),
         ...(dto.displayName !== undefined && { displayName: dto.displayName }),
         ...(dto.description !== undefined && { description: dto.description }),
         ...(dto.apiKey !== undefined && { apiKey: dto.apiKey }),
         ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
         ...(dto.isActive !== undefined && { isActive: dto.isActive }),
         updatedAt: now,
      })
      .where(eq(businessLines.id, id));

   clearCache();

   return getBusinessLineById(id);
}

/**
 * 删除业务线（软删除）
 */
export async function deleteBusinessLine(id: string): Promise<boolean> {
   const result = await db.update(businessLines)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(businessLines.id, id));

   clearCache();
   return true;
}

// ============================================================
// 客户画像 CRUD
// ============================================================

/**
 * 获取客户画像列表
 */
export async function getCustomerProfiles(options: {
   businessLineId?: string;
   includeInactive?: boolean;
   search?: string;
   page?: number;
   pageSize?: number;
} = {}): Promise<{ profiles: CustomerProfileEntity[]; total: number }> {
   const { businessLineId, includeInactive = false, search, page = 1, pageSize = 50 } = options;

   // 构建条件
   const conditions: any[] = [];
   if (!includeInactive) {
      conditions.push(eq(customerProfiles.isActive, true));
   }
   if (businessLineId) {
      conditions.push(eq(customerProfiles.businessLineId, businessLineId));
   }

   // 获取总数
   const countResult = await db.select({ count: sql<number>`count(*)` })
      .from(customerProfiles)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
   const total = Number(countResult[0]?.count || 0);

   // 获取列表
   const profiles = await db.query.customerProfiles.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      with: {
         businessLine: true,
      },
      orderBy: (profile, { asc }) => [asc(profile.sortOrder)],
      limit: pageSize,
      offset: (page - 1) * pageSize,
   });

   const mappedProfiles: CustomerProfileEntity[] = profiles.map(p => ({
      id: p.id,
      businessLineId: p.businessLineId,
      name: p.name,
      displayName: p.displayName,
      description: p.description,
      keywords: p.keywords as string[],
      ratingPrompt: p.ratingPrompt,
      isActive: p.isActive ?? true,
      sortOrder: p.sortOrder ?? 0,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      businessLine: p.businessLine ? {
         id: p.businessLine.id,
         name: p.businessLine.name,
         displayName: p.businessLine.displayName,
         description: p.businessLine.description,
         apiKey: p.businessLine.apiKey,
         sortOrder: p.businessLine.sortOrder ?? 0,
         isActive: p.businessLine.isActive ?? true,
         createdAt: p.businessLine.createdAt,
         updatedAt: p.businessLine.updatedAt,
      } : undefined,
   }));

   return { profiles: mappedProfiles, total };
}

/**
 * 获取客户画像详情
 */
export async function getCustomerProfileById(id: string): Promise<CustomerProfileEntity | null> {
   const profile = await db.query.customerProfiles.findFirst({
      where: eq(customerProfiles.id, id),
      with: {
         businessLine: true,
      },
   });

   if (!profile) return null;

   return {
      id: profile.id,
      businessLineId: profile.businessLineId,
      name: profile.name,
      displayName: profile.displayName,
      description: profile.description,
      keywords: profile.keywords as string[],
      ratingPrompt: profile.ratingPrompt,
      isActive: profile.isActive ?? true,
      sortOrder: profile.sortOrder ?? 0,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      businessLine: profile.businessLine ? {
         id: profile.businessLine.id,
         name: profile.businessLine.name,
         displayName: profile.businessLine.displayName,
         description: profile.businessLine.description,
         apiKey: profile.businessLine.apiKey,
         sortOrder: profile.businessLine.sortOrder ?? 0,
         isActive: profile.businessLine.isActive ?? true,
         createdAt: profile.businessLine.createdAt,
         updatedAt: profile.businessLine.updatedAt,
      } : undefined,
   };
}

/**
 * 创建客户画像
 */
export async function createCustomerProfile(dto: CreateCustomerProfileDto): Promise<CustomerProfileEntity> {
   const id = uuidv4();
   const now = new Date();

   await db.insert(customerProfiles).values({
      id,
      businessLineId: dto.businessLineId,
      name: dto.name,
      displayName: dto.displayName || null,
      description: dto.description || null,
      keywords: dto.keywords,
      ratingPrompt: dto.ratingPrompt,
      isActive: dto.isActive ?? true,
      sortOrder: dto.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
   });

   clearCache();

   const created = await getCustomerProfileById(id);
   return created!;
}

/**
 * 更新客户画像
 */
export async function updateCustomerProfile(id: string, dto: Partial<CreateCustomerProfileDto>): Promise<CustomerProfileEntity | null> {
   const existing = await getCustomerProfileById(id);
   if (!existing) return null;

   const now = new Date();

   await db.update(customerProfiles)
      .set({
         ...(dto.businessLineId !== undefined && { businessLineId: dto.businessLineId }),
         ...(dto.name !== undefined && { name: dto.name }),
         ...(dto.displayName !== undefined && { displayName: dto.displayName }),
         ...(dto.description !== undefined && { description: dto.description }),
         ...(dto.keywords !== undefined && { keywords: dto.keywords }),
         ...(dto.ratingPrompt !== undefined && { ratingPrompt: dto.ratingPrompt }),
         ...(dto.isActive !== undefined && { isActive: dto.isActive }),
         ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
         updatedAt: now,
      })
      .where(eq(customerProfiles.id, id));

   clearCache();

   return getCustomerProfileById(id);
}

/**
 * 删除客户画像（软删除）
 */
export async function deleteCustomerProfile(id: string): Promise<boolean> {
   await db.update(customerProfiles)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(customerProfiles.id, id));

   clearCache();
   return true;
}

// ============================================================
// 数据迁移方法
// ============================================================

/**
 * 从硬编码配置迁移数据到数据库
 */
export async function migrateFromHardcodedConfig(): Promise<{ businessLines: number; profiles: number }> {
   let businessLineCount = 0;
   let profileCount = 0;

   for (const [businessName, config] of Object.entries(BUSINESS_CONFIG)) {
      // 检查业务线是否已存在
      const existingLine = await db.query.businessLines.findFirst({
         where: eq(businessLines.name, businessName),
      });

      let businessLineId: string;

      if (existingLine) {
         businessLineId = existingLine.id;
         logger.info(`[Migration] 业务线 "${businessName}" 已存在，跳过创建`);
      } else {
         businessLineId = uuidv4();
         await db.insert(businessLines).values({
            id: businessLineId,
            name: businessName,
            displayName: businessName,
            description: getBusinessDescription(businessName),
            apiKey: config.apiKey,
            sortOrder: getBusinessSortOrder(businessName),
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
         });
         businessLineCount++;
         logger.info(`[Migration] 创建业务线: ${businessName}`);
      }

      // 创建客户画像
      for (const subCategory of config.subCategories) {
         // 检查画像是否已存在
         const existingProfile = await db.query.customerProfiles.findFirst({
            where: and(
               eq(customerProfiles.businessLineId, businessLineId),
               eq(customerProfiles.name, subCategory.name)
            ),
         });

         if (existingProfile) {
            logger.info(`[Migration] 画像 "${subCategory.name}" 已存在，跳过创建`);
            continue;
         }

         await db.insert(customerProfiles).values({
            id: uuidv4(),
            businessLineId,
            name: subCategory.name,
            displayName: `${subCategory.name}客户画像`,
            description: null,
            keywords: subCategory.keywords,
            ratingPrompt: subCategory.ratingPrompt,
            isActive: true,
            sortOrder: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
         });
         profileCount++;
         logger.info(`[Migration] 创建画像: ${businessName} - ${subCategory.name}`);
      }
   }

   clearCache();

   return { businessLines: businessLineCount, profiles: profileCount };
}

function getBusinessDescription(name: string): string {
   const descriptions: Record<string, string> = {
      '建材': '建材业务线，目标客户为建材经销商、批发商、零售商',
      '成品': '成品业务线，目标客户为成品经销商、批发商、零售商',
      '原料': '原料业务线，目标客户为制造商',
      '机械': '机械业务线，目标客户为设备使用企业',
   };
   return descriptions[name] || '';
}

function getBusinessSortOrder(name: string): number {
   const orders: Record<string, number> = {
      '建材': 1,
      '成品': 2,
      '原料': 3,
      '机械': 4,
   };
   return orders[name] || 99;
}

// ============================================================
// 兼容性方法
// ============================================================

/**
 * 获取所有支持的业务线（兼容旧接口）
 */
export function getSupportedBusinessTypes(): BusinessType[] {
   return Object.keys(BUSINESS_CONFIG) as BusinessType[];
}

/**
 * 获取指定业务线下的所有材质/子类（兼容旧接口）
 */
export function getSubCategoriesByBusiness(businessType: BusinessType): string[] {
   const config = BUSINESS_CONFIG[businessType as keyof typeof BUSINESS_CONFIG];
   return config ? config.subCategories.map(sc => sc.name) : [];
}

/**
 * 根据业务线和材质获取评级标准（兼容旧接口）
 */
export function getRatingPromptBySubCategory(businessType: BusinessType, subCategoryName: string): string | null {
   const config = BUSINESS_CONFIG[businessType as keyof typeof BUSINESS_CONFIG];
   if (!config) return null;

   const subCategory = config.subCategories.find(sc => sc.name === subCategoryName);
   return subCategory ? subCategory.ratingPrompt : null;
}

/**
 * 兼容旧接口：仅返回评级标准字符串
 * 优先从数据库缓存读取，回退到硬编码配置
 * @param taskName 任务名称
 */
export function getDynamicRatingContext(taskName: string): string | null {
   // 使用同步版本，它会优先使用缓存，缓存失效时回退到硬编码
   const context = getBusinessContextSync(taskName);
   return context ? context.ratingPrompt : null;
}

/**
 * 从硬编码配置获取业务上下文（内部方法）
 */
function getBusinessContextFromHardcoded(taskName: string): BusinessContext | null {
   const name = taskName.toLowerCase();

   for (const [businessType, config] of Object.entries(BUSINESS_CONFIG)) {
      for (const subCategory of config.subCategories) {
         for (const keyword of subCategory.keywords) {
            if (name.includes(keyword)) {
               logger.debug(`[BusinessService] 任务 "${taskName}" 匹配业务线(硬编码): ${businessType}, 材质: ${subCategory.name}`);
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

// ============================================================
// 硬编码配置（作为回退）
// ============================================================

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

const BUSINESS_CONFIG: Record<string, BusinessConfig> = {
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
         },
         {
            name: '饮料/瓶装水生产商',
            keywords: ['bottling plant', 'beverage bottling', 'bottled water', 'soft drinks', 'juice bottling', 'co-packer', 'contract bottler', 'beverage manufacturing', 'water bottling', 'brewery and canning facility', 'juice processing plant'],
            ratingPrompt: `
Task Context: We sell dewatering and volume reduction equipment for packaged beverage waste (expired/damaged bottles with liquid). Target: bottling plants and co-packers globally that handle significant liquid packaging waste.

### Tier A (Must meet ALL):
1. **Core Business**: Operates bottling/filling plant for beverages
   - Products: bottled water, soft drinks, juice, tea, energy drinks, beer
   - Packaging: PET bottles, aluminum cans, tetra pak
2. **Waste Signal**: Clear indication of liquid packaging waste
   - Keywords: "product destruction", "depackaging", "beverage waste", "line rejects", "returns processing"
   - OR: "dewatering", "liquid separation", "waste reduction", "compactor", "baler"
3. **Scale**: High-volume production
   - "High-speed lines", "multiple production lines", "multi-shift operation"
   - OR: Serves multiple brands (co-packer/contract bottler)
4. **Sustainability Focus** (bonus): Mentions recycling, zero waste, ESG goals
5. **Origin**: Is NOT a Chinese company

### Tier B (Must meet ALL):
1. **Related Operations**: Beverage distribution center OR packaging facility
   - Handles returns, damaged goods, or recalls
   - Keywords: "DC", "warehouse", "returns processing", "liquidation"
2. **Waste Handling**: Some evidence of packaging waste management
3. **Scale**: Medium to large facility
4. **Origin**: Is NOT a Chinese company

### Tier C (ANY = Tier C):
1. **Chinese Company**: Address/domain/phone indicates China-based
2. **No Production**: Only brand marketing, trading, or small retail stores
3. **Wrong Business**: Only supplies empty bottles/packaging materials (unless explicitly handles beverage waste)
4. **No Waste Flow**: No indication of handling damaged/expired/returned beverages
5. **Invalid Source**: B2B platform or directory

# Key Waste Scenarios (High Priority if mentioned):
- "Expired product destruction" / "obsolete beverages"
- "Depackaging" / "liquid-solid separation"
- "Line rejects" / "off-spec product" / "recalls"
- "Wet goods destruction" / "full goods destruction"
- "Certificate of destruction" / "certified destruction"
- "Reduce hauling costs" / "volume reduction"

# Decision Logic
- Chinese company → C
- No bottling/beverage production → C
- Clear bottling plant + waste signals → A
- Distribution/co-packing with some waste handling → B
- Unclear or insufficient info → C
`.trim()
         }
      ]
   },
};
