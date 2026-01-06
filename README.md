# 爬虫 + AI 评级系统 - 完整方案总结

本文档总结了基于 JS/TS 的高扩展性企业线索采集与智能评级系统的完整设计方案。

---

## 📋 交付清单

### 文档
- [x] [implementation_plan.md](file:///C:/Users/R00010119/.gemini/antigravity/brain/c493fa8c-7910-4e7b-b531-8c0032c2cad4/implementation_plan.md) - 完整技术方案（架构设计、技术选型、模块设计）
- [x] [task.md](file:///C:/Users/R00010119/.gemini/antigravity/brain/c493fa8c-7910-4e7b-b531-8c0032c2cad4/task.md) - 任务清单
- [x] 此文档 - 方案总结与使用指南

### 示例代码
- [x] [1-scraper-adapter-base.ts](file:///C:/Users/R00010119/.gemini/antigravity/brain/c493fa8c-7910-4e7b-b531-8c0032c2cad4/examples/1-scraper-adapter-base.ts) - 爬虫适配器基类
- [x] [2-google-maps-adapter.ts](file:///C:/Users/R00010119/.gemini/antigravity/brain/c493fa8c-7910-4e7b-b531-8c0032c2cad4/examples/2-google-maps-adapter.ts) - Google Maps 爬虫实现
- [x] [3-data-processor-pipeline.ts](file:///C:/Users/R00010119/.gemini/antigravity/brain/c493fa8c-7910-4e7b-b531-8c0032c2cad4/examples/3-data-processor-pipeline.ts) - 数据处理管道
- [x] [4-ai-rating-engine.ts](file:///C:/Users/R00010119/.gemini/antigravity/brain/c493fa8c-7910-4e7b-b531-8c0032c2cad4/examples/4-ai-rating-engine.ts) - AI 评级引擎
- [x] [5-task-queue-system.ts](file:///C:/Users/R00010119/.gemini/antigravity/brain/c493fa8c-7910-4e7b-b531-8c0032c2cad4/examples/5-task-queue-system.ts) - BullMQ 任务队列系统
- [x] [6-automation-system.ts](file:///C:/Users/R00010119/.gemini/antigravity/brain/c493fa8c-7910-4e7b-b531-8c0032c2cad4/examples/6-automation-system.ts) - 自动化流转系统

### 配置与部署
- [x] [config.example.yaml](file:///C:/Users/R00010119/.gemini/antigravity/brain/c493fa8c-7910-4e7b-b531-8c0032c2cad4/config.example.yaml) - 系统配置模板
- [x] [package.json](file:///C:/Users/R00010119/.gemini/antigravity/brain/c493fa8c-7910-4e7b-b531-8c0032c2cad4/package.json) - 项目依赖定义
- [x] [docker-compose.yml](file:///C:/Users/R00010119/.gemini/antigravity/brain/c493fa8c-7910-4e7b-b531-8c0032c2cad4/docker-compose.yml) - Docker 部署配置

---

## 🏗️ 系统架构概览

### 核心模块

| 模块 | 职责 | 技术栈 |
|------|------|--------|
| **数据采集层** | 多源爬虫、反爬处理 | Playwright, Axios, Cheerio |
| **数据处理层** | 清洗、去重、格式化 | 责任链模式、Redis、tiktoken |
| **AI 评级层** | 智能评分、Prompt 优化 | OpenAI API, LangChain |
| **自动化流转层** | 规则引擎、CRM 集成、通知 | HubSpot API, 微信/钉钉 |
| **消息队列** | 异步任务调度 | BullMQ, Redis |
| **存储层** | 数据持久化 | PostgreSQL, MinIO |

### 数据流

```
数据源 → 爬虫适配器 → 消息队列 → 数据处理 → AI 评级 → 自动化流转 → CRM/通知
```

---

## 💡 核心特性

### 1. 高扩展性设计

**适配器模式**：每个数据源独立适配器，新增数据源只需实现 `BaseScraperAdapter` 接口

```typescript
// 新增数据源示例
class LinkedInAdapter extends BaseScraperAdapter {
  readonly source = 'linkedin';
  // 实现 scrape、validate、transform 方法
}
```

**责任链模式**：数据处理管道可灵活组合

```typescript
const pipeline = htmlCleaner
  .setNext(textNormalizer)
  .setNext(contactExtractor)
  .setNext(deduplicator);
```

**配置驱动**：所有规则通过 YAML 配置，无需修改代码

### 2. 成本优化

| 策略 | 节省比例 | 实现方式 |
|------|---------|---------|
| 数据压缩 | ~40% | 仅发送核心字段 |
| 批量处理 | ~30% | 单次评估 5 家公司 |
| 规则预筛选 | ~50% | 低分直接过滤，不调用 LLM |
| 模型选择 | ~50% 成本 | 简单场景用 GPT-4o-mini |

**成本估算**（月处理 10,000 家公司）：
- OpenAI API: $125
- 代理池: $500
- 服务器: $100
- 数据库: $80
- **总计: ~$805/月**

### 3. 可靠性保障

- **任务持久化**：BullMQ 自动保存任务状态
- **失败重试**：指数退避算法（3-5 次重试）
- **去重机制**：布隆过滤器 + PostgreSQL 唯一索引
- **限流控制**：Token Bucket 算法防止过载

---

## 🚀 快速开始

### 环境准备

```bash
# 1. 克隆代码（假设您已有项目目录）
cd your-project

# 2. 复制配置文件
cp config.example.yaml config.yaml

# 3. 配置环境变量
cat > .env << EOF
OPENAI_API_KEY=your_openai_key
HUBSPOT_API_KEY=your_hubspot_key
WECHAT_WEBHOOK_URL=your_wechat_webhook
POSTGRES_PASSWORD=postgres123
EOF

# 4. 安装依赖
npm install
```

### 本地开发

```bash
# 启动依赖服务
docker-compose up postgres redis -d

# 运行数据库迁移
npm run db:migrate

# 启动所有 Workers（开发模式）
npm run worker:all

# 或单独启动某个 Worker
npm run worker:scraper
npm run worker:rating
```

### 生产部署

```bash
# 使用 Docker Compose 一键部署
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f rating-worker

# 扩展 Worker 数量
docker-compose up -d --scale scraper-worker=5
```

---

## 📝 配置指南

### 数据源配置

编辑 [config.yaml](file:///C:/Users/R00010119/.gemini/antigravity/brain/c493fa8c-7910-4e7b-b531-8c0032c2cad4/config.example.yaml) 启用/禁用数据源：

```yaml
scraper:
  sources:
    - name: google_maps
      enabled: true
      rate_limit: 100/hour
      
    - name: qichacha
      enabled: true
      config:
        api_key: ${QICHACHA_API_KEY}
```

### 评分规则自定义

修改 `rating.dimensions` 配置：

```yaml
rating:
  dimensions:
    - name: firmographics
      weight: 0.3
      max_score: 3
      rules:
        - condition: industry in ['电商', '物流']
          score: 3
          reason: 属于目标行业
```

### 流转规则配置

定义线索处理动作：

```yaml
automation:
  rules:
    - name: 高优线索（9-10分）
      condition: score >= 9
      actions:
        - type: notify
          channels: [wechat, dingtalk]
        - type: crm_push
          priority: high
```

---

## 🔧 核心代码使用示例

### 调度爬取任务

```typescript
import { TaskScheduler } from './examples/5-task-queue-system';

const scheduler = new TaskScheduler();

// 单个任务
await scheduler.scheduleScrapeTask({
  source: 'google_maps',
  query: '上海 电商公司',
  limit: 30,
  priority: 1
});

// 批量任务
await scheduler.scheduleBatchScrape([
  { source: 'google_maps', query: '北京 SaaS公司', limit: 50 },
  { source: 'qichacha', query: '杭州 物流企业', limit: 100 }
]);

// 定时任务
await scheduler.setupRecurringTasks();
```

### 手动触发评级

```typescript
import { RatingEngine } from './examples/4-ai-rating-engine';

const engine = new RatingEngine(config, process.env.OPENAI_API_KEY!);

// 单条评级
const result = await engine.rate(companyData);
console.log(`评分: ${result.totalScore}, 理由: ${result.reasoning}`);

// 批量评级（节省成本）
const results = await engine.rateBatch([company1, company2, company3]);
```

### 规则引擎使用

```typescript
import { RuleEngine, AutomationService } from './examples/6-automation-system';

const ruleEngine = new RuleEngine();
ruleEngine.loadDefaultRules();

// 添加自定义规则
ruleEngine.addRule({
  name: '融资新闻',
  condition: (lead) => lead.data.fundingInfo?.date > new Date('2024-01-01'),
  actions: [
    { type: 'notify', channels: ['wechat'] },
    { type: 'crm_push', priority: 'high' }
  ]
});

const automation = new AutomationService(ruleEngine, hubspot, notifiers);
await automation.processLead(enrichedLead);
```

---

## 📊 监控与维护

### 队列监控

```typescript
import { QueueMonitor } from './examples/5-task-queue-system';

const monitor = new QueueMonitor('scrape');
const metrics = await monitor.getMetrics(scrapeQueue);

console.log(`等待: ${metrics.waiting}, 处理中: ${metrics.active}`);
```

### 关键指标

| 指标 | 说明 | 目标值 |
|------|------|--------|
| 爬虫成功率 | 成功任务 / 总任务 | > 90% |
| 数据去重率 | 重复数据 / 总数据 | < 20% |
| AI API 成本 | 每天 API 费用 | < $10 |
| 平均处理时间 | 从爬取到评级完成 | < 5 分钟 |

### 日志查看

```bash
# Docker 环境
docker-compose logs -f rating-worker --tail 100

# 本地环境
tail -f logs/app.log
```

---

## 🎯 典型使用场景

### 场景 1: 每日自动采集

```yaml
# config.yaml 中配置定时任务
cron:
  - name: daily_scrape
    schedule: "0 9 * * *"
    task: scrape
    params:
      source: google_maps
      query: 北京 科技公司
      limit: 100
```

### 场景 2: 高优线索立即通知

系统自动：
1. 爬取数据 → 2. AI 评分 → 3. 检测到 9 分以上 → 4. 微信/钉钉通知 → 5. 推送 HubSpot

### 场景 3: 中优线索培育

6-8 分线索自动加入邮件培育序列，6 个月持续跟进。

---

## 🔐 安全与合规

### 数据安全
- ✅ 所有密钥存储在环境变量中
- ✅ 数据库连接使用 SSL
- ✅ 敏感数据加密存储

### 合规建议
- ✅ 仅采集公开信息
- ✅ 遵守 robots.txt
- ✅ 尊重网站 Terms of Service
- ✅ 提供退订机制（邮件营销）

---

## 📈 性能优化建议

### 1. 爬虫优化
- 使用代理池轮换 IP
- 合理设置并发数（建议 5-10）
- 实现增量爬取（仅爬新增数据）

### 2. 评级优化
- 批量处理（5 家公司 / 批次）
- 缓存相似公司评分
- 规则预筛选（过滤低分）

### 3. 数据库优化
- 为常用查询字段建索引
- 定期清理归档数据
- 使用连接池管理

---

## 🛠️ 故障排查

### 常见问题

**Q: 爬虫频繁失败？**
- 检查代理配置是否正确
- 降低并发数和请求频率
- 启用 Stealth 插件

**Q: AI 评分不准确？**
- 优化 Prompt 模板
- 调整评分维度权重
- 收集人工反馈持续改进

**Q: 成本超预算？**
- 启用规则预筛选
- 增加批量处理批次大小
- 使用更便宜的模型（GPT-4o-mini）

---

## 🔄 后续扩展建议

### Phase 1 增强（短期）
- [ ] 增加更多数据源适配器（LinkedIn, Apollo, Crunchbase）
- [ ] A/B 测试 Prompt 模板
- [ ] 实现 Admin 管理界面

### Phase 2 优化（中期）
- [ ] 引入机器学习模型替代部分规则
- [ ] 实现智能重试策略
- [ ] 构建数据质量监控看板

### Phase 3 企业级（长期）
- [ ] 多租户支持
- [ ] 数据源市场（插件商店）
- [ ] 自动化 A/B 测试系统
- [ ] 实时流处理（替代批处理）

---

## 📚 相关资源

### 文档链接
- [完整技术方案](file:///C:/Users/R00010119/.gemini/antigravity/brain/c493fa8c-7910-4e7b-b531-8c0032c2cad4/implementation_plan.md)
- [任务清单](file:///C:/Users/R00010119/.gemini/antigravity/brain/c493fa8c-7910-4e7b-b531-8c0032c2cad4/task.md)

### 示例代码
所有示例代码位于 [examples 目录](file:///C:/Users/R00010119/.gemini/antigravity/brain/c493fa8c-7910-4e7b-b531-8c0032c2cad4/examples/)

### 配置文件
- [系统配置](file:///C:/Users/R00010119/.gemini/antigravity/brain/c493fa8c-7910-4e7b-b531-8c0032c2cad4/config.example.yaml)
- [Docker Compose](file:///C:/Users/R00010119/.gemini/antigravity/brain/c493fa8c-7910-4e7b-b531-8c0032c2cad4/docker-compose.yml)
- [依赖清单](file:///C:/Users/R00010119/.gemini/antigravity/brain/c493fa8c-7910-4e7b-b531-8c0032c2cad4/package.json)

---

## ✨ 总结

本方案提供了一个**完整、可扩展、生产就绪**的爬虫 + AI 评级系统设计，主要优势：

✅ **技术栈统一**：全栈 TypeScript，易于维护  
✅ **扩展性强**：适配器模式 + 配置驱动  
✅ **成本可控**：多层优化，月成本 < $1000  
✅ **可靠性高**：任务持久化 + 失败重试  
✅ **部署简单**：Docker Compose 一键启动  

您可以基于此方案快速启动 MVP，并根据业务需求持续迭代优化。

**接下来建议您：**
1. 根据实际业务场景定制配置文件
2. 选择 2-3 个核心数据源开始试运行
3. 收集真实评分数据优化 Prompt
4. 逐步扩展数据源和自动化规则

如有任何问题，欢迎随时咨询！🚀
