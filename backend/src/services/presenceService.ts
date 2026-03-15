import { EventEmitter } from 'events';
import { createClient, type RedisClientType } from 'redis';
import pool from '../config/database';

const PRESENCE_KEY_PREFIX = 'presence:user:';
const PRESENCE_TTL_SECONDS = 90;
const PRESENCE_REFRESH_INTERVAL_MS = 30_000;
const PRESENCE_PERSIST_INTERVAL_MS = 60_000;

type PresenceSession = {
  userId: number;
  email: string;
  socketIds: Set<string>;
  connectedAt: string;
  lastSeenAt: string;
  lastActiveAt: string;
};

export type PresenceChangePayload = {
  userId: number;
  email: string;
  isOnline: boolean;
  connectedAt: string | null;
  lastSeenAt: string | null;
  lastActiveAt: string | null;
  socketCount: number;
};

class PresenceService {
  private redisClient: RedisClientType | null = null;
  private redisEnabled = false;
  private redisReady = false;
  private redisConnectPromise: Promise<void> | null = null;
  private redisErrorLogged = false;
  private initPromise: Promise<void> | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private sessions = new Map<number, PresenceSession>();
  private eventBus = new EventEmitter();
  private lastSeenPersistedAt = new Map<number, number>();
  private lastActivityPersistedAt = new Map<number, number>();

  async initialize() {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.bootstrap();
    return this.initPromise;
  }

  private async bootstrap() {
    this.redisEnabled = Boolean(process.env.REDIS_URL?.trim());

    if (!this.redisEnabled) {
      console.log('鏈厤缃?REDIS_URL锛宲resence 浣跨敤鍐呭瓨妯″紡');
      this.startRefreshLoop();
      return;
    }

    this.ensureRedisClient();
    void this.connectRedis();
    this.startRefreshLoop();
  }

  private ensureRedisClient() {
    if (!this.redisEnabled || this.redisClient) {
      return;
    }

    this.redisClient = createClient({
      url: process.env.REDIS_URL?.trim(),
    });

    this.redisClient.on('error', (error) => {
      this.handleRedisUnavailable(error, 'Redis 杩炴帴寮傚父锛宲resence 宸插洖閫€鍒板唴瀛樻ā寮?');
      this.scheduleReconnect();
    });

    this.redisClient.on('ready', () => {
      this.redisErrorLogged = false;
      this.redisReady = true;
      this.clearReconnectTimer();
      console.log('Redis presence 已连接');
    });

    this.redisClient.on('end', () => {
      this.redisReady = false;
      this.scheduleReconnect();
    });
  }

  private async connectRedis() {
    this.ensureRedisClient();

    if (!this.redisClient || this.redisClient.isOpen) {
      return;
    }

    if (this.redisConnectPromise) {
      return this.redisConnectPromise;
    }

    this.redisConnectPromise = this.redisClient
      .connect()
      .then(() => undefined)
      .catch((error) => {
        this.handleRedisUnavailable(error, 'Redis 鍒濆鍖栧け璐ワ紝presence 宸插洖閫€鍒板唴瀛樻ā寮?');
        this.scheduleReconnect();
      })
      .finally(() => {
        this.redisConnectPromise = null;
      });

    return this.redisConnectPromise;
  }

  private scheduleReconnect() {
    if (!this.redisEnabled || this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setInterval(() => {
      if (this.redisClient?.isOpen) {
        this.clearReconnectTimer();
        return;
      }

      void this.connectRedis();
    }, 5_000);
  }

  private clearReconnectTimer() {
    if (!this.reconnectTimer) {
      return;
    }

    clearInterval(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private handleRedisUnavailable(error: unknown, message: string) {
    this.redisReady = false;

    if (this.redisErrorLogged) {
      return;
    }

    this.redisErrorLogged = true;
    console.error(message, error);
  }

  onPresenceChange(listener: (payload: PresenceChangePayload) => void) {
    this.eventBus.on('presence:change', listener);
    return () => {
      this.eventBus.off('presence:change', listener);
    };
  }

  async addConnection(userId: number, email: string, socketId: string) {
    const now = new Date().toISOString();
    const session = this.sessions.get(userId);

    if (session) {
      session.socketIds.add(socketId);
      session.lastSeenAt = now;
      session.lastActiveAt = now;
      session.email = email;
      await this.syncSession(session);
      this.emitPresenceChange(session, true);
      await this.persistPresence(userId, { updateSeen: true, updateActive: true, force: true });
      return;
    }

    const nextSession: PresenceSession = {
      userId,
      email,
      socketIds: new Set([socketId]),
      connectedAt: now,
      lastSeenAt: now,
      lastActiveAt: now,
    };

    this.sessions.set(userId, nextSession);
    await this.syncSession(nextSession);
    this.emitPresenceChange(nextSession, true);
    await this.persistPresence(userId, { updateSeen: true, updateActive: true, force: true });
  }

  async removeConnection(userId: number, socketId: string) {
    const session = this.sessions.get(userId);
    if (!session) {
      return;
    }

    session.socketIds.delete(socketId);

    if (session.socketIds.size > 0) {
      session.lastSeenAt = new Date().toISOString();
      await this.syncSession(session);
      this.emitPresenceChange(session, true);
      await this.persistPresence(userId, { updateSeen: true, force: false });
      return;
    }

    const disconnectedAt = new Date().toISOString();
    session.lastSeenAt = disconnectedAt;
    this.sessions.delete(userId);
    this.lastSeenPersistedAt.delete(userId);
    this.lastActivityPersistedAt.delete(userId);
    await this.clearPresence(userId);
    this.emitPresenceChange(
      {
        ...session,
        socketIds: new Set(),
        lastSeenAt: disconnectedAt,
      },
      false,
    );
    await this.persistPresence(userId, { updateSeen: true, force: true, explicitSeenAt: disconnectedAt });
  }

  async markUserActive(userId: number) {
    const session = this.sessions.get(userId);
    if (!session) {
      return;
    }

    const now = new Date().toISOString();
    session.lastSeenAt = now;
    session.lastActiveAt = now;
    await this.syncSession(session);
    this.emitPresenceChange(session, true);
    await this.persistPresence(userId, { updateSeen: true, updateActive: true, force: false });
  }

  async getOnlineUserIds() {
    if (!this.redisReady || !this.redisClient) {
      return new Set(this.sessions.keys());
    }

    try {
      const userIds = new Set<number>();
      for await (const batch of this.redisClient.scanIterator({
        MATCH: `${PRESENCE_KEY_PREFIX}*`,
        COUNT: 200,
      })) {
        const keys = Array.isArray(batch) ? batch : [batch];

        for (const key of keys) {
          const userId = Number(key.slice(PRESENCE_KEY_PREFIX.length));
          if (Number.isInteger(userId) && userId > 0) {
            userIds.add(userId);
          }
        }
      }
      return userIds;
    } catch (error) {
      console.error('璇诲彇鍦ㄧ嚎鐢ㄦ埛澶辫触锛屽凡鍥為€€鍒板綋鍓嶅疄渚嬪唴瀛樻暟鎹?', error);
      return new Set(this.sessions.keys());
    }
  }

  private emitPresenceChange(session: PresenceSession, isOnline: boolean) {
    const payload: PresenceChangePayload = {
      userId: session.userId,
      email: session.email,
      isOnline,
      connectedAt: isOnline ? session.connectedAt : null,
      lastSeenAt: session.lastSeenAt,
      lastActiveAt: session.lastActiveAt,
      socketCount: isOnline ? session.socketIds.size : 0,
    };

    this.eventBus.emit('presence:change', payload);
  }

  private async syncSession(session: PresenceSession) {
    if (!this.redisReady || !this.redisClient) {
      return;
    }

    const key = `${PRESENCE_KEY_PREFIX}${session.userId}`;
    const payload = JSON.stringify({
      userId: session.userId,
      email: session.email,
      connectedAt: session.connectedAt,
      lastSeenAt: session.lastSeenAt,
      lastActiveAt: session.lastActiveAt,
      socketCount: session.socketIds.size,
    });

    try {
      await this.redisClient.set(key, payload, {
        EX: PRESENCE_TTL_SECONDS,
      });
    } catch (error) {
      console.error('鍐欏叆 Redis presence 澶辫触:', error);
    }
  }

  private async clearPresence(userId: number) {
    if (!this.redisReady || !this.redisClient) {
      return;
    }

    try {
      await this.redisClient.del(`${PRESENCE_KEY_PREFIX}${userId}`);
    } catch (error) {
      console.error('娓呯悊 Redis presence 澶辫触:', error);
    }
  }

  private startRefreshLoop() {
    if (this.refreshTimer) {
      return;
    }

    this.refreshTimer = setInterval(() => {
      void this.refreshOnlineSessions();
    }, PRESENCE_REFRESH_INTERVAL_MS);
  }

  private async refreshOnlineSessions() {
    const now = new Date().toISOString();

    for (const session of this.sessions.values()) {
      session.lastSeenAt = now;
      await this.syncSession(session);
      await this.persistPresence(session.userId, { updateSeen: true, force: false, explicitSeenAt: now });
    }
  }

  private async persistPresence(
    userId: number,
    options: {
      updateSeen: boolean;
      updateActive?: boolean;
      force: boolean;
      explicitSeenAt?: string;
      explicitActiveAt?: string;
    },
  ) {
    const now = Date.now();
    const shouldPersistSeen =
      options.updateSeen &&
      (options.force ||
        !this.lastSeenPersistedAt.has(userId) ||
        now - (this.lastSeenPersistedAt.get(userId) as number) >= PRESENCE_PERSIST_INTERVAL_MS);
    const shouldPersistActivity =
      Boolean(options.updateActive) &&
      (options.force ||
        !this.lastActivityPersistedAt.has(userId) ||
        now - (this.lastActivityPersistedAt.get(userId) as number) >= PRESENCE_PERSIST_INTERVAL_MS);

    if (!shouldPersistSeen && !shouldPersistActivity) {
      return;
    }

    const updates: string[] = [];
    const values: Array<string | number> = [];

    if (shouldPersistSeen) {
      values.push(options.explicitSeenAt || new Date().toISOString());
      updates.push(`last_seen_at = $${values.length}`);
    }

    if (shouldPersistActivity) {
      values.push(options.explicitActiveAt || new Date().toISOString());
      updates.push(`last_active_at = $${values.length}`);
    }

    values.push(userId);

    try {
      await pool.query(
        `UPDATE users
         SET ${updates.join(', ')}
         WHERE id = $${values.length}`,
        values,
      );

      if (shouldPersistSeen) {
        this.lastSeenPersistedAt.set(userId, now);
      }
      if (shouldPersistActivity) {
        this.lastActivityPersistedAt.set(userId, now);
      }
    } catch (error) {
      console.error('鎸佷箙鍖栫敤鎴峰湪绾挎椂闂村け璐?', error);
    }
  }
}

export const presenceService = new PresenceService();


