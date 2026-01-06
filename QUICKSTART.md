# 🚀 快速启动指南

## ✅ 问题已解决！

数据库表已成功创建。现在系统可以正常运行了。

## 📋 启动步骤（完整版）

### 1. 启动数据库服务（已完成）

```bash
docker-compose up -d postgres redis
```

### 2. 初始化数据库（已完成）

```bash
Get-Content schema.sql | docker exec -i lead-rating-postgres psql -U postgres -d lead_rating
```

已创建的表：
- ✅ `companies` - 公司数据表
- ✅ `intent_signals` - 意向信号表
- ✅ `ratings` - 评级结果表
- ✅ `automation_logs` - 流转记录表
- ✅ `task_metrics` - 任务指标表

### 3. 启动 API 服务

```bash
npx tsx src/api/server.ts
```

### 4. 打开管理后台

在浏览器访问：**http://localhost:3000**

## 🎯 现在可以做什么？

### 在浏览器中：

1. **查看仪表盘** - 实时统计和图表
2. **添加爬取任务** - 点击"任务管理"标签
3. **查看数据** - 公司数据和评级结果

### 添加第一个任务示例：

在"任务管理"页面：
- 数据源：Google Maps
- 搜索关键词：`上海 电商公司`
- 数量限制：30
- 优先级：中
- 点击"添加任务"

## 📊 验证系统运行

### 检查数据库表

```bash
docker exec lead-rating-postgres psql -U postgres -d lead_rating -c "\dt"
```

### 检查队列状态

访问：http://localhost:3000/api/queues/stats

### 健康检查

访问：http://localhost:3000/health

## ⚙️ 配置 API Keys（重要！）

在开始使用前，请编辑 `.env` 文件并填写必需的 API Keys：

```bash
# 必填
OPENAI_API_KEY=sk-your-actual-openai-key

# 可选（用于 CRM 集成和通知）
HUBSPOT_API_KEY=your-hubspot-key
WECHAT_WEBHOOK_URL=your-wechat-webhook
DINGTALK_WEBHOOK_URL=your-dingtalk-webhook
```

## 🔄 常用命令

```bash
# 查看 Docker 容器状态
docker-compose ps

# 查看 API 日志
# (在运行 npx tsx src/api/server.ts 的终端窗口)

# 停止所有服务
docker-compose down

# 重启数据库
docker-compose restart postgres redis

# 查看数据库日志
docker logs lead-rating-postgres

# 进入 PostgreSQL 控制台
docker exec -it lead-rating-postgres psql -U postgres -d lead_rating
```

## 📝 下一步

1. ✅ 数据库已初始化
2. ✅ API 服务已运行
3. ✅ 前端界面已可访问
4. ⚠️ 配置 OpenAI API Key（如需使用 AI 评级）
5. ⚠️ 配置 CRM 和通知 Webhooks（可选）

## 🎉 开始使用

打开浏览器访问：
```
http://localhost:3000
```

享受您的 AI 驱动的潜客评级系统！
