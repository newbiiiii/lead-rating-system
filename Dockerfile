# ========================
# Stage 1: Builder
# ========================
FROM node:18-alpine AS builder

WORKDIR /app

# 安装构建依赖
# 复制 package*.json
COPY package*.json ./

# 安装所有依赖（包括 devDependencies）以便构建
RUN npm ci

# 复制源代码
COPY . .

# 构建 TypeScript 代码
RUN npm run build

# 构建 CSS (Tailwind)
# 确保在 build 后执行，因为 dist 目录已经存在，或者直接输出到 public
RUN npm run css:build

# ========================
# Stage 2: Runner
# ========================
FROM node:18-alpine AS runner

WORKDIR /app

# 安装系统依赖 (Playwright 需要)
# 切换到阿里云镜像源以解决网络问题
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# 设置 Playwright 环境变量
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# 安装 PM2
RUN npm install pm2 -g

# 仅复制生产环境依赖定义
COPY package*.json ./

# 安装生产环境依赖
RUN npm ci --only=production

# 从 builder 阶段复制构建产物
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/ecosystem.config.js ./

# 暴露端口
EXPOSE 3000

# 使用 PM2 启动
CMD ["npm", "run", "start:prod"]
