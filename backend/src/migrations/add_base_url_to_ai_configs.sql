-- 添加 base_url 字段到 ai_configs 表
ALTER TABLE ai_configs ADD COLUMN IF NOT EXISTS base_url TEXT;

-- 添加注释
COMMENT ON COLUMN ai_configs.base_url IS '自定义API端点地址（可选）';
