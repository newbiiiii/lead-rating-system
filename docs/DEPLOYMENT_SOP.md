# Lead Rating System - Docker 部署标准作业程序 (SOP)

本文档详细说明了如何使用 Docker 和 Docker Compose 部署 Lead Rating System。请严格按照以下步骤操作。

## 1. 环境准备

在开始之前，请确保服务器满足以下要求：

*   **操作系统**: Linux (推荐 Ubuntu 20.04/22.04 LTS), macOS, or Windows (WSL2).
*   **硬件**: 建议至少 2 vCPU, 4GB RAM (爬虫浏览器较为耗内存).
*   **软件**:
    *   Docker Engine (20.10.0+)
    *   Docker Compose (v2.0.0+)

### 验证环境
```bash
docker --version
docker compose version
```

---

## 2. 配置阶段

### 2.1 获取代码
如果您尚未获取代码，请克隆仓库：
```bash
git clone <repository_url>
cd lead-rating-system
```

### 2.2 环境变量配置 (.env)
系统运行需要配置环境变量。

1.  复制示例文件：
    ```bash
    cp .env.example .env
    ```

2.  编辑 `.env` 文件：
    ```bash
    vim .env
    ```

3.  **必须修改项**:
    *   `POSTGRES_PASSWORD`: 设置一个复杂的数据库密码 (例如: `X7d9#mK2$vL5`).
    *   `OPENAI_API_KEY`: 填入您的 OpenAI API Key (以 `sk-` 开头).

4.  **可选修改项**:
    *   `HUBSPOT_API_KEY`: 如果需要同步到 HubSpot CRM。
    *   `WECHAT_WEBHOOK_URL` / `DINGTALK_WEBHOOK_URL`: 如果需要消息通知。

### 2.3 应用配置 (config.yaml)
配置爬虫源和系统参数。

1.  复制示例文件：
    ```bash
    cp config.example.yaml config.yaml
    ```

2.  (可选) 编辑 `config.yaml` 以调整搜索代理、关键词等设置。建议初次部署保持默认。

---

## 3. 部署启动

### 3.1 构建镜像
为了确保使用最新代码，建议先构建镜像：

```bash
docker compose build --no-cache
```
*注意：此步骤可能需要几分钟，取决于网络状况。*

### 3.2 启动服务
使用后台模式启动所有服务：

```bash
docker compose up -d
```

### 3.3 检查状态
确保所有容器都处于 `Up` (健康) 状态：

```bash
docker compose ps
```
正常情况下，您应该看到以下容器：
*   `lead-rating-api`
*   `lead-rating-postgres`
*   `lead-rating-redis`
*   `lead-rating-minio`
*   `scraper-worker`
*   `rating-worker`
*   `crm-worker`

---

## 4. 验证部署

### 4.1 访问管理界面
在浏览器中访问：
http://<服务器IP>:3000

如果能看到登录界面或仪表盘，说明各类服务通信正常。

### 4.2 查看日志
如果不确定服务是否正常，可以查看实时日志：

```bash
# 查看所有日志
docker compose logs -f

# 查看特定服务日志 (如 API)
docker compose logs -f api

# 查看爬虫日志
docker compose logs -f scraper-worker
```

---

## 5. 日常运维

### 停止服务
```bash
docker compose down
```

### 更新代码并重新部署
```bash
git pull
docker compose build
docker compose up -d
```

### 数据库备份
```bash
# 备份到当前目录的 backup.sql
docker exec -t lead-rating-postgres pg_dumpall -c -U postgres > backup.sql
```

### 清理未使用的资源
如果磁盘空间不足，可以清理未使用的镜像和缓存：
```bash
docker system prune -a
```

---

## 6. 故障排查

*   **错误: `database system is starting up`**: 数据库首次初始化需要时间，稍微等待一分钟，容器会自动重试连接。
*   **错误: `Browser closed` / `Target closed`**: 通常是因为内存不足导致浏览器崩溃。请检查服务器内存或减少 `docker-compose.yml` 中 `scraper-worker` 的 replicas 数量。
