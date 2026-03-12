import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { sendVerificationCode } from '../config/email';
import { AuthRequest } from '../middleware/auth';
import { emitUserDirectoryUpdated } from '../services/socketServer';
import { getFeatureAccessInfo } from '../services/systemSettingsAccess';

const generateCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const sendCode = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: '请提供邮箱地址' });
    }

    const codeExpiryTime = parseInt(process.env.CODE_EXPIRY_TIME || '300', 10);
    const codeCooldownTime = parseInt(process.env.CODE_COOLDOWN_TIME || '60', 10);

    const lastCodeResult = await pool.query(
      'SELECT created_at FROM verification_codes WHERE email = $1 ORDER BY created_at DESC LIMIT 1',
      [email],
    );

    if (lastCodeResult.rows.length > 0) {
      const lastCodeTime = new Date(lastCodeResult.rows[0].created_at);
      const now = new Date();
      const timeDiff = Math.floor((now.getTime() - lastCodeTime.getTime()) / 1000);
      const remainingTime = codeCooldownTime - timeDiff;

      if (remainingTime > 0) {
        return res.status(429).json({
          message: `请 ${remainingTime} 秒后再试`,
          remainingTime,
        });
      }
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + codeExpiryTime * 1000);

    await pool.query('INSERT INTO verification_codes (email, code, expires_at) VALUES ($1, $2, $3)', [
      email,
      code,
      expiresAt,
    ]);

    await sendVerificationCode(email, code);

    res.json({
      message: '验证码已发送到您的邮箱',
      cooldownTime: codeCooldownTime,
    });
  } catch (error) {
    console.error('发送验证码失败:', error);
    res.status(500).json({ message: '发送验证码失败，请稍后重试' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, code, remember } = req.body;

    if (!email || !code) {
      return res.status(400).json({ message: '请提供邮箱和验证码' });
    }

    const result = await pool.query(
      'SELECT * FROM verification_codes WHERE email = $1 AND code = $2 AND used = FALSE AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [email, code],
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: '验证码无效或已过期' });
    }

    await pool.query('UPDATE verification_codes SET used = TRUE WHERE id = $1', [result.rows[0].id]);

    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    let user;
    if (userResult.rows.length === 0) {
      const newUser = await pool.query(
        'INSERT INTO users (email, last_login, last_seen_at, last_active_at) VALUES ($1, NOW(), NOW(), NOW()) RETURNING *',
        [email],
      );
      user = newUser.rows[0];
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

    const accessInfo = await getFeatureAccessInfo(user.id);

    res.json({
      message: '登录成功',
      token,
      user: {
        id: user.id,
        email: user.email,
        dashboardVisible: accessInfo?.dashboardVisible ?? false,
        aiChatVisible: accessInfo?.aiChatVisible ?? false,
        projectsVisible: accessInfo?.projectsVisible ?? false,
        userQueryVisible: accessInfo?.userQueryVisible ?? false,
        systemSettingsVisible: accessInfo?.systemSettingsVisible ?? false,
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

    const accessInfo = await getFeatureAccessInfo(req.userId!);

    res.json({
      message: '验证成功',
      user: {
        ...userResult.rows[0],
        dashboardVisible: accessInfo?.dashboardVisible ?? false,
        aiChatVisible: accessInfo?.aiChatVisible ?? false,
        projectsVisible: accessInfo?.projectsVisible ?? false,
        userQueryVisible: accessInfo?.userQueryVisible ?? false,
        systemSettingsVisible: accessInfo?.systemSettingsVisible ?? false,
      },
    });
  } catch (error) {
    console.error('验证失败:', error);
    res.status(500).json({ message: '验证失败，请稍后重试' });
  }
};
