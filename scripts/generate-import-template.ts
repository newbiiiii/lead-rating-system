/**
 * 生成导入模板文件
 * 使用方法: npx tsx scripts/generate-import-template.ts
 */

import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';

// 模板数据 - 包含示例行
const templateData = [
    {
        '公司名称': '示例公司A（必填）',
        '域名': 'example-a.com（必填，或填网站）',
        '网站': 'https://www.example-a.com',
        '行业': '制造业',
        '地区': '美国',
        '地址': '123 Main St, New York',
        '联系人': 'John Doe',
        '职位': 'Sales Manager',
        '邮箱': 'john@example-a.com（邮箱/电话至少一个）',
        '电话': '+1-123-456-7890'
    },
    {
        '公司名称': '示例公司B',
        '域名': '',  // 会从网站自动提取
        '网站': 'https://www.example-b.com',
        '行业': '批发',
        '地区': '加拿大',
        '地址': '',
        '联系人': '',
        '职位': '',
        '邮箱': 'info@example-b.com',
        '电话': ''
    }
];

// 创建工作簿
const workbook = XLSX.utils.book_new();
const worksheet = XLSX.utils.json_to_sheet(templateData);

// 设置列宽
worksheet['!cols'] = [
    { wch: 25 },  // 公司名称
    { wch: 30 },  // 域名
    { wch: 30 },  // 网站
    { wch: 15 },  // 行业
    { wch: 10 },  // 地区
    { wch: 30 },  // 地址
    { wch: 15 },  // 联系人
    { wch: 15 },  // 职位
    { wch: 35 },  // 邮箱
    { wch: 18 },  // 电话
];

XLSX.utils.book_append_sheet(workbook, worksheet, '导入模板');

// 保存文件
const outputPath = path.join(__dirname, '../public/assets/templates/import_template.xlsx');
XLSX.writeFile(workbook, outputPath);

console.log(`✅ 模板已生成: ${outputPath}`);
console.log('\n必填字段说明:');
console.log('  1. 公司名称 - 必填');
console.log('  2. 域名 - 必填（如果为空但有网站，会自动从网站提取）');
console.log('  3. 邮箱或电话 - 至少填写一个');
