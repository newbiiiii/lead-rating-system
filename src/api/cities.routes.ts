/**
 * Cities API Routes
 * 提供全球城市数据查询接口
 */

import { Router } from 'express';
import { getCountries, getCitiesByCountry, getCityData, getStats } from '../data/cities';

const router = Router();

/**
 * GET /api/cities/countries
 * 获取所有国家列表
 */
router.get('/countries', (req, res) => {
    try {
        const countries = getCountries();
        res.json({
            success: true,
            countries,
            count: countries.length
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/cities/stats
 * 获取统计信息
 */
router.get('/stats', (req, res) => {
    try {
        const stats = getStats();
        res.json({
            success: true,
            ...stats
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/cities/:country
 * 获取指定国家的城市列表
 */
router.get('/:country', (req, res) => {
    try {
        const { country } = req.params;
        const cities = getCitiesByCountry(decodeURIComponent(country));

        if (cities.length === 0) {
            return res.status(404).json({
                success: false,
                error: `未找到国家 "${country}" 的数据`
            });
        }

        res.json({
            success: true,
            country,
            cities,
            count: cities.length
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/cities/:country/:city
 * 获取指定城市的详细信息
 */
router.get('/:country/:city', (req, res) => {
    try {
        const { country, city } = req.params;
        const cityData = getCityData(
            decodeURIComponent(country),
            decodeURIComponent(city)
        );

        if (!cityData) {
            return res.status(404).json({
                success: false,
                error: `未找到城市 "${country} - ${city}" 的数据`
            });
        }

        res.json({
            success: true,
            country,
            ...cityData
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;
