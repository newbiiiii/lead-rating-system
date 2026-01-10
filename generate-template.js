// 生成 Excel 导入模板
const XLSX = require('xlsx');
const path = require('path');

// 创建模板数据
const templateData = [
    {
        '公司名称': '示例公司A（必填）',
        '网站': 'https://example-a.com',
        '域名': 'example-a.com',
        '行业': '制造业',
        '国家': '美国',
        '地址': '123 Main Street, New York',
        '联系人': '张三',
        '职位': '采购经理',
        '邮箱': 'zhangsan@example-a.com',
        '电话': '+1-123-456-7890'
    },
    {
        '公司名称': '示例公司B',
        '网站': 'https://example-b.co.uk',
        '域名': 'example-b.co.uk',
        '行业': '贸易',
        '国家': '英国',
        '地址': '45 Commerce Road, London',
        '联系人': '李四',
        '职位': '进口总监',
        '邮箱': 'lisi@example-b.co.uk',
        '电话': '+44-20-7123-4567'
    }
];

// 创建工作簿
const workbook = XLSX.utils.book_new();
const worksheet = XLSX.utils.json_to_sheet(templateData);

// 设置列宽
worksheet['!cols'] = [
    { wch: 25 }, // 公司名称
    { wch: 30 }, // 网站
    { wch: 20 }, // 域名
    { wch: 12 }, // 行业
    { wch: 10 }, // 国家
    { wch: 35 }, // 地址
    { wch: 12 }, // 联系人
    { wch: 15 }, // 职位
    { wch: 30 }, // 邮箱
    { wch: 20 }  // 电话
];

// 添加工作表
XLSX.utils.book_append_sheet(workbook, worksheet, '导入模板');

// 写入文件
const outputPath = path.join(__dirname, 'public', 'assets', 'templates', 'import_template.xlsx');
XLSX.writeFile(workbook, outputPath);

console.log('模板已生成:', outputPath);
