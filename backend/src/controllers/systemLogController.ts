import { Request, Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { createAuditLogSafe, listAuditLogs, type AuditActionType } from '../services/auditLogService';

function normalizeName(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseClientActionType(value: unknown): AuditActionType | null {
  if (value === 'add' || value === 'edit' || value === 'delete') {
    return value;
  }

  return null;
}

export const getSystemLogs = async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit ?? 200);
    const logs = await listAuditLogs(limit);
    res.json({ logs });
  } catch (error) {
    console.error('加载系统日志失败:', error);
    res.status(500).json({ message: '加载系统日志失败' });
  }
};

export const logClientAction = async (req: AuthRequest, res: Response) => {
  try {
    const actionType = parseClientActionType(req.body?.actionType);
    const targetType = normalizeName(req.body?.targetType);
    const targetName = normalizeName(req.body?.targetName);
    const detail = normalizeName(req.body?.detail) || undefined;

    if (!actionType || !targetType || !targetName) {
      return res.status(400).json({ message: '日志参数无效' });
    }

    await createAuditLogSafe({
      userId: req.userId,
      actionType,
      targetType,
      targetName,
      detail,
    });

    res.status(204).send();
  } catch (error) {
    console.error('记录系统日志失败:', error);
    res.status(500).json({ message: '记录系统日志失败' });
  }
};
