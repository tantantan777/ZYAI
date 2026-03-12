import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { parseBearerToken, verifyAccessToken } from '../middleware/auth';
import { socketCorsOptions } from '../config/cors';
import { presenceService } from './presenceService';

type SocketUserData = {
  userId: number;
  email: string;
};

type OrgStructureEntityType = 'unit' | 'department' | 'position';

let ioInstance: Server | null = null;

export const emitUserProfileUpdated = (userId: number) => {
  ioInstance?.to(`user:${userId}`).emit('user:profile-updated', { userId });
};

export const emitUserDirectoryUpdated = (userId: number) => {
  ioInstance?.emit('user:directory-updated', { userId });
};

export const emitOrgStructureUpdated = (entityType: OrgStructureEntityType) => {
  ioInstance?.emit('org:structure-updated', { entityType });
};

export const attachSocketServer = (server: HttpServer) => {
  const io = new Server(server, {
    cors: socketCorsOptions,
  });

  io.use((socket, next) => {
    const authToken =
      (typeof socket.handshake.auth.token === 'string' && socket.handshake.auth.token) ||
      parseBearerToken(socket.handshake.headers.authorization);

    if (!authToken) {
      next(new Error('Missing auth token'));
      return;
    }

    try {
      const decoded = verifyAccessToken(authToken);
      socket.data.user = {
        userId: decoded.userId,
        email: decoded.email,
      } satisfies SocketUserData;
      next();
    } catch {
      next(new Error('Invalid or expired auth token'));
    }
  });

  ioInstance = io;

  const unsubscribePresence = presenceService.onPresenceChange((payload) => {
    io.emit('presence:user', payload);
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as SocketUserData | undefined;
    if (!user) {
      socket.disconnect(true);
      return;
    }

    socket.join(`user:${user.userId}`);
    void presenceService.addConnection(user.userId, user.email, socket.id);

    socket.on('presence:activity', () => {
      void presenceService.markUserActive(user.userId);
    });

    socket.on('disconnect', () => {
      void presenceService.removeConnection(user.userId, socket.id);
    });
  });

  io.engine.on('close', () => {
    ioInstance = null;
    unsubscribePresence();
  });

  return io;
};
