-- Enrich Pipeline 数据库迁移
-- 执行此脚本以添加 Enrich 相关字段

-- 1. 添加 enrich 相关字段到 leads 表
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS enrich_status VARCHAR(20) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS enrich_error TEXT;

-- 2. 创建 enrich_status 索引
CREATE INDEX IF NOT EXISTS leads_enrich_status_idx ON leads(enrich_status);

-- 3. 对于已经同步到 CRM 的线索，将其 enrich_status 设置为 'enriched'
-- （历史数据兼容：假设之前同步的都是已增强的）
UPDATE leads 
SET enrich_status = 'enriched', enriched_at = crm_synced_at 
WHERE crm_sync_status = 'synced' AND enrich_status = 'pending';

-- 4. 验证迁移结果
SELECT 
    enrich_status,
    COUNT(*) as count
FROM leads
GROUP BY enrich_status;
