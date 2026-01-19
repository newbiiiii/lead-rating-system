/**
 * 客户画像管理 API 路由
 * 提供业务线和客户画像的 CRUD 接口
 */

import { Router, Request, Response } from 'express';
import { logger } from '../../utils/logger';
import {
    // 业务线
    getAllBusinessLines,
    getBusinessLineById,
    createBusinessLine,
    updateBusinessLine,
    deleteBusinessLine,
    // 客户画像
    getCustomerProfiles,
    getCustomerProfileById,
    createCustomerProfile,
    updateCustomerProfile,
    deleteCustomerProfile,
    // 迁移
    migrateFromHardcodedConfig,
    // 类型
    CreateBusinessLineDto,
    CreateCustomerProfileDto,
} from '../../services/business.service';

const router = Router();

// ============================================================
// 业务线管理
// ============================================================

/**
 * 获取所有业务线
 * GET /api/profiles/business-lines
 */
router.get('/business-lines', async (req: Request, res: Response) => {
    try {
        const includeInactive = req.query.includeInactive === 'true';
        const businessLines = await getAllBusinessLines(includeInactive);

        res.json({
            success: true,
            data: businessLines,
            total: businessLines.length,
        });
    } catch (error) {
        logger.error('[ProfileRoutes] 获取业务线列表失败', error);
        res.status(500).json({
            success: false,
            error: '获取业务线列表失败',
        });
    }
});

/**
 * 获取业务线详情
 * GET /api/profiles/business-lines/:id
 */
router.get('/business-lines/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const businessLine = await getBusinessLineById(id);

        if (!businessLine) {
            return res.status(404).json({
                success: false,
                error: '业务线不存在',
            });
        }

        res.json({
            success: true,
            data: businessLine,
        });
    } catch (error) {
        logger.error('[ProfileRoutes] 获取业务线详情失败', error);
        res.status(500).json({
            success: false,
            error: '获取业务线详情失败',
        });
    }
});

/**
 * 创建业务线
 * POST /api/profiles/business-lines
 */
router.post('/business-lines', async (req: Request, res: Response) => {
    try {
        const dto: CreateBusinessLineDto = req.body;

        // 验证必填字段
        if (!dto.name || !dto.displayName) {
            return res.status(400).json({
                success: false,
                error: '业务线名称和显示名称为必填项',
            });
        }

        const businessLine = await createBusinessLine(dto);

        logger.info(`[ProfileRoutes] 创建业务线: ${businessLine.displayName}`);

        res.status(201).json({
            success: true,
            data: businessLine,
        });
    } catch (error: any) {
        logger.error('[ProfileRoutes] 创建业务线失败', error);

        // 处理唯一约束冲突
        if (error.code === '23505') {
            return res.status(400).json({
                success: false,
                error: '业务线名称已存在',
            });
        }

        res.status(500).json({
            success: false,
            error: '创建业务线失败',
        });
    }
});

/**
 * 更新业务线
 * PUT /api/profiles/business-lines/:id
 */
router.put('/business-lines/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const dto: Partial<CreateBusinessLineDto> = req.body;

        const businessLine = await updateBusinessLine(id, dto);

        if (!businessLine) {
            return res.status(404).json({
                success: false,
                error: '业务线不存在',
            });
        }

        logger.info(`[ProfileRoutes] 更新业务线: ${businessLine.displayName}`);

        res.json({
            success: true,
            data: businessLine,
        });
    } catch (error: any) {
        logger.error('[ProfileRoutes] 更新业务线失败', error);

        if (error.code === '23505') {
            return res.status(400).json({
                success: false,
                error: '业务线名称已存在',
            });
        }

        res.status(500).json({
            success: false,
            error: '更新业务线失败',
        });
    }
});

/**
 * 删除业务线（软删除）
 * DELETE /api/profiles/business-lines/:id
 */
router.delete('/business-lines/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        await deleteBusinessLine(id);

        logger.info(`[ProfileRoutes] 删除业务线: ${id}`);

        res.json({
            success: true,
            message: '业务线已删除',
        });
    } catch (error) {
        logger.error('[ProfileRoutes] 删除业务线失败', error);
        res.status(500).json({
            success: false,
            error: '删除业务线失败',
        });
    }
});

// ============================================================
// 客户画像管理
// ============================================================

/**
 * 获取客户画像列表
 * GET /api/profiles
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const {
            businessLineId,
            includeInactive,
            search,
            page = '1',
            pageSize = '50',
        } = req.query;

        const result = await getCustomerProfiles({
            businessLineId: businessLineId as string,
            includeInactive: includeInactive === 'true',
            search: search as string,
            page: parseInt(page as string, 10),
            pageSize: parseInt(pageSize as string, 10),
        });

        res.json({
            success: true,
            data: result.profiles,
            total: result.total,
            page: parseInt(page as string, 10),
            pageSize: parseInt(pageSize as string, 10),
        });
    } catch (error) {
        logger.error('[ProfileRoutes] 获取客户画像列表失败', error);
        res.status(500).json({
            success: false,
            error: '获取客户画像列表失败',
        });
    }
});

/**
 * 获取客户画像详情
 * GET /api/profiles/:id
 */
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // 排除特殊路径
        if (id === 'business-lines' || id === 'migrate') {
            return res.status(404).json({
                success: false,
                error: '无效的请求路径',
            });
        }

        const profile = await getCustomerProfileById(id);

        if (!profile) {
            return res.status(404).json({
                success: false,
                error: '客户画像不存在',
            });
        }

        res.json({
            success: true,
            data: profile,
        });
    } catch (error) {
        logger.error('[ProfileRoutes] 获取客户画像详情失败', error);
        res.status(500).json({
            success: false,
            error: '获取客户画像详情失败',
        });
    }
});

/**
 * 创建客户画像
 * POST /api/profiles
 */
router.post('/', async (req: Request, res: Response) => {
    try {
        const dto: CreateCustomerProfileDto = req.body;

        // 验证必填字段
        if (!dto.businessLineId || !dto.name || !dto.keywords || !dto.ratingPrompt) {
            return res.status(400).json({
                success: false,
                error: '业务线ID、画像名称、关键词和评级提示词为必填项',
            });
        }

        // 验证关键词格式
        if (!Array.isArray(dto.keywords) || dto.keywords.length === 0) {
            return res.status(400).json({
                success: false,
                error: '关键词必须是非空数组',
            });
        }

        const profile = await createCustomerProfile(dto);

        logger.info(`[ProfileRoutes] 创建客户画像: ${profile.name}`);

        res.status(201).json({
            success: true,
            data: profile,
        });
    } catch (error: any) {
        logger.error('[ProfileRoutes] 创建客户画像失败', error);

        // 处理外键约束错误
        if (error.code === '23503') {
            return res.status(400).json({
                success: false,
                error: '指定的业务线不存在',
            });
        }

        res.status(500).json({
            success: false,
            error: '创建客户画像失败',
        });
    }
});

/**
 * 更新客户画像
 * PUT /api/profiles/:id
 */
router.put('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const dto: Partial<CreateCustomerProfileDto> = req.body;

        // 验证关键词格式（如果提供）
        if (dto.keywords !== undefined && (!Array.isArray(dto.keywords) || dto.keywords.length === 0)) {
            return res.status(400).json({
                success: false,
                error: '关键词必须是非空数组',
            });
        }

        const profile = await updateCustomerProfile(id, dto);

        if (!profile) {
            return res.status(404).json({
                success: false,
                error: '客户画像不存在',
            });
        }

        logger.info(`[ProfileRoutes] 更新客户画像: ${profile.name}`);

        res.json({
            success: true,
            data: profile,
        });
    } catch (error: any) {
        logger.error('[ProfileRoutes] 更新客户画像失败', error);

        if (error.code === '23503') {
            return res.status(400).json({
                success: false,
                error: '指定的业务线不存在',
            });
        }

        res.status(500).json({
            success: false,
            error: '更新客户画像失败',
        });
    }
});

/**
 * 删除客户画像（软删除）
 * DELETE /api/profiles/:id
 */
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        await deleteCustomerProfile(id);

        logger.info(`[ProfileRoutes] 删除客户画像: ${id}`);

        res.json({
            success: true,
            message: '客户画像已删除',
        });
    } catch (error) {
        logger.error('[ProfileRoutes] 删除客户画像失败', error);
        res.status(500).json({
            success: false,
            error: '删除客户画像失败',
        });
    }
});

// ============================================================
// 数据迁移
// ============================================================

/**
 * 从硬编码配置迁移数据
 * POST /api/profiles/migrate
 */
router.post('/migrate', async (req: Request, res: Response) => {
    try {
        logger.info('[ProfileRoutes] 开始从硬编码配置迁移数据...');

        const result = await migrateFromHardcodedConfig();

        logger.info(`[ProfileRoutes] 迁移完成: ${result.businessLines} 个业务线, ${result.profiles} 个客户画像`);

        res.json({
            success: true,
            message: '数据迁移完成',
            data: {
                businessLinesCreated: result.businessLines,
                profilesCreated: result.profiles,
            },
        });
    } catch (error) {
        logger.error('[ProfileRoutes] 数据迁移失败', error);
        res.status(500).json({
            success: false,
            error: '数据迁移失败',
        });
    }
});

export default router;
