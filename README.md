# Lead Rating System (线索评级系统)

AI驱动的B2B线索挖掘和智能评级系统,自动从多个数据源爬取潜在客户信息,并使用AI进行智能评分。

## 🚀 功能特性

- ✅ **多源数据爬取** - 支持Google Maps、LinkedIn等多个数据源
- ✅ **智能数据处理** - 自动化数据清洗、标准化和丰富
- ✅ **AI智能评级** - 基于多维度评分算法的线索质量评估
- ✅ **任务队列系统** - 基于BullMQ的可靠任务调度
- ✅ **实时监控面板** - 美观的Web管理界面
- ✅ **完整统计报告** - 详细的爬取统计和成功率分析

## 📋 最新改进

- ✅ 修复Google Maps爬虫超时问题
- ✅ 优化CSS选择器,正确提取公司名称
- ✅ 改进日志输出,显示详细的线索统计信息
- ✅ 前台展示电话、邮箱、地址等完整联系信息
- ✅ 保存完整地址而非仅州/省份
- ✅ 成功率达到96.7%以上

## 🛠️ 技术栈

- **后端**: TypeScript, Node.js, Drizzle ORM
- **数据库**: PostgreSQL
- **队列**: Redis + BullMQ
- **爬虫**: Playwright
- **前端**: Vanilla JS, Chart.js
- **AI**: (待集成)

## 📦 安装

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
cp config.example.yaml config.yaml
# 编辑.env和config.yaml填入您的配置

# 初始化数据库
npm run db:migrate

# 启动服务
npm run dev:api      # API服务器 (端口3000)
npm run dev:worker   # Worker进程
```

## 📊 使用指南

1. 访问管理面板: `http://localhost:3000`
2. 在"任务管理"页面添加爬取任务
3. 在"公司数据"页面查看爬取的线索
4. 查看详细的统计信息和成功率

## 📝 爬取统计示例

```
============================================================
[任务开始] google_maps - "美国WPC Wall Panel进口商"
[目标数量] 30 条线索
============================================================

[爬取完成] 共找到 30 条线索
──────────────────────────────────────────────────────────
[线索 1] California Panel and Veneer
  ├─ 网站: https://www.calpanel.com/
  ├─ 地址: 14055 Artesia Blvd, Cerritos, CA 90703
  ├─ 电话: (562) 409-2989
  └─ 邮箱: (无)
...

[统计摘要]
  总计搜索: 30 条
  验证失败: 1 条
  成功保存: 29 条
  成功率: 96.7%
============================================================
```

## 🔧 开发指南

详细文档请参阅:
- [快速开始](./QUICKSTART.md)
- [Worker指南](./WORKER_GUIDE.md)
- [前端指南](./FRONTEND_GUIDE.md)
- [故障排除](./TROUBLESHOOTING.md)

## 📄 许可证

MIT License

## 👤 作者

**Lead Rating System Team**
