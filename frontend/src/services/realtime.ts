import { io, type Socket } from 'socket.io-client';
import { getBackendOrigin } from '../utils/backendUrl';

export type PresenceUserEvent = {
  userId: number;
  email: string;
  isOnline: boolean;
  connectedAt: string | null;
  lastSeenAt: string | null;
  lastActiveAt: string | null;
  socketCount: number;
};

export type UserProfileUpdatedEvent = {
  userId: number;
};

export type UserDirectoryUpdatedEvent = {
  userId: number;
};

export type OrgStructureUpdatedEvent = {
  entityType: 'unitNature' | 'projectType' | 'constructionNature' | 'unit' | 'department' | 'position';
};

const SOCKET_SERVER_URL = getBackendOrigin();

let socket: Socket | null = null;
let activeToken: string | null = null;
let publicSocket: Socket | null = null;

const getToken = () => localStorage.getItem('token') || sessionStorage.getItem('token');

export const ensureRealtimeConnection = () => {
  const token = getToken();
  if (!token) {
    disconnectRealtime();
    return null;
  }

  if (socket && activeToken === token) {
    return socket;
  }

  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }

  activeToken = token;
  socket = io(SOCKET_SERVER_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    withCredentials: true,
  });

  socket.on('connect_error', (error) => {
    console.error('实时连接失败:', error.message);
  });

  return socket;
};

export const connectPublicRealtime = () => {
  if (getToken()) {
    return null;
  }

  if (publicSocket) {
    return publicSocket;
  }

  publicSocket = io(SOCKET_SERVER_URL, {
    transports: ['websocket', 'polling'],
    withCredentials: true,
  });

  publicSocket.on('connect_error', (error) => {
    console.error('公共实时连接失败:', error.message);
  });

  return publicSocket;
};

export const getRealtimeSocket = () => socket;

export const disconnectRealtime = () => {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }

  socket = null;
  activeToken = null;
};

export const disconnectPublicRealtime = () => {
  if (publicSocket) {
    publicSocket.removeAllListeners();
    publicSocket.disconnect();
  }

  publicSocket = null;
};

export const emitPresenceActivity = () => {
  socket?.emit('presence:activity');
};
