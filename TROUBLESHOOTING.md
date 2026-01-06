# 🐛 问题诊断：任务创建成功但看不到数据

## 问题原因

您的任务已成功添加到队列，但是：

❌ **没有 Worker 在运行来处理这些任务**

任务流程：
```
添加任务 → Redis 队列 → [Worker 处理] ← 这里缺失！ → 保存到数据库 → 前端显示
```

## ✅ 解决方案

### 方法 1：启动测试 Worker（推荐，最简单）

打开**新的终端窗口**，运行：

```bash
cd e:\antig\huoke\lead-rating-system
npx tsx src/workers/test-worker.ts
```

**结果：**
- ✅ Worker 会立即处理队列中的任务
- ✅ 您会看到任务处理日志
- ✅ 数据会保存到数据库（模拟数据）

### 方法 2：启动完整的爬虫 Worker

```bash
cd e:\antig\huoke\lead-rating-system
npx tsx src/workers/scraper.worker.ts
```

**注意：** 这个需要解决一些 TypeScript 编译错误。

## 📊 验证任务状态

### 查看队列中的任务

```bash
# 打开 http://localhost:3000 管理后台
# 点击"任务管理" → 查看队列状态
```

或使用 Redis 命令：

```bash
docker exec lead-rating-redis redis-cli LLEN bull:scrape:wait
```

### 查看已处理的任务

```bash
docker exec lead-rating-redis redis-cli LLEN bull:scrape:completed
```

## 🎯 完整的启动清单

需要同时运行以下服务：

### 1️⃣ 数据库（已运行 ✅）
```bash
docker-compose up -d postgres redis
```

### 2️⃣ API 服务（已运行 ✅）
```bash
# 终端 1
npx tsx src/api/server.ts
```

### 3️⃣ Worker 服务（需要启动 ❌）
```bash
# 终端 2 - 新开一个终端窗口
npx tsx src/workers/test-worker.ts
```

### 4️⃣ 前端界面（已可访问 ✅）
```
http://localhost:3000
```

## 📝 快速测试流程

1. **启动 Worker**（新终端窗口）：
   ```bash
   npx tsx src/workers/test-worker.ts
   ```

2. **在浏览器中添加任务**：
   - 访问 http://localhost:3000
   - 点击"任务管理"
   - 填写表单并提交

3. **查看 Worker 终端**：
   - 应该会看到任务处理日志
   - 显示"爬取完成"

4. **查看数据**：
   - 点击"公司数据"
   - 应该能看到新添加的数据

## 🔍 当前队列状态

您的 Redis 队列中已有以下任务：
- `bull:scrape:google_maps-1767668012256`
- `bull:scrape:google_maps-1767667298254`
- `bull:scrape:google_maps-1767667459963`
- `bull:scrape:google_maps-1767668015685`

启动 Worker 后，这些任务会被自动处理。

## 💡 下次使用提醒

记得同时运行：
1. ✅ API 服务（数据接口）
2. ✅ Worker 服务（任务处理）
3. ✅ 数据库服务（Docker）

**简化命令（可选）：**
您可以创建一个启动脚本同时运行所有服务。
