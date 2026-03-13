import { createClient, type RedisClientType } from 'redis';

const CODE_KEY_PREFIX = 'auth:verification:code:';
const COOLDOWN_KEY_PREFIX = 'auth:verification:cooldown:';
const CONSUME_CODE_SCRIPT = `
  local stored = redis.call('GET', KEYS[1])
  if not stored then
    return 0
  end
  if stored ~= ARGV[1] then
    return -1
  end
  redis.call('DEL', KEYS[1])
  return 1
`;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

class VerificationCodeStore {
  private client: RedisClientType | null = null;
  private initPromise: Promise<void> | null = null;
  private ready = false;
  private errorLogged = false;

  private getCodeKey(email: string) {
    return `${CODE_KEY_PREFIX}${normalizeEmail(email)}`;
  }

  private getCooldownKey(email: string) {
    return `${COOLDOWN_KEY_PREFIX}${normalizeEmail(email)}`;
  }

  private ensureClient() {
    if (this.client) {
      return this.client;
    }

    const redisUrl = process.env.REDIS_URL?.trim();
    if (!redisUrl) {
      throw new Error('未配置 REDIS_URL，验证码服务需要 Redis');
    }

    this.client = createClient({ url: redisUrl });

    this.client.on('ready', () => {
      this.ready = true;
      this.errorLogged = false;
      console.log('Redis 验证码存储已连接');
    });

    this.client.on('end', () => {
      this.ready = false;
    });

    this.client.on('error', (error) => {
      this.ready = false;

      if (this.errorLogged) {
        return;
      }

      this.errorLogged = true;
      console.error('Redis 验证码存储连接异常:', error);
    });

    return this.client;
  }

  async initialize() {
    if (this.ready) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    const client = this.ensureClient();
    if (client.isOpen) {
      this.ready = true;
      return;
    }

    this.initPromise = client
      .connect()
      .then(() => undefined)
      .finally(() => {
        this.initPromise = null;
      });

    return this.initPromise;
  }

  private async getClient() {
    await this.initialize();

    if (!this.client || !this.ready) {
      throw new Error('Redis 验证码存储不可用');
    }

    return this.client;
  }

  async getCooldownRemainingSeconds(email: string) {
    const client = await this.getClient();
    const ttl = await client.ttl(this.getCooldownKey(email));
    return ttl > 0 ? ttl : 0;
  }

  async saveCode(email: string, code: string, codeExpirySeconds: number, cooldownSeconds: number) {
    const client = await this.getClient();
    const codeKey = this.getCodeKey(email);
    const cooldownKey = this.getCooldownKey(email);

    await client
      .multi()
      .set(codeKey, code, { EX: codeExpirySeconds })
      .set(cooldownKey, '1', { EX: cooldownSeconds })
      .exec();
  }

  async clear(email: string) {
    const client = await this.getClient();
    await client.del([this.getCodeKey(email), this.getCooldownKey(email)]);
  }

  async consumeCode(email: string, code: string) {
    const client = await this.getClient();
    const result = await client.eval(CONSUME_CODE_SCRIPT, {
      keys: [this.getCodeKey(email)],
      arguments: [code],
    });

    return Number(result) === 1;
  }
}

export const verificationCodeStore = new VerificationCodeStore();
