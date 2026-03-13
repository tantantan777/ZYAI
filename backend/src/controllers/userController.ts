import { Request, Response } from 'express';
import pool from '../config/database';
import { presenceService } from '../services/presenceService';
import { emitUserDirectoryUpdated, emitUserProfileUpdated } from '../services/socketServer';
import { getFeatureAccessInfo } from '../services/systemSettingsAccess';

function normalizeOptionalString(value: unknown): string | null {
  if (value === undefined || value === null || typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toISODate(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed) && !Number.isNaN(new Date(trimmed).getTime())) {
    return trimmed;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function parseOptionalInt(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const asInt = Math.trunc(parsed);
  return asInt > 0 ? asInt : null;
}

export const getProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as number;
    const accessInfo = await getFeatureAccessInfo(userId);

    const result = await pool.query(
      `SELECT
        u.id,
        u.email,
        u.name,
        u.gender,
        u.hire_date::text as hire_date,
        u.avatar,
        u.phone,
        u.created_at,
        u.updated_at,
        u.last_login,
        uop.position_id,
        p.name as position_name,
        d.id as department_id,
        d.name as department_name,
        un.id as unit_id,
        un.name as unit_name
      FROM users u
      LEFT JOIN user_org_positions uop ON uop.user_id = u.id
      LEFT JOIN org_positions p ON p.id = uop.position_id
      LEFT JOIN org_departments d ON d.id = p.department_id
      LEFT JOIN org_units un ON un.id = d.unit_id
      WHERE u.id = $1`,
      [userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: '用户不存在' });
    }

    const row = result.rows[0] as any;
    res.json({
      user: {
        id: row.id,
        email: row.email,
        name: row.name ?? null,
        gender: row.gender ?? null,
        hireDate: toISODate(row.hire_date),
        avatar: row.avatar ?? null,
        phone: row.phone ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastLogin: row.last_login,
        dashboardVisible: accessInfo?.dashboardVisible ?? false,
        aiChatVisible: accessInfo?.aiChatVisible ?? false,
        projectsVisible: accessInfo?.projectsVisible ?? false,
        userQueryVisible: accessInfo?.userQueryVisible ?? false,
        systemSettingsVisible: accessInfo?.systemSettingsVisible ?? false,
        unitId: row.unit_id ?? null,
        unitName: row.unit_name ?? null,
        departmentId: row.department_id ?? null,
        departmentName: row.department_name ?? null,
        positionId: row.position_id ?? null,
        positionName: row.position_name ?? null,
      },
    });
  } catch (error) {
    console.error('获取用户资料失败:', error);
    res.status(500).json({ message: '获取用户资料失败' });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as number;
    const name = normalizeOptionalString(req.body?.name);
    const genderRaw = req.body?.gender;
    const hireDateRaw = req.body?.hireDate;
    const phone = normalizeOptionalString(req.body?.phone);
    const avatar = normalizeOptionalString(req.body?.avatar);
    const positionId = req.body && 'positionId' in req.body ? parseOptionalInt(req.body.positionId) : undefined;

    let gender: string | null = null;
    if (genderRaw === undefined || genderRaw === null || genderRaw === '') {
      gender = null;
    } else if (genderRaw === 'male' || genderRaw === 'female' || genderRaw === 'unknown') {
      gender = genderRaw;
    } else {
      return res.status(400).json({ message: '性别无效' });
    }

    let hireDate: string | null = null;
    if (hireDateRaw === undefined || hireDateRaw === null || hireDateRaw === '') {
      hireDate = null;
    } else if (
      typeof hireDateRaw === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(hireDateRaw) &&
      !Number.isNaN(new Date(hireDateRaw).getTime())
    ) {
      hireDate = hireDateRaw;
    } else {
      return res.status(400).json({ message: '入职日期格式错误' });
    }

    if (avatar && avatar.length > 1024 * 1024) {
      return res.status(400).json({ message: '头像数据过大，请使用更小的图片' });
    }

    await pool.query(
      `UPDATE users
       SET
         name = $1,
         gender = $2,
         hire_date = $3,
         phone = $4,
         avatar = $5,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $6`,
      [name, gender, hireDate, phone, avatar, userId],
    );

    if (positionId !== undefined) {
      await pool.query(
        `INSERT INTO user_org_positions (user_id, position_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id)
         DO UPDATE SET position_id = EXCLUDED.position_id, updated_at = CURRENT_TIMESTAMP`,
        [userId, positionId],
      );
    }

    emitUserProfileUpdated(userId);
    emitUserDirectoryUpdated(userId);

    res.json({ message: '保存成功' });
  } catch (error) {
    console.error('更新用户资料失败:', error);
    res.status(500).json({ message: '更新用户资料失败' });
  }
};

export const listUsers = async (_req: Request, res: Response) => {
  try {
    const onlineUserIds = await presenceService.getOnlineUserIds();
    const result = await pool.query(
      `SELECT
        u.id,
        u.email,
        u.name,
        u.gender,
        u.phone,
        u.hire_date::text as hire_date,
        u.created_at::text as created_at,
        u.last_login::text as last_login,
        uop.position_id,
        p.name as position_name,
        d.name as department_name,
        un.name as unit_name
      FROM users u
      LEFT JOIN user_org_positions uop ON uop.user_id = u.id
      LEFT JOIN org_positions p ON p.id = uop.position_id
      LEFT JOIN org_departments d ON d.id = p.department_id
      LEFT JOIN org_units un ON un.id = d.unit_id
      ORDER BY u.created_at DESC, u.id DESC`,
    );

    res.json({
      users: result.rows.map((row: any) => ({
        id: row.id,
        email: row.email,
        name: row.name ?? null,
        gender: row.gender ?? null,
        phone: row.phone ?? null,
        hireDate: row.hire_date ?? null,
        createdAt: row.created_at,
        lastLogin: row.last_login ?? null,
        isOnline: onlineUserIds.has(row.id),
        unitName: row.unit_name ?? null,
        departmentName: row.department_name ?? null,
        positionId: row.position_id ?? null,
        positionName: row.position_name ?? null,
      })),
    });
  } catch (error) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({ message: '获取用户列表失败' });
  }
};
