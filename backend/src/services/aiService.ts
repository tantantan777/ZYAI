import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

type ConversationRole = 'user' | 'assistant';

interface AIConfig {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
  openaiOrganization?: string;
  openaiProject?: string;
  anthropicVersion?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

function isConversationMessage(
  message: { role: string; content: string }
): message is { role: ConversationRole; content: string } {
  return message.role === 'user' || message.role === 'assistant';
}

export async function generateAIResponse(
  config: AIConfig,
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  try {
    // Do not inject or forward any system/developer prompt. Keep only user/assistant turns.
    const conversationMessages = messages.filter(isConversationMessage);

    if (config.provider === 'openai') {
      return await generateOpenAIResponse(config, conversationMessages);
    } else if (config.provider === 'anthropic') {
      return await generateAnthropicResponse(config, conversationMessages);
    } else {
      throw new Error(`不支持的AI服务商: ${config.provider}`);
    }
  } catch (error: any) {
    console.error('AI生成回复失败:', error);
    throw new Error(`AI服务调用失败: ${error.message}`);
  }
}

async function generateOpenAIResponse(
  config: AIConfig,
  messages: Array<{ role: ConversationRole; content: string }>
): Promise<string> {
  const openai = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl || undefined,
    organization: config.openaiOrganization || undefined,
    project: config.openaiProject || undefined,
    timeout: config.timeoutMs,
    maxRetries: config.maxRetries,
  });

  const response = await openai.chat.completions.create({
    model: config.model,
    messages: messages.map(msg => ({
      role: msg.role,
      content: msg.content,
    })),
    temperature: config.temperature ?? 0.7,
    max_tokens: config.maxTokens ?? 2000,
    top_p: config.topP ?? undefined,
  });

  return response.choices[0]?.message?.content || '抱歉，我无法生成回复。';
}

async function generateAnthropicResponse(
  config: AIConfig,
  messages: Array<{ role: ConversationRole; content: string }>
): Promise<string> {
  const anthropic = new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseUrl || undefined,
    timeout: config.timeoutMs,
    maxRetries: config.maxRetries,
    defaultHeaders: config.anthropicVersion
      ? { 'anthropic-version': config.anthropicVersion }
      : undefined,
  });

  const response = await anthropic.messages.create({
    model: config.model,
    max_tokens: config.maxTokens ?? 2000,
    temperature: config.temperature ?? 0.7,
    top_p: config.topP ?? undefined,
    top_k: config.topK ?? undefined,
    messages: messages.map(msg => ({
      role: msg.role,
      content: msg.content,
    })),
  });

  const content = response.content[0];
  if (content.type === 'text') {
    return content.text;
  }

  return '抱歉，我无法生成回复。';
}
