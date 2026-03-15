import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { sendVerificationCode } from '../config/email';
import { AuthRequest } from '../middleware/auth';
import { emitUserDirectoryUpdated } from '../services/socketServer';
import { getFeatureAccessInfo } from '../services/systemSettingsAccess';
import { verificationCodeStore } from '../services/verificationCodeStore';

const CHINESE_NAME_PATTERN = /^\p{Script=Han}{1,4}$/u;
const PHONE_PATTERN = /^1[3-9]\d{9}$/;

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function validateNewUserName(value: unknown): string | null {
  const name = normalizeOptionalString(value);
  if (!name) {
    return null;
  }

  return CHINESE_NAME_PATTERN.test(name) ? name : null;
}

function validatePhone(value: unknown): string | null {
  const phone = normalizeOptionalString(value);
  if (!phone) {
    return null;
  }

  return PHONE_PATTERN.test(phone) ? phone : null;
}

function validateHireDate(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const date = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date.getTime() > today.getTime()) {
    return null;
  }

  return trimmed;
}

function parsePositiveInt(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const asInt = Math.trunc(parsed);
  return asInt > 0 ? asInt : null;
}

async function loadFeatureAccessInfo(userId: number) {
  const accessInfo = await getFeatureAccessInfo(userId);

  return {
    isSystemAdmin: accessInfo?.isSystemAdmin ?? false,
    dashboardVisible: accessInfo?.dashboardVisible ?? false,
    aiChatVisible: accessInfo?.aiChatVisible ?? false,
    projectsVisible: accessInfo?.projectsVisible ?? false,
    projectCreateAllowed: accessInfo?.projectCreateAllowed ?? false,
    projectEditAllowed: accessInfo?.projectEditAllowed ?? false,
    projectDeleteAllowed: accessInfo?.projectDeleteAllowed ?? false,
    userQueryVisible: accessInfo?.userQueryVisible ?? false,
    systemSettingsVisible: accessInfo?.systemSettingsVisible ?? false,
  };
}

export const getRegistrationOrgStructure = async (_req: Request, res: Response) => {
  try {
    const [unitsResult, departmentsResult, positionsResult] = await Promise.all([
      pool.query('SELECT id, name FROM org_units ORDER BY sort_order ASC, id ASC'),
      pool.query('SELECT id, unit_id as "unitId", name FROM org_departments ORDER BY sort_order ASC, id ASC'),
      pool.query('SELECT id, department_id as "departmentId", name FROM org_positions ORDER BY sort_order ASC, id ASC'),
    ]);

    res.json({
      units: unitsResult.rows,
      departments: departmentsResult.rows,
      positions: positionsResult.rows,
    });
  } catch (error) {
    console.error('获取注册组织结构失败:', error);
    res.status(500).json({ message: '获取组织结构失败' });
  }
};

export const sendCode = async (req: Request, res: Response) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';

    if (!email) {
      return res.status(400).json({ message: '请提供邮箱地址' });
    }

    const codeExpiryTime = parseInt(process.env.CODE_EXPIRY_TIME || '300', 10);
    const codeCooldownTime = parseInt(process.env.CODE_COOLDOWN_TIME || '60', 10);

    const userResult = await pool.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
    const remainingTime = await verificationCodeStore.getCooldownRemainingSeconds(email);

    if (remainingTime > 0) {
      return res.status(429).json({
        message: `请 ${remainingTime} 秒后再试`,
        remainingTime,
        isExistingUser: userResult.rows.length > 0,
      });
    }

    const code = generateCode();
    await verificationCodeStore.saveCode(email, code, codeExpiryTime, codeCooldownTime);

    try {
      await sendVerificationCode(email, code);
    } catch (error) {
      await verificationCodeStore.clear(email).catch(() => undefined);
      throw error;
    }

    res.json({
      message: '验证码已发送到您的邮箱',
      cooldownTime: codeCooldownTime,
      isExistingUser: userResult.rows.length > 0,
    });
  } catch (error) {
    console.error('发送验证码失败:', error);
    res.status(500).json({ message: '发送验证码失败，请稍后重试' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    const { remember } = req.body;

    if (!email || !code) {
      return res.status(400).json({ message: '请提供邮箱和验证码' });
    }

    const verificationMatched = await verificationCodeStore.consumeCode(email, code);
    if (!verificationMatched) {
      return res.status(400).json({ message: '验证码无效或已过期' });
    }

    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    let user = userResult.rows[0];
    const isExistingUser = userResult.rows.length > 0;

    if (!isExistingUser) {
      const name = validateNewUserName(req.body?.name);
      const gender = req.body?.gender === 'male' || req.body?.gender === 'female' ? req.body.gender : null;
      const phone = validatePhone(req.body?.phone);
      const hireDate = validateHireDate(req.body?.hireDate);
      const positionId = parsePositiveInt(req.body?.positionId);

      if (!name) {
        return res.status(400).json({ message: '姓名仅支持 1-4 位中文字符' });
      }
      if (!gender) {
        return res.status(400).json({ message: '请选择性别' });
      }
      if (!phone) {
        return res.status(400).json({ message: '请输入有效的手机号' });
      }
      if (!hireDate) {
        return res.status(400).json({ message: '请选择有效的入职时间' });
      }
      if (!positionId) {
        return res.status(400).json({ message: '请选择所属职位' });
      }

      const positionExists = await pool.query('SELECT id FROM org_positions WHERE id = $1 LIMIT 1', [positionId]);
      if (positionExists.rows.length === 0) {
        return res.status(400).json({ message: '所选职位不存在' });
      }

      const adminCountResult = await pool.query<{ count: string }>(
        'SELECT COUNT(*)::text as count FROM users WHERE is_system_admin = TRUE',
      );
      const grantSystemAdmin = Number(adminCountResult.rows[0]?.count ?? '0') === 0;

      const insertedUser = await pool.query(
        `INSERT INTO users (
           email,
           name,
           gender,
           phone,
           hire_date,
           is_system_admin,
           system_settings_visible,
           last_login,
           last_seen_at,
           last_active_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, FALSE, NOW(), NOW(), NOW())
         RETURNING *`,
        [email, name, gender, phone, hireDate, grantSystemAdmin],
      );

      user = insertedUser.rows[0];

      await pool.query(
        `INSERT INTO user_org_positions (user_id, position_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id)
         DO UPDATE SET position_id = EXCLUDED.position_id, updated_at = CURRENT_TIMESTAMP`,
        [user.id, positionId],
      );
    } else {
      const updatedUser = await pool.query(
        'UPDATE users SET last_login = NOW(), last_seen_at = NOW(), last_active_at = NOW() WHERE email = $1 RETURNING *',
        [email],
      );
      user = updatedUser.rows[0];
    }

    emitUserDirectoryUpdated(user.id);

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: remember ? '30d' : '7d' },
    );

    res.json({
      message: '登录成功',
      token,
      user: {
        id: user.id,
        email: user.email,
        ...(await loadFeatureAccessInfo(user.id)),
      },
    });
  } catch (error) {
    console.error('登录失败:', error);
    res.status(500).json({ message: '登录失败，请稍后重试' });
  }
};

export const verify = async (req: AuthRequest, res: Response) => {
  try {
    const userResult = await pool.query('SELECT id, email, created_at, last_login FROM users WHERE id = $1', [
      req.userId,
    ]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: '用户不存在' });
    }

    res.json({
      message: '验证成功',
      user: {
        ...userResult.rows[0],
        ...(await loadFeatureAccessInfo(req.userId!)),
      },
    });
  } catch (error) {
    console.error('验证失败:', error);
    res.status(500).json({ message: '验证失败，请稍后重试' });
  }
};
