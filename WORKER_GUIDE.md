# ✅ 测试 Worker 使用说明

## 🎉 成功！数据已保存

您的 test-worker 已成功保存数据到数据库！

**数据库查询结果：**
```
测试公司-美国WPC Wall Panel进口商 | 电商 | 上海 | google_maps
```

## 📋 两种 Worker 对比

### ✅ test-worker（推荐用于开始）

**文件：** `src/workers/test-worker.ts`

**特点：**
- ✅ 快速启动，无需额外依赖
- ✅ 模拟数据，但会真实保存到数据库
- ✅ 用于测试整个系统流程
- ✅ 无需浏览器

**适合场景：**
- 测试系统是否正常工作
- 验证数据库连接
- 测试前端界面显示
- 快速演示

**启动命令：**
```bash
npx tsx src/workers/test-worker.ts
```

### ⚠️ scraper.worker（真实爬虫）

**文件：** `src/workers/scraper.worker.ts`

**特点：**
- 真实爬取 Google Maps 数据
- 需要安装 Playwright 浏览器
- 需要解决一些 TypeScript 编译错误
- 运行较慢（真实网络请求）

**需要的额外步骤：**
```bash
# 1. 安装 Playwright 浏览器
npx playwright install chromium

# 2. 修复 TypeScript 类型错误（较复杂）

# 3. 启动
npx tsx src/workers/scraper.worker.ts
```

## 💡 当前建议

**现阶段建议使用 test-worker：**

1. ✅ **测试系统功能**
   - 添加任务
   - 查看数据
   - 测试界面

2. ✅ **验证数据流**
   - 队列 → Worker → 数据库 → 前端

3. ✅ **快速迭代**
   - 无需等待真实爬取
   - 无需处理反爬虫
   - 无需浏览器依赖

## 🚀 使用流程

### 启动 test-worker

```bash
# 终端 2（新窗口）
cd e:\antig\huoke\lead-rating-system
npx tsx src/workers/test-worker.ts
```

### 在浏览器中操作

1. 访问 http://localhost:3000
2. 点击"任务管理"
3. 填写表单：
   - 数据源：任意选择
   - 搜索关键词：任意输入
   - 数量：30
4. 点击"添加任务"
5. 观察 Worker 终端日志
6. 点击"公司数据"查看结果

### 查看结果

数据会显示在：
- **公司数据**页面：列出所有爬取的公司
- **仪表盘**：统计数据更新
- **数据库**：真实保存

## 🔄 何时使用真实爬虫

当您需要以下功能时，再配置真实爬虫：

- ✅ 真实的 Google Maps 数据
- ✅ 实际的联系方式和地址
- ✅ 准确的行业分类

**配置步骤：**

1. 安装 Playwright
2. 修复类型错误
3. 配置代理（可选，避免被封）
4. 设置限流和延迟

## 📊 当前系统状态

| 组件 | 状态 | 说明 |
|------|------|------|
| 数据库 | ✅ 运行中 | PostgreSQL + Redis |
| API 服务 | ✅ 运行中 | http://localhost:3000 |
| 前端界面 | ✅ 可访问 | 管理后台 |
| test-worker | ✅ 可用 | 模拟数据 + 真实保存 |
| scraper-worker | ⚠️ 需配置 | 需要 Playwright |
| 数据库数据 | ✅ 已有数据 | 1条测试记录 |

## 🎯 下一步

1. **继续使用 test-worker 添加更多测试数据**
   - 查看前端表格显示
   - 测试搜索和筛选
   - 验证数据完整性

2. **配置 AI 评级**（可选）
   - 填写 OPENAI_API_KEY in `.env`
   - 创建 rating-worker
   - 查看评分结果

3. **配置真实爬虫**（可选）
   - 安装 Playwright
   - 调试爬虫逻辑
   - 处理反爬虫

---

**总结：test-worker 已经足够用于测试和演示整个系统！** 🎉
