import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import {
  getAIChatVisibility,
  getProjectCreateAccess,
  getProjectDeleteAccess,
  getProjectEditAccess,
  getProjectsVisibility,
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
  getAccess: (userId: number) => Promise<boolean>,
  deniedMessage: string,
  errorLogMessage: string,
) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ message: '未提供认证信息' });
      }

      const hasPermission = await getAccess(req.userId);
      if (!hasPermission) {
        return res.status(403).json({ message: deniedMessage });
      }

      next();
    } catch (error) {
      console.error(errorLogMessage, error);
      return res.status(500).json({ message: errorLogMessage });
    }
  };
}

export const requireSystemSettingsAccess = createPermissionGuard(
  getSystemSettingsVisibility,
  '你没有打开系统配置页的权限，请联系管理员。',
  '校验系统配置权限失败',
);

export const requireAIChatAccess = createPermissionGuard(
  getAIChatVisibility,
  '你没有打开AI对话页面的权限，请联系管理员。',
  '校验AI对话权限失败',
);

export const requireProjectsAccess = createPermissionGuard(
  getProjectsVisibility,
  '你没有打开项目管理页面的权限，请联系管理员。',
  '校验项目管理权限失败',
);

export const requireProjectCreateAccess = createPermissionGuard(
  getProjectCreateAccess,
  '你没有新增项目的权限，请联系管理员。',
  '校验新增项目权限失败',
);

export const requireProjectEditAccess = createPermissionGuard(
  getProjectEditAccess,
  '你没有编辑项目的权限，请联系管理员。',
  '校验编辑项目权限失败',
);

export const requireProjectDeleteAccess = createPermissionGuard(
  getProjectDeleteAccess,
  '你没有删除项目的权限，请联系管理员。',
  '校验删除项目权限失败',
);

export const requireUserQueryAccess = createPermissionGuard(
  getUserQueryVisibility,
  '你没有打开用户查询页面的权限，请联系管理员。',
  '校验用户查询权限失败',
);
