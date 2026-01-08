/**
 * 全球城市坐标数据库 - 扩展版
 * 包含200+主要城市的地理坐标和搜索半径
 * 覆盖60+国家和地区
 */

export interface CityData {
    name: string;
    lat: number;
    lng: number;
    radius: number;
}

export const GLOBAL_CITIES: Record<string, CityData[]> = {
    // ========== 亚洲 ==========

    // 中国 (30个主要城市)
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
        { name: '天津', lat: 39.3434, lng: 117.3616, radius: 0.2 },
        { name: '苏州', lat: 31.2989, lng: 120.5853, radius: 0.15 },
        { name: '郑州', lat: 34.7466, lng: 113.6253, radius: 0.2 },
        { name: '长沙', lat: 28.2280, lng: 112.9388, radius: 0.2 },
        { name: '沈阳', lat: 41.8057, lng: 123.4328, radius: 0.2 },
        { name: '青岛', lat: 36.0671, lng: 120.3826, radius: 0.15 },
        { name: '厦门', lat: 24.4798, lng: 118.0894, radius: 0.1 },
        { name: '大连', lat: 38.9140, lng: 121.6147, radius: 0.15 },
        { name: '宁波', lat: 29.8683, lng: 121.5440, radius: 0.15 },
        { name: '济南', lat: 36.6512, lng: 117.1208, radius: 0.15 },
        { name: '哈尔滨', lat: 45.8038, lng: 126.5348, radius: 0.2 },
        { name: '福州', lat: 26.0745, lng: 119.2965, radius: 0.15 },
        { name: '昆明', lat: 25.0406, lng: 102.7123, radius: 0.15 },
        { name: '无锡', lat: 31.4912, lng: 120.3120, radius: 0.1 },
        { name: '石家庄', lat: 38.0428, lng: 114.5149, radius: 0.15 },
        { name: '南昌', lat: 28.6829, lng: 115.8579, radius: 0.15 },
        { name: '合肥', lat: 31.8206, lng: 117.2272, radius: 0.15 },
        { name: '太原', lat: 37.8706, lng: 112.5489, radius: 0.15 },
        { name: '长春', lat: 43.8171, lng: 125.3235, radius: 0.15 },
        { name: '贵阳', lat: 26.6470, lng: 106.6302, radius: 0.15 },
    ],

    // 日本 (10个)
    '日本': [
        { name: '东京', lat: 35.6762, lng: 139.6503, radius: 0.4 },
        { name: '大阪', lat: 34.6937, lng: 135.5023, radius: 0.3 },
        { name: '横滨', lat: 35.4437, lng: 139.6380, radius: 0.2 },
        { name: '名古屋', lat: 35.1815, lng: 136.9066, radius: 0.2 },
        { name: '京都', lat: 35.0116, lng: 135.7681, radius: 0.15 },
        { name: '福冈', lat: 33.5904, lng: 130.4017, radius: 0.15 },
        { name: '札幌', lat: 43.0642, lng: 141.3469, radius: 0.15 },
        { name: '神户', lat: 34.6901, lng: 135.1955, radius: 0.15 },
        { name: '仙台', lat: 38.2682, lng: 140.8694, radius: 0.15 },
        { name: '广岛', lat: 34.3853, lng: 132.4553, radius: 0.15 },
    ],

    // 韩国 (6个)
    '韩国': [
        { name: '首尔', lat: 37.5665, lng: 126.9780, radius: 0.3 },
        { name: '釜山', lat: 35.1796, lng: 129.0756, radius: 0.2 },
        { name: '仁川', lat: 37.4563, lng: 126.7052, radius: 0.2 },
        { name: '大邱', lat: 35.8714, lng: 128.6014, radius: 0.15 },
        { name: '大田', lat: 36.3504, lng: 127.3845, radius: 0.15 },
        { name: '光州', lat: 35.1595, lng: 126.8526, radius: 0.15 },
    ],

    // 印度 (10个)
    '印度': [
        { name: '孟买', lat: 19.0760, lng: 72.8777, radius: 0.3 },
        { name: '德里', lat: 28.7041, lng: 77.1025, radius: 0.3 },
        { name: '班加罗尔', lat: 12.9716, lng: 77.5946, radius: 0.2 },
        { name: '海得拉巴', lat: 17.3850, lng: 78.4867, radius: 0.2 },
        { name: '金奈', lat: 13.0827, lng: 80.2707, radius: 0.2 },
        { name: '加尔各答', lat: 22.5726, lng: 88.3639, radius: 0.2 },
        { name: '浦那', lat: 18.5204, lng: 73.8567, radius: 0.15 },
        { name: '艾哈迈达巴德', lat: 23.0225, lng: 72.5714, radius: 0.15 },
        { name: '斋浦尔', lat: 26.9124, lng: 75.7873, radius: 0.15 },
        { name: '苏拉特', lat: 21.1702, lng: 72.8311, radius: 0.15 },
    ],

    // 新加坡
    '新加坡': [
        { name: '新加坡', lat: 1.3521, lng: 103.8198, radius: 0.15 },
    ],

    // 泰国 (4个)
    '泰国': [
        { name: '曼谷', lat: 13.7563, lng: 100.5018, radius: 0.3 },
        { name: '清迈', lat: 18.7883, lng: 98.9853, radius: 0.15 },
        { name: '普吉', lat: 7.8804, lng: 98.3923, radius: 0.1 },
        { name: '芭提雅', lat: 12.9276, lng: 100.8775, radius: 0.1 },
    ],

    // 马来西亚 (4个)
    '马来西亚': [
        { name: '吉隆坡', lat: 3.1390, lng: 101.6869, radius: 0.2 },
        { name: '槟城', lat: 5.4164, lng: 100.3327, radius: 0.1 },
        { name: '新山', lat: 1.4927, lng: 103.7414, radius: 0.1 },
        { name: '亚庇', lat: 5.9804, lng: 116.0735, radius: 0.1 },
    ],

    // 越南 (4个)
    '越南': [
        { name: '河内', lat: 21.0285, lng: 105.8542, radius: 0.2 },
        { name: '胡志明市', lat: 10.8231, lng: 106.6297, radius: 0.2 },
        { name: '岘港', lat: 16.0544, lng: 108.2022, radius: 0.1 },
        { name: '海防', lat: 20.8449, lng: 106.6881, radius: 0.1 },
    ],

    // 印度尼西亚 (5个)
    '印度尼西亚': [
        { name: '雅加达', lat: -6.2088, lng: 106.8456, radius: 0.3 },
        { name: '泗水', lat: -7.2575, lng: 112.7521, radius: 0.2 },
        { name: '万隆', lat: -6.9175, lng: 107.6191, radius: 0.15 },
        { name: '棉兰', lat: 3.5952, lng: 98.6722, radius: 0.15 },
        { name: '三宝垄', lat: -6.9932, lng: 110.4203, radius: 0.15 },
    ],

    // 菲律宾 (3个)
    '菲律宾': [
        { name: '马尼拉', lat: 14.5995, lng: 120.9842, radius: 0.2 },
        { name: '宿务', lat: 10.3157, lng: 123.8854, radius: 0.1 },
        { name: '达沃', lat: 7.0731, lng: 125.6128, radius: 0.1 },
    ],

    // 阿联酋 (3个)
    '阿联酋': [
        { name: '迪拜', lat: 25.2048, lng: 55.2708, radius: 0.2 },
        { name: '阿布扎比', lat: 24.4539, lng: 54.3773, radius: 0.2 },
        { name: '沙迦', lat: 25.3463, lng: 55.4209, radius: 0.1 },
    ],

    // 以色列 (3个)
    '以色列': [
        { name: '特拉维夫', lat: 32.0853, lng: 34.7818, radius: 0.15 },
        { name: '耶路撒冷', lat: 31.7683, lng: 35.2137, radius: 0.15 },
        { name: '海法', lat: 32.7940, lng: 34.9896, radius: 0.1 },
    ],

    // 土耳其 (4个)
    '土耳其': [
        { name: '伊斯坦布尔', lat: 41.0082, lng: 28.9784, radius: 0.3 },
        { name: '安卡拉', lat: 39.9334, lng: 32.8597, radius: 0.2 },
        { name: '伊兹密尔', lat: 38.4192, lng: 27.1287, radius: 0.15 },
        { name: '布尔萨', lat: 40.1828, lng: 29.0665, radius: 0.15 },
    ],

    // ========== 欧洲 ==========

    // 英国 (10个)
    '英国': [
        { name: '伦敦', lat: 51.5074, lng: -0.1278, radius: 0.3 },
        { name: '曼彻斯特', lat: 53.4808, lng: -2.2426, radius: 0.2 },
        { name: '伯明翰', lat: 52.4862, lng: -1.8904, radius: 0.2 },
        { name: '利兹', lat: 53.8008, lng: -1.5491, radius: 0.15 },
        { name: '格拉斯哥', lat: 55.8642, lng: -4.2518, radius: 0.15 },
        { name: '爱丁堡', lat: 55.9533, lng: -3.1883, radius: 0.15 },
        { name: '利物浦', lat: 53.4084, lng: -2.9916, radius: 0.15 },
        { name: '布里斯托', lat: 51.4545, lng: -2.5879, radius: 0.1 },
        { name: '谢菲尔德', lat: 53.3811, lng: -1.4701, radius: 0.1 },
        { name: '纽卡斯尔', lat: 54.9783, lng: -1.6178, radius: 0.1 },
    ],

    // 法国 (8个)
    '法国': [
        { name: '巴黎', lat: 48.8566, lng: 2.3522, radius: 0.3 },
        { name: '马赛', lat: 43.2965, lng: 5.3698, radius: 0.2 },
        { name: '里昂', lat: 45.7640, lng: 4.8357, radius: 0.2 },
        { name: '图卢兹', lat: 43.6047, lng: 1.4442, radius: 0.15 },
        { name: '尼斯', lat: 43.7102, lng: 7.2620, radius: 0.15 },
        { name: '南特', lat: 47.2184, lng: -1.5536, radius: 0.15 },
        { name: '斯特拉斯堡', lat: 48.5734, lng: 7.7521, radius: 0.1 },
        { name: '波尔多', lat: 44.8378, lng: -0.5792, radius: 0.15 },
    ],

    // 德国 (10个)
    '德国': [
        { name: '柏林', lat: 52.5200, lng: 13.4050, radius: 0.3 },
        { name: '慕尼黑', lat: 48.1351, lng: 11.5820, radius: 0.2 },
        { name: '法兰克福', lat: 50.1109, lng: 8.6821, radius: 0.2 },
        { name: '汉堡', lat: 53.5511, lng: 9.9937, radius: 0.2 },
        { name: '科隆', lat: 50.9375, lng: 6.9603, radius: 0.15 },
        { name: '斯图加特', lat: 48.7758, lng: 9.1829, radius: 0.15 },
        { name: '杜塞尔多夫', lat: 51.2277, lng: 6.7735, radius: 0.15 },
        { name: '多特蒙德', lat: 51.5136, lng: 7.4653, radius: 0.15 },
        { name: '莱比锡', lat: 51.3397, lng: 12.3731, radius: 0.15 },
        { name: '德累斯顿', lat: 51.0504, lng: 13.7373, radius: 0.15 },
    ],

    // 意大利 (8个)
    '意大利': [
        { name: '罗马', lat: 41.9028, lng: 12.4964, radius: 0.25 },
        { name: '米兰', lat: 45.4642, lng: 9.1900, radius: 0.2 },
        { name: '那不勒斯', lat: 40.8518, lng: 14.2681, radius: 0.15 },
        { name: '都灵', lat: 45.0703, lng: 7.6869, radius: 0.15 },
        { name: '佛罗伦萨', lat: 43.7696, lng: 11.2558, radius: 0.1 },
        { name: '威尼斯', lat: 45.4408, lng: 12.3155, radius: 0.1 },
        { name: '博洛尼亚', lat: 44.4949, lng: 11.3426, radius: 0.1 },
        { name: '热那亚', lat: 44.4056, lng: 8.9463, radius: 0.1 },
    ],

    // 西班牙 (6个)
    '西班牙': [
        { name: '马德里', lat: 40.4168, lng: -3.7038, radius: 0.3 },
        { name: '巴塞罗那', lat: 41.3851, lng: 2.1734, radius: 0.2 },
        { name: '瓦伦西亚', lat: 39.4699, lng: -0.3763, radius: 0.15 },
        { name: '塞维利亚', lat: 37.3891, lng: -5.9845, radius: 0.15 },
        { name: '毕尔巴鄂', lat: 43.2630, lng: -2.9350, radius: 0.1 },
        { name: '马拉加', lat: 36.7213, lng: -4.4214, radius: 0.1 },
    ],

    // 荷兰 (4个)
    '荷兰': [
        { name: '阿姆斯特丹', lat: 52.3676, lng: 4.9041, radius: 0.15 },
        { name: '鹿特丹', lat: 51.9244, lng: 4.4777, radius: 0.15 },
        { name: '海牙', lat: 52.0705, lng: 4.3007, radius: 0.1 },
        { name: '乌得勒支', lat: 52.0907, lng: 5.1214, radius: 0.1 },
    ],

    // 瑞士 (4个)
    '瑞士': [
        { name: '苏黎世', lat: 47.3769, lng: 8.5417, radius: 0.1 },
        { name: '日内瓦', lat: 46.2044, lng: 6.1432, radius: 0.1 },
        { name: '巴塞尔', lat: 47.5596, lng: 7.5886, radius: 0.1 },
        { name: '伯尔尼', lat: 46.9481, lng: 7.4474, radius: 0.08 },
    ],

    // 比利时 (3个)
    '比利时': [
        { name: '布鲁塞尔', lat: 50.8503, lng: 4.3517, radius: 0.15 },
        { name: '安特卫普', lat: 51.2194, lng: 4.4025, radius: 0.1 },
        { name: '根特', lat: 51.0543, lng: 3.7174, radius: 0.08 },
    ],

    // 奥地利 (3个)
    '奥地利': [
        { name: '维也纳', lat: 48.2082, lng: 16.3738, radius: 0.2 },
        { name: '萨尔茨堡', lat: 47.8095, lng: 13.0550, radius: 0.1 },
        { name: '格拉茨', lat: 47.0707, lng: 15.4395, radius: 0.1 },
    ],

    // 瑞典 (4个)
    '瑞典': [
        { name: '斯德哥尔摩', lat: 59.3293, lng: 18.0686, radius: 0.2 },
        { name: '哥德堡', lat: 57.7089, lng: 11.9746, radius: 0.15 },
        { name: '马尔默', lat: 55.6050, lng: 13.0038, radius: 0.1 },
        { name: '乌普萨拉', lat: 59.8586, lng: 17.6389, radius: 0.08 },
    ],

    // 挪威 (3个)
    '挪威': [
        { name: '奥斯陆', lat: 59.9139, lng: 10.7522, radius: 0.15 },
        { name: '卑尔根', lat: 60.3913, lng: 5.3221, radius: 0.1 },
        { name: '特隆赫姆', lat: 63.4305, lng: 10.3951, radius: 0.08 },
    ],

    // 丹麦 (2个)
    '丹麦': [
        { name: '哥本哈根', lat: 55.6761, lng: 12.5683, radius: 0.15 },
        { name: '奥胡斯', lat: 56.1629, lng: 10.2039, radius: 0.1 },
    ],

    // 芬兰 (3个)
    '芬兰': [
        { name: '赫尔辛基', lat: 60.1699, lng: 24.9384, radius: 0.15 },
        { name: '埃斯波', lat: 60.2055, lng: 24.6559, radius: 0.1 },
        { name: '坦佩雷', lat: 61.4978, lng: 23.7610, radius: 0.1 },
    ],

    // 波兰 (5个)
    '波兰': [
        { name: '华沙', lat: 52.2297, lng: 21.0122, radius: 0.2 },
        { name: '克拉科夫', lat: 50.0647, lng: 19.9450, radius: 0.15 },
        { name: '罗兹', lat: 51.7592, lng: 19.4560, radius: 0.1 },
        { name: '弗罗茨瓦夫', lat: 51.1079, lng: 17.0385, radius: 0.1 },
        { name: '波兹南', lat: 52.4064, lng: 16.9252, radius: 0.1 },
    ],

    // 捷克 (2个)
    '捷克': [
        { name: '布拉格', lat: 50.0755, lng: 14.4378, radius: 0.15 },
        { name: '布尔诺', lat: 49.1951, lng: 16.6068, radius: 0.1 },
    ],

    // 匈牙利 (2个)
    '匈牙利': [
        { name: '布达佩斯', lat: 47.4979, lng: 19.0402, radius: 0.2 },
        { name: '德布勒森', lat: 47.5316, lng: 21.6274, radius: 0.1 },
    ],

    // 罗马尼亚 (2个)
    '罗马尼亚': [
        { name: '布加勒斯特', lat: 44.4268, lng: 26.1025, radius: 0.2 },
        { name: '克卢日-纳波卡', lat: 46.7712, lng: 23.6236, radius: 0.1 },
    ],

    // 葡萄牙 (3个)
    '葡萄牙': [
        { name: '里斯本', lat: 38.7223, lng: -9.1393, radius: 0.2 },
        { name: '波尔图', lat: 41.1579, lng: -8.6291, radius: 0.15 },
        { name: '科英布拉', lat: 40.2033, lng: -8.4103, radius: 0.08 },
    ],

    // 希腊 (3个)
    '希腊': [
        { name: '雅典', lat: 37.9838, lng: 23.7275, radius: 0.2 },
        { name: '塞萨洛尼基', lat: 40.6401, lng: 22.9444, radius: 0.15 },
        { name: '帕特雷', lat: 38.2466, lng: 21.7346, radius: 0.08 },
    ],

    // 俄罗斯 (8个)
    '俄罗斯': [
        { name: '莫斯科', lat: 55.7558, lng: 37.6173, radius: 0.4 },
        { name: '圣彼得堡', lat: 59.9311, lng: 30.3609, radius: 0.3 },
        { name: '新西伯利亚', lat: 55.0084, lng: 82.9357, radius: 0.2 },
        { name: '叶卡捷琳堡', lat: 56.8389, lng: 60.6057, radius: 0.15 },
        { name: '喀山', lat: 55.8304, lng: 49.0661, radius: 0.15 },
        { name: '下诺夫哥罗德', lat: 56.2965, lng: 43.9361, radius: 0.15 },
        { name: '索契', lat: 43.6028, lng: 39.7342, radius: 0.1 },
        { name: '海参崴', lat: 43.1198, lng: 131.8869, radius: 0.1 },
    ],

    //  ========== 北美洲 ==========

    // 美国 (25个主要城市)
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
        { name: '亚特兰大', lat: 33.7490, lng: -84.3880, radius: 0.2 },
        { name: '丹佛', lat: 39.7392, lng: -104.9903, radius: 0.2 },
        { name: '波特兰', lat: 45.5152, lng: -122.6784, radius: 0.15 },
        { name: '奥斯汀', lat: 30.2672, lng: -97.7431, radius: 0.15 },
        { name: '夏洛特', lat: 35.2271, lng: -80.8431, radius: 0.15 },
        { name: '明尼阿波利斯', lat: 44.9778, lng: -93.2650, radius: 0.15 },
        { name: '底特律', lat: 42.3314, lng: -83.0458, radius: 0.15 },
        { name: '坦帕', lat: 27.9506, lng: -82.4572, radius: 0.15 },
        { name: '盐湖城', lat: 40.7608, lng: -111.8910, radius: 0.15 },
        { name: '新奥尔良', lat: 29.9511, lng: -90.0715, radius: 0.15 },
        // 加州城市
        { name: '奥克兰', lat: 37.8044, lng: -122.2712, radius: 0.15 },
        { name: '萨克拉门托', lat: 38.5816, lng: -121.4944, radius: 0.15 },
        { name: '弗雷斯诺', lat: 36.7378, lng: -119.7871, radius: 0.15 },
        { name: '长滩', lat: 33.7701, lng: -118.1937, radius: 0.1 },
        { name: '阿纳海姆', lat: 33.8366, lng: -117.9143, radius: 0.1 },
        { name: '贝克斯菲尔德', lat: 35.3733, lng: -119.0187, radius: 0.1 },
        { name: '河滨', lat: 33.9533, lng: -117.3962, radius: 0.1 },
        { name: '圣伯纳迪诺', lat: 34.1083, lng: -117.2898, radius: 0.1 },
    ],

    // 加拿大 (8个)
    '加拿大': [
        { name: '多伦多', lat: 43.6532, lng: -79.3832, radius: 0.3 },
        { name: '温哥华', lat: 49.2827, lng: -123.1207, radius: 0.2 },
        { name: '蒙特利尔', lat: 45.5017, lng: -73.5673, radius: 0.2 },
        { name: '卡尔加里', lat: 51.0447, lng: -114.0719, radius: 0.2 },
        { name: '渥太华', lat: 45.4215, lng: -75.6972, radius: 0.15 },
        { name: '埃德蒙顿', lat: 53.5461, lng: -113.4938, radius: 0.15 },
        { name: '魁北克城', lat: 46.8139, lng: -71.2080, radius: 0.1 },
        { name: '温尼伯', lat: 49.8951, lng: -97.1384, radius: 0.1 },
    ],

    // 墨西哥 (6个)
    '墨西哥': [
        { name: '墨西哥城', lat: 19.4326, lng: -99.1332, radius: 0.4 },
        { name: '瓜达拉哈拉', lat: 20.6597, lng: -103.3496, radius: 0.2 },
        { name: '蒙特雷', lat: 25.6866, lng: -100.3161, radius: 0.2 },
        { name: '普埃布拉', lat: 19.0414, lng: -98.2063, radius: 0.15 },
        { name: '坎昆', lat: 21.1619, lng: -86.8515, radius: 0.1 },
        { name: '蒂华纳', lat: 32.5149, lng: -117.0382, radius: 0.1 },
    ],

    // ========== 南美洲 ==========

    // 巴西 (8个)
    '巴西': [
        { name: '圣保罗', lat: -23.5505, lng: -46.6333, radius: 0.4 },
        { name: '里约热内卢', lat: -22.9068, lng: -43.1729, radius: 0.3 },
        { name: '巴西利亚', lat: -15.8267, lng: -47.9218, radius: 0.2 },
        { name: '萨尔瓦多', lat: -12.9714, lng: -38.5014, radius: 0.15 },
        { name: '福塔雷萨', lat: -3.7327, lng: -38.5267, radius: 0.15 },
        { name: '贝洛奥里藏特', lat: -19.9167, lng: -43.9345, radius: 0.15 },
        { name: '马瑙斯', lat: -3.1190, lng: -60.0217, radius: 0.15 },
        { name: '库里蒂巴', lat: -25.4284, lng: -49.2733, radius: 0.15 },
    ],

    // 阿根廷 (5个)
    '阿根廷': [
        { name: '布宜诺斯艾利斯', lat: -34.6037, lng: -58.3816, radius: 0.3 },
        { name: '科尔多瓦', lat: -31.4201, lng: -64.1888, radius: 0.15 },
        { name: '罗萨里奥', lat: -32.9442, lng: -60.6505, radius: 0.15 },
        { name: '门多萨', lat: -32.8895, lng: -68.8458, radius: 0.1 },
        { name: '马德普拉塔', lat: -38.0055, lng: -57.5426, radius: 0.1 },
    ],

    // 智利 (4个)
    '智利': [
        { name: '圣地亚哥', lat: -33.4489, lng: -70.6693, radius: 0.3 },
        { name: '瓦尔帕莱索', lat: -33.0472, lng: -71.6127, radius: 0.1 },
        { name: '康塞普西翁', lat: -36.8270, lng: -73.0497, radius: 0.1 },
        { name: '拉塞雷纳', lat: -29.9027, lng: -71.2519, radius: 0.08 },
    ],

    // 哥伦比亚 (4个)
    '哥伦比亚': [
        { name: '波哥大', lat: 4.7110, lng: -74.0721, radius: 0.3 },
        { name: '麦德林', lat: 6.2442, lng: -75.5812, radius: 0.15 },
        { name: '卡利', lat: 3.4516, lng: -76.5320, radius: 0.15 },
        { name: '卡塔赫纳', lat: 10.3910, lng: -75.4794, radius: 0.1 },
    ],

    // 秘鲁 (3个)
    '秘鲁': [
        { name: '利马', lat: -12.0464, lng: -77.0428, radius: 0.3 },
        { name: '阿雷基帕', lat: -16.4090, lng: -71.5375, radius: 0.1 },
        { name: '库斯科', lat: -13.5319, lng: -71.9675, radius: 0.08 },
    ],

    // 委内瑞拉 (2个)
    '委内瑞拉': [
        { name: '加拉加斯', lat: 10.4806, lng: -66.9036, radius: 0.2 },
        { name: '马拉开波', lat: 10.6666, lng: -71.6122, radius: 0.15 },
    ],

    // ========== 大洋洲 ==========

    // 澳大利亚 (8个)
    '澳大利亚': [
        { name: '悉尼', lat: -33.8688, lng: 151.2093, radius: 0.3 },
        { name: '墨尔本', lat: -37.8136, lng: 144.9631, radius: 0.3 },
        { name: '布里斯班', lat: -27.4698, lng: 153.0251, radius: 0.2 },
        { name: '珀斯', lat: -31.9505, lng: 115.8605, radius: 0.2 },
        { name: '阿德莱德', lat: -34.9285, lng: 138.6007, radius: 0.15 },
        { name: '黄金海岸', lat: -28.0167, lng: 153.4000, radius: 0.1 },
        { name: '堪培拉', lat: -35.2809, lng: 149.1300, radius: 0.1 },
        { name: '霍巴特', lat: -42.8821, lng: 147.3272, radius: 0.08 },
    ],

    // 新西兰 (4个)
    '新西兰': [
        { name: '奥克兰', lat: -36.8485, lng: 174.7633, radius: 0.15 },
        { name: '惠灵顿', lat: -41.2865, lng: 174.7762, radius: 0.1 },
        { name: '基督城', lat: -43.5321, lng: 172.6362, radius: 0.1 },
        { name: '汉密尔顿', lat: -37.7870, lng: 175.2793, radius: 0.08 },
    ],

    // ========== 非洲 ==========

    // 南非 (4个)
    '南非': [
        { name: '约翰内斯堡', lat: -26.2041, lng: 28.0473, radius: 0.2 },
        { name: '开普敦', lat: -33.9249, lng: 18.4241, radius: 0.2 },
        { name: '德班', lat: -29.8587, lng: 31.0218, radius: 0.15 },
        { name: '比勒陀利亚', lat: -25.7479, lng: 28.2293, radius: 0.15 },
    ],

    // 埃及 (3个)
    '埃及': [
        { name: '开罗', lat: 30.0444, lng: 31.2357, radius: 0.3 },
        { name: '亚历山大', lat: 31.2001, lng: 29.9187, radius: 0.15 },
        { name: '吉萨', lat: 30.0131, lng: 31.2089, radius: 0.1 },
    ],

    // 尼日利亚 (3个)
    '尼日利亚': [
        { name: '拉各斯', lat: 6.5244, lng: 3.3792, radius: 0.3 },
        { name: '阿布贾', lat: 9.0765, lng: 7.3986, radius: 0.2 },
        { name: '伊巴丹', lat: 7.3776, lng: 3.9470, radius: 0.15 },
    ],

    // 肯尼亚 (2个)
    '肯尼亚': [
        { name: '内罗毕', lat: -1.2921, lng: 36.8219, radius: 0.15 },
        { name: '蒙巴萨', lat: -4.0435, lng: 39.6682, radius: 0.1 },
    ],

    // 摩洛哥 (3个)
    '摩洛哥': [
        { name: '卡萨布兰卡', lat: 33.5731, lng: -7.5898, radius: 0.2 },
        { name: '拉巴特', lat: 34.0209, lng: -6.8416, radius: 0.15 },
        { name: '马拉喀什', lat: 31.6295, lng: -7.9811, radius: 0.1 },
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
