import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import {
  getAIChatVisibility,
  getSystemSettingsVisibility,
  getUserQueryVisibility,
} from '../services/systemSettingsAccess';

export interface AuthRequest extends Request {
  userId?: number;
  email?: string;
}

export interface AuthTokenPayload {
  userId: number;
  email: string;
}

export const parseBearerToken = (authorization?: string): string | null => {
  if (!authorization) {
    return null;
  }

  const normalized = authorization.trim();
  if (!normalized.startsWith('Bearer ')) {
    return null;
  }

  return normalized.slice('Bearer '.length).trim() || null;
};

export const verifyAccessToken = (token: string): AuthTokenPayload => {
  return jwt.verify(token, process.env.JWT_SECRET || 'default_secret') as AuthTokenPayload;
};

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = parseBearerToken(req.headers.authorization);

    if (!token) {
      return res.status(401).json({ message: '未提供认证令牌' });
    }

    const decoded = verifyAccessToken(token);

    req.userId = decoded.userId;
    req.email = decoded.email;

    next();
  } catch {
    return res.status(401).json({ message: '认证令牌无效或已过期' });
  }
};

export const authenticateToken = authMiddleware;

function createPermissionGuard(
  getVisibility: (userId: number) => Promise<boolean>,
  featureName: string,
  errorMessage: string,
) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: '未提供认证信息' });
      }

      const hasPermission = await getVisibility(req.userId);
      if (!hasPermission) {
        return res.status(403).json({ message: `你没有打开${featureName}的权限，请联系管理员。` });
      }

      next();
    } catch (error) {
      console.error(errorMessage, error);
      return res.status(500).json({ message: errorMessage });
    }
  };
}

export const requireSystemSettingsAccess = createPermissionGuard(
  getSystemSettingsVisibility,
  '系统配置页',
  '校验系统配置权限失败',
);

export const requireAIChatAccess = createPermissionGuard(
  getAIChatVisibility,
  'AI对话页面',
  '校验AI对话权限失败',
);

export const requireUserQueryAccess = createPermissionGuard(
  getUserQueryVisibility,
  '用户查询页面',
  '校验用户查询权限失败',
);
