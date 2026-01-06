-- Lead Rating System Database Schema

-- 创建公司表
CREATE TABLE IF NOT EXISTS companies (
    id VARCHAR(255) PRIMARY KEY,
    name TEXT NOT NULL,
    domain VARCHAR(255),
    website TEXT,
    industry VARCHAR(100),
    region VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(50),
    employee_count INTEGER,
    estimated_size VARCHAR(20),
    raw_data JSONB,
    source VARCHAR(50) NOT NULL,
    source_url TEXT,
    scraped_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 创建索引
CREATE INDEX IF NOT EXISTS domain_idx ON companies(domain);
CREATE INDEX IF NOT EXISTS source_idx ON companies(source);

-- 创建意向信号表
CREATE TABLE IF NOT EXISTS intent_signals (
    id VARCHAR(255) PRIMARY KEY,
    company_id VARCHAR(255) REFERENCES companies(id) NOT NULL,
    signal_type VARCHAR(50) NOT NULL,
    title TEXT,
    content TEXT,
    metadata JSONB,
    detected_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS company_signals_idx ON intent_signals(company_id);
CREATE INDEX IF NOT EXISTS signal_type_idx ON intent_signals(signal_type);

-- 创建评级结果表
CREATE TABLE IF NOT EXISTS ratings (
    id VARCHAR(255) PRIMARY KEY,
    company_id VARCHAR(255) REFERENCES companies(id) NOT NULL,
    total_score REAL NOT NULL,
    breakdown JSONB NOT NULL,
    confidence REAL NOT NULL,
    reasoning TEXT NOT NULL,
    icebreaker TEXT,
    model VARCHAR(50),
    tokens_used INTEGER,
    rated_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS company_ratings_idx ON ratings(company_id);
CREATE INDEX IF NOT EXISTS score_idx ON ratings(total_score);

-- 创建流转记录表
CREATE TABLE IF NOT EXISTS automation_logs (
    id VARCHAR(255) PRIMARY KEY,
    company_id VARCHAR(255) REFERENCES companies(id) NOT NULL,
    rating_id VARCHAR(255) REFERENCES ratings(id),
    action_type VARCHAR(50) NOT NULL,
    action_data JSONB,
    status VARCHAR(20) NOT NULL,
    error TEXT,
    executed_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS company_automation_idx ON automation_logs(company_id);
CREATE INDEX IF NOT EXISTS automation_status_idx ON automation_logs(status);

-- 创建任务指标表
CREATE TABLE IF NOT EXISTS task_metrics (
    id VARCHAR(255) PRIMARY KEY,
    task_type VARCHAR(50) NOT NULL,
    total_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    date TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS metrics_date_idx ON task_metrics(date);
CREATE INDEX IF NOT EXISTS metrics_type_idx ON task_metrics(task_type);
