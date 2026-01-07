/**
 * 全球城市坐标数据库
 * 包含100+主要城市的地理坐标和搜索半径
 */

export interface CityData {
    name: string;
    lat: number;
    lng: number;
    radius: number;
}

export const GLOBAL_CITIES: Record<string, CityData[]> = {
    // ========== 中国 (10个) ==========
    '中国': [
        { name: '北京', lat: 39.9042, lng: 116.4074, radius: 0.3 },
        { name: '上海', lat: 31.2304, lng: 121.4737, radius: 0.3 },
        { name: '广州', lat: 23.1291, lng: 113.2644, radius: 0.25 },
        { name: '深圳', lat: 22.5431, lng: 114.0579, radius: 0.2 },
        { name: '杭州', lat: 30.2741, lng: 120.1551, radius: 0.2 },
        { name: '成都', lat: 30.5728, lng: 104.0668, radius: 0.25 },
        { name: '重庆', lat: 29.5630, lng: 106.5516, radius: 0.25 },
        { name: '武汉', lat: 30.5928, lng: 114.3055, radius: 0.25 },
        { name: '西安', lat: 34.3416, lng: 108.9398, radius: 0.2 },
        { name: '南京', lat: 32.0603, lng: 118.7969, radius: 0.2 },
    ],

    // ========== 美国 (15个) ==========
    '美国': [
        { name: '纽约', lat: 40.7128, lng: -74.0060, radius: 0.3 },
        { name: '洛杉矶', lat: 34.0522, lng: -118.2437, radius: 0.4 },
        { name: '芝加哥', lat: 41.8781, lng: -87.6298, radius: 0.3 },
        { name: '休斯顿', lat: 29.7604, lng: -95.3698, radius: 0.3 },
        { name: '凤凰城', lat: 33.4484, lng: -112.0740, radius: 0.3 },
        { name: '费城', lat: 39.9526, lng: -75.1652, radius: 0.25 },
        { name: '圣安东尼奥', lat: 29.4241, lng: -98.4936, radius: 0.25 },
        { name: '圣地亚哥', lat: 32.7157, lng: -117.1611, radius: 0.25 },
        { name: '达拉斯', lat: 32.7767, lng: -96.7970, radius: 0.3 },
        { name: '圣何塞', lat: 37.3382, lng: -121.8863, radius: 0.2 },
        { name: '旧金山', lat: 37.7749, lng: -122.4194, radius: 0.2 },
        { name: '西雅图', lat: 47.6062, lng: -122.3321, radius: 0.2 },
        { name: '波士顿', lat: 42.3601, lng: -71.0589, radius: 0.2 },
        { name: '迈阿密', lat: 25.7617, lng: -80.1918, radius: 0.2 },
        { name: '拉斯维加斯', lat: 36.1699, lng: -115.1398, radius: 0.2 },
    ],

    // ========== 英国 (6个) ==========
    '英国': [
        { name: '伦敦', lat: 51.5074, lng: -0.1278, radius: 0.3 },
        { name: '曼彻斯特', lat: 53.4808, lng: -2.2426, radius: 0.2 },
        { name: '伯明翰', lat: 52.4862, lng: -1.8904, radius: 0.2 },
        { name: '利兹', lat: 53.8008, lng: -1.5491, radius: 0.15 },
        { name: '格拉斯哥', lat: 55.8642, lng: -4.2518, radius: 0.15 },
        { name: '爱丁堡', lat: 55.9533, lng: -3.1883, radius: 0.15 },
    ],

    // ========== 法国 (5个) ==========
    '法国': [
        { name: '巴黎', lat: 48.8566, lng: 2.3522, radius: 0.3 },
        { name: '马赛', lat: 43.2965, lng: 5.3698, radius: 0.2 },
        { name: '里昂', lat: 45.7640, lng: 4.8357, radius: 0.2 },
        { name: '图卢兹', lat: 43.6047, lng: 1.4442, radius: 0.15 },
        { name: '尼斯', lat: 43.7102, lng: 7.2620, radius: 0.15 },
    ],

    // ========== 德国 (6个) ==========
    '德国': [
        { name: '柏林', lat: 52.5200, lng: 13.4050, radius: 0.3 },
        { name: '慕尼黑', lat: 48.1351, lng: 11.5820, radius: 0.2 },
        { name: '法兰克福', lat: 50.1109, lng: 8.6821, radius: 0.2 },
        { name: '汉堡', lat: 53.5511, lng: 9.9937, radius: 0.2 },
        { name: '科隆', lat: 50.9375, lng: 6.9603, radius: 0.15 },
        { name: '斯图加特', lat: 48.7758, lng: 9.1829, radius: 0.15 },
    ],

    // ========== 日本 (6个) ==========
    '日本': [
        { name: '东京', lat: 35.6762, lng: 139.6503, radius: 0.4 },
        { name: '大阪', lat: 34.6937, lng: 135.5023, radius: 0.3 },
        { name: '横滨', lat: 35.4437, lng: 139.6380, radius: 0.2 },
        { name: '名古屋', lat: 35.1815, lng: 136.9066, radius: 0.2 },
        { name: '京都', lat: 35.0116, lng: 135.7681, radius: 0.15 },
        { name: '福冈', lat: 33.5904, lng: 130.4017, radius: 0.15 },
    ],

    // ========== 韩国 (4个) ==========
    '韩国': [
        { name: '首尔', lat: 37.5665, lng: 126.9780, radius: 0.3 },
        { name: '釜山', lat: 35.1796, lng: 129.0756, radius: 0.2 },
        { name: '仁川', lat: 37.4563, lng: 126.7052, radius: 0.2 },
        { name: '大邱', lat: 35.8714, lng: 128.6014, radius: 0.15 },
    ],

    // ========== 新加坡 (1个) ==========
    '新加坡': [
        { name: '新加坡', lat: 1.3521, lng: 103.8198, radius: 0.15 },
    ],

    // ========== 澳大利亚 (5个) ==========
    '澳大利亚': [
        { name: '悉尼', lat: -33.8688, lng: 151.2093, radius: 0.3 },
        { name: '墨尔本', lat: -37.8136, lng: 144.9631, radius: 0.3 },
        { name: '布里斯班', lat: -27.4698, lng: 153.0251, radius: 0.2 },
        { name: '珀斯', lat: -31.9505, lng: 115.8605, radius: 0.2 },
        { name: '阿德莱德', lat: -34.9285, lng: 138.6007, radius: 0.15 },
    ],

    // ========== 加拿大 (5个) ==========
    '加拿大': [
        { name: '多伦多', lat: 43.6532, lng: -79.3832, radius: 0.3 },
        { name: '温哥华', lat: 49.2827, lng: -123.1207, radius: 0.2 },
        { name: '蒙特利尔', lat: 45.5017, lng: -73.5673, radius: 0.2 },
        { name: '卡尔加里', lat: 51.0447, lng: -114.0719, radius: 0.2 },
        { name: '渥太华', lat: 45.4215, lng: -75.6972, radius: 0.15 },
    ],

    // ========== 意大利 (5个) ==========
    '意大利': [
        { name: '罗马', lat: 41.9028, lng: 12.4964, radius: 0.25 },
        { name: '米兰', lat: 45.4642, lng: 9.1900, radius: 0.2 },
        { name: '那不勒斯', lat: 40.8518, lng: 14.2681, radius: 0.15 },
        { name: '都灵', lat: 45.0703, lng: 7.6869, radius: 0.15 },
        { name: '佛罗伦萨', lat: 43.7696, lng: 11.2558, radius: 0.1 },
    ],

    // ========== 西班牙 (4个) ==========
    '西班牙': [
        { name: '马德里', lat: 40.4168, lng: -3.7038, radius: 0.3 },
        { name: '巴塞罗那', lat: 41.3851, lng: 2.1734, radius: 0.2 },
        { name: '瓦伦西亚', lat: 39.4699, lng: -0.3763, radius: 0.15 },
        { name: '塞维利亚', lat: 37.3891, lng: -5.9845, radius: 0.15 },
    ],

    // ========== 荷兰 (3个) ==========
    '荷兰': [
        { name: '阿姆斯特丹', lat: 52.3676, lng: 4.9041, radius: 0.15 },
        { name: '鹿特丹', lat: 51.9244, lng: 4.4777, radius: 0.15 },
        { name: '海牙', lat: 52.0705, lng: 4.3007, radius: 0.1 },
    ],

    // ========== 瑞士 (3个) ==========
    '瑞士': [
        { name: '苏黎世', lat: 47.3769, lng: 8.5417, radius: 0.1 },
        { name: '日内瓦', lat: 46.2044, lng: 6.1432, radius: 0.1 },
        { name: '巴塞尔', lat: 47.5596, lng: 7.5886, radius: 0.1 },
    ],

    // ========== 阿联酋 (2个) ==========
    '阿联酋': [
        { name: '迪拜', lat: 25.2048, lng: 55.2708, radius: 0.2 },
        { name: '阿布扎比', lat: 24.4539, lng: 54.3773, radius: 0.2 },
    ],

    // ========== 印度 (6个) ==========
    '印度': [
        { name: '孟买', lat: 19.0760, lng: 72.8777, radius: 0.3 },
        { name: '德里', lat: 28.7041, lng: 77.1025, radius: 0.3 },
        { name: '班加罗尔', lat: 12.9716, lng: 77.5946, radius: 0.2 },
        { name: '海得拉巴', lat: 17.3850, lng: 78.4867, radius: 0.2 },
        { name: '金奈', lat: 13.0827, lng: 80.2707, radius: 0.2 },
        { name: '加尔各答', lat: 22.5726, lng: 88.3639, radius: 0.2 },
    ],

    // ========== 泰国 (2个) ==========
    '泰国': [
        { name: '曼谷', lat: 13.7563, lng: 100.5018, radius: 0.3 },
        { name: '清迈', lat: 18.7883, lng: 98.9853, radius: 0.15 },
    ],

    // ========== 马来西亚 (2个) ==========
    '马来西亚': [
        { name: '吉隆坡', lat: 3.1390, lng: 101.6869, radius: 0.2 },
        { name: '槟城', lat: 5.4164, lng: 100.3327, radius: 0.1 },
    ],

    // ========== 越南 (2个) ==========
    '越南': [
        { name: '河内', lat: 21.0285, lng: 105.8542, radius: 0.2 },
        { name: '胡志明市', lat: 10.8231, lng: 106.6297, radius: 0.2 },
    ],

    // ========== 巴西 (3个) ==========
    '巴西': [
        { name: '圣保罗', lat: -23.5505, lng: -46.6333, radius: 0.4 },
        { name: '里约热内卢', lat: -22.9068, lng: -43.1729, radius: 0.3 },
        { name: '巴西利亚', lat: -15.8267, lng: -47.9218, radius: 0.2 },
    ],

    // ========== 墨西哥 (2个) ==========
    '墨西哥': [
        { name: '墨西哥城', lat: 19.4326, lng: -99.1332, radius: 0.4 },
        { name: '瓜达拉哈拉', lat: 20.6597, lng: -103.3496, radius: 0.2 },
    ],
};

/**
 * 获取所有国家列表
 */
export function getCountries(): string[] {
    return Object.keys(GLOBAL_CITIES).sort();
}

/**
 * 获取指定国家的城市列表
 */
export function getCitiesByCountry(country: string): CityData[] {
    return GLOBAL_CITIES[country] || [];
}

/**
 * 获取指定城市的坐标信息
 */
export function getCityData(country: string, cityName: string): CityData | null {
    const cities = getCitiesByCountry(country);
    return cities.find(c => c.name === cityName) || null;
}

/**
 * 统计信息
 */
export function getStats() {
    const countries = getCountries();
    const totalCities = countries.reduce((sum, country) => {
        return sum + GLOBAL_CITIES[country].length;
    }, 0);

    return {
        totalCountries: countries.length,
        totalCities,
        countries: countries.map(country => ({
            name: country,
            cityCount: GLOBAL_CITIES[country].length
        }))
    };
}
