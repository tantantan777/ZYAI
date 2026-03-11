import { Request, Response } from 'express';
import pool from '../config/database';

function parseOptionalNumber(value: any): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalInt(value: any): number | null {
  const parsed = parseOptionalNumber(value);
  if (parsed === null) {
    return null;
  }
  return Math.trunc(parsed);
}

export const getAIConfig = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const result = await pool.query(
      `SELECT
        id,
        provider,
        model,
        base_url,
        openai_organization,
        openai_project,
        anthropic_version,
        temperature,
        max_tokens,
        top_p,
        top_k,
        timeout_ms,
        max_retries
       FROM ai_configs
       WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({ config: null });
    }

    res.json({ config: result.rows[0] });
  } catch (error) {
    console.error('获取AI配置失败:', error);
    res.status(500).json({ message: '获取AI配置失败' });
  }
};

export const saveAIConfig = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const {
      provider,
      apiKey,
      model,
      baseUrl,
      openaiOrganization,
      openaiProject,
      anthropicVersion,
      temperature,
      maxTokens,
      topP,
      topK,
      timeoutMs,
      maxRetries,
    } = req.body;

    if (!provider || !apiKey || !model) {
      return res.status(400).json({ message: '请填写完整的配置信息' });
    }

    const temperatureValue = parseOptionalNumber(temperature);
    const maxTokensValue = parseOptionalInt(maxTokens);
    const topPValue = parseOptionalNumber(topP);
    const topKValue = parseOptionalInt(topK);
    const timeoutMsValue = parseOptionalInt(timeoutMs);
    const maxRetriesValue = parseOptionalInt(maxRetries);

    const openaiOrganizationValue = provider === 'openai' ? (openaiOrganization || null) : null;
    const openaiProjectValue = provider === 'openai' ? (openaiProject || null) : null;
    const anthropicVersionValue = provider === 'anthropic' ? (anthropicVersion || null) : null;
    const topKProviderValue = provider === 'anthropic' ? topKValue : null;

    const existingConfig = await pool.query(
      'SELECT id FROM ai_configs WHERE user_id = $1',
      [userId]
    );

    if (existingConfig.rows.length > 0) {
      await pool.query(
        `UPDATE ai_configs
         SET
           provider = $1,
           api_key = $2,
           model = $3,
           base_url = $4,
           openai_organization = $5,
           openai_project = $6,
           anthropic_version = $7,
           temperature = $8,
           max_tokens = $9,
           top_p = $10,
           top_k = $11,
           timeout_ms = $12,
           max_retries = $13,
           updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $14`,
        [
          provider,
          apiKey,
          model,
          baseUrl || null,
          openaiOrganizationValue,
          openaiProjectValue,
          anthropicVersionValue,
          temperatureValue,
          maxTokensValue,
          topPValue,
          topKProviderValue,
          timeoutMsValue,
          maxRetriesValue,
          userId,
        ]
      );
    } else {
      await pool.query(
        `INSERT INTO ai_configs (
           user_id,
           provider,
           api_key,
           model,
           base_url,
           openai_organization,
           openai_project,
           anthropic_version,
           temperature,
           max_tokens,
           top_p,
           top_k,
           timeout_ms,
           max_retries
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
         )`,
        [
          userId,
          provider,
          apiKey,
          model,
          baseUrl || null,
          openaiOrganizationValue,
          openaiProjectValue,
          anthropicVersionValue,
          temperatureValue,
          maxTokensValue,
          topPValue,
          topKProviderValue,
          timeoutMsValue,
          maxRetriesValue,
        ]
      );
    }

    res.json({ message: 'AI配置保存成功' });
  } catch (error) {
    console.error('保存AI配置失败:', error);
    res.status(500).json({ message: '保存AI配置失败' });
  }
};
