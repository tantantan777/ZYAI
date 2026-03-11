import { Request, Response } from 'express';
import pool from '../config/database';
import { generateAIResponse } from '../services/aiService';

export const getConversations = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const result = await pool.query(
      `SELECT c.id, c.title, c.topic, c.updated_at,
        (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
       FROM conversations c
       WHERE c.user_id = $1
       ORDER BY c.updated_at DESC`,
      [userId]
    );

    res.json({ conversations: result.rows });
  } catch (error) {
    console.error('获取对话列表失败:', error);
    res.status(500).json({ message: '获取对话列表失败' });
  }
};

export const createConversation = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { title, topic } = req.body;

    const result = await pool.query(
      'INSERT INTO conversations (user_id, title, topic) VALUES ($1, $2, $3) RETURNING *',
      [userId, title || '新对话', topic || '项目管理']
    );

    res.json({ conversation: result.rows[0] });
  } catch (error) {
    console.error('创建对话失败:', error);
    res.status(500).json({ message: '创建对话失败' });
  }
};

export const getMessages = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { conversationId } = req.params;

    const conversationCheck = await pool.query(
      'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
      [conversationId, userId]
    );

    if (conversationCheck.rows.length === 0) {
      return res.status(404).json({ message: '对话不存在' });
    }

    const result = await pool.query(
      'SELECT id, role, content, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversationId]
    );

    res.json({ messages: result.rows });
  } catch (error) {
    console.error('获取消息列表失败:', error);
    res.status(500).json({ message: '获取消息列表失败' });
  }
};

export const sendMessage = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { conversationId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: '消息内容不能为空' });
    }

    const conversationCheck = await pool.query(
      'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
      [conversationId, userId]
    );

    if (conversationCheck.rows.length === 0) {
      return res.status(404).json({ message: '对话不存在' });
    }

    // 检查AI配置
    const aiConfig = await pool.query(
      `SELECT
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
       FROM ai_configs
       WHERE user_id = $1`,
      [userId]
    );

    if (aiConfig.rows.length === 0) {
      return res.status(400).json({
        message: '请先在系统配置中配置AI服务',
        code: 'NO_AI_CONFIG'
      });
    }

    // 保存用户消息
    const userMessage = await pool.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3) RETURNING *',
      [conversationId, 'user', content]
    );

    // 更新对话时间
    await pool.query(
      'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [conversationId]
    );

    // 获取对话历史（最近10条消息）
    const historyResult = await pool.query(
      'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 10',
      [conversationId]
    );

    // 构建消息历史（倒序排列）
    const messageHistory = historyResult.rows.reverse().map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    const messages = messageHistory;

    // 生成AI回复
    const config = aiConfig.rows[0];
    let assistantReply: string;

    try {
      assistantReply = await generateAIResponse({
        provider: config.provider,
        apiKey: config.api_key,
        model: config.model,
        baseUrl: config.base_url ?? undefined,
        openaiOrganization: config.openai_organization ?? undefined,
        openaiProject: config.openai_project ?? undefined,
        anthropicVersion: config.anthropic_version ?? undefined,
        temperature: config.temperature ?? undefined,
        maxTokens: config.max_tokens ?? undefined,
        topP: config.top_p ?? undefined,
        topK: config.top_k ?? undefined,
        timeoutMs: config.timeout_ms ?? undefined,
        maxRetries: config.max_retries ?? undefined,
      }, messages);
    } catch (error: any) {
      console.error('AI生成回复失败:', error);
      return res.status(500).json({
        message: 'AI服务调用失败，请检查API配置是否正确',
        error: error.message
      });
    }

    // 保存AI回复
    const assistantMessage = await pool.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3) RETURNING *',
      [conversationId, 'assistant', assistantReply]
    );

    res.json({
      userMessage: userMessage.rows[0],
      assistantMessage: assistantMessage.rows[0]
    });
  } catch (error) {
    console.error('发送消息失败:', error);
    res.status(500).json({ message: '发送消息失败' });
  }
};

export const updateConversation = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { conversationId } = req.params;
    const { title } = req.body;

    const result = await pool.query(
      'UPDATE conversations SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *',
      [title, conversationId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: '对话不存在' });
    }

    res.json({ conversation: result.rows[0] });
  } catch (error) {
    console.error('更新对话失败:', error);
    res.status(500).json({ message: '更新对话失败' });
  }
};

export const deleteConversation = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { conversationId } = req.params;

    const result = await pool.query(
      'DELETE FROM conversations WHERE id = $1 AND user_id = $2 RETURNING id',
      [conversationId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: '对话不存在' });
    }

    res.json({ message: '对话已删除' });
  } catch (error) {
    console.error('删���对话失败:', error);
    res.status(500).json({ message: '删除对话失败' });
  }
};
