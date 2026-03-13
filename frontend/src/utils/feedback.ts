import { message as antdMessage } from 'antd';

type FeedbackType = 'success' | 'error' | 'warning' | 'info';

type FeedbackArgs = {
  message: string;
  description?: string;
  placement?: string;
  duration?: number;
  key?: string;
  dedupeKey?: string;
  dedupeWindowMs?: number;
};

type FeedbackInput = string | FeedbackArgs;

const DEFAULT_DURATIONS: Record<FeedbackType, number> = {
  success: 2.2,
  info: 2.8,
  warning: 3.2,
  error: 4,
};

const DEFAULT_DEDUPE_WINDOW_MS = 1500;
const recentMessageTimestamps = new Map<string, number>();

antdMessage.config({
  top: 72,
  maxCount: 3,
});

function normalize(input: FeedbackInput): FeedbackArgs {
  if (typeof input === 'string') {
    return { message: input };
  }

  return input;
}

function normalizeText(text?: string) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildContent(input: FeedbackArgs) {
  const title = normalizeText(input.message);
  const description = normalizeText(input.description);

  if (!description) {
    return title;
  }

  return `${title}：${description.replace(/^[：:]\s*/, '')}`;
}

function shouldSuppressDuplicate(key: string, dedupeWindowMs: number) {
  const now = Date.now();
  const lastShownAt = recentMessageTimestamps.get(key);

  if (lastShownAt && now - lastShownAt < dedupeWindowMs) {
    return true;
  }

  recentMessageTimestamps.set(key, now);
  window.setTimeout(() => {
    if (recentMessageTimestamps.get(key) === now) {
      recentMessageTimestamps.delete(key);
    }
  }, dedupeWindowMs);

  return false;
}

function openFeedback(type: FeedbackType, input: FeedbackInput) {
  const normalized = normalize(input);
  const content = buildContent(normalized);
  const dedupeWindowMs = normalized.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS;
  const messageKey = normalized.key ?? normalized.dedupeKey ?? `${type}:${content}`;

  if (!content || shouldSuppressDuplicate(messageKey, dedupeWindowMs)) {
    return Promise.resolve();
  }

  return antdMessage.open({
    type,
    key: messageKey,
    content,
    duration: normalized.duration ?? DEFAULT_DURATIONS[type],
  });
}

export const feedback = {
  success: (input: FeedbackInput) => openFeedback('success', input),
  error: (input: FeedbackInput) => openFeedback('error', input),
  warning: (input: FeedbackInput) => openFeedback('warning', input),
  info: (input: FeedbackInput) => openFeedback('info', input),
  destroy: (key?: string) => antdMessage.destroy(key),
};

export type { FeedbackArgs, FeedbackInput };
