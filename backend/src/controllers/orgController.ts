import { Request, Response } from 'express';
import pool from '../config/database';

function parseRequiredInt(value: any): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const asInt = Math.trunc(parsed);
  return asInt > 0 ? asInt : null;
}

function normalizeName(value: any): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isUniqueViolation(error: any): boolean {
  // Postgres error code: unique_violation
  return Boolean(error && typeof error === 'object' && (error as any).code === '23505');
}

export const getOrgStructure = async (req: Request, res: Response) => {
  try {
    const [unitsResult, departmentsResult, positionsResult] = await Promise.all([
      pool.query('SELECT id, name FROM org_units ORDER BY sort_order ASC, id ASC'),
      pool.query(
        'SELECT id, unit_id as "unitId", name FROM org_departments ORDER BY sort_order ASC, id ASC'
      ),
      pool.query(
        'SELECT id, department_id as "departmentId", name FROM org_positions ORDER BY sort_order ASC, id ASC'
      ),
    ]);

    res.json({
      units: unitsResult.rows,
      departments: departmentsResult.rows,
      positions: positionsResult.rows,
    });
  } catch (error) {
    console.error('获取单位配置失败:', error);
    res.status(500).json({ message: '获取单位配置失败' });
  }
};

export const createUnit = async (req: Request, res: Response) => {
  try {
    const name = normalizeName(req.body?.name);
    if (!name) {
      return res.status(400).json({ message: '请输入单位名称' });
    }

    const result = await pool.query(
      'INSERT INTO org_units (name) VALUES ($1) RETURNING id, name',
      [name]
    );

    res.status(201).json({ unit: result.rows[0] });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: '单位名称已存在' });
    }
    console.error('创建单位失败:', error);
    res.status(500).json({ message: '创建单位失败' });
  }
};

export const createDepartment = async (req: Request, res: Response) => {
  try {
    const unitId = parseRequiredInt(req.body?.unitId);
    const name = normalizeName(req.body?.name);

    if (!unitId) {
      return res.status(400).json({ message: '请选择单位' });
    }
    if (!name) {
      return res.status(400).json({ message: '请输入部门名称' });
    }

    const result = await pool.query(
      'INSERT INTO org_departments (unit_id, name) VALUES ($1, $2) RETURNING id, unit_id as "unitId", name',
      [unitId, name]
    );

    res.status(201).json({ department: result.rows[0] });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: '该单位下部门名称已存在' });
    }
    console.error('创建部门失败:', error);
    res.status(500).json({ message: '创建部门失败' });
  }
};

export const createPosition = async (req: Request, res: Response) => {
  try {
    const departmentId = parseRequiredInt(req.body?.departmentId);
    const name = normalizeName(req.body?.name);

    if (!departmentId) {
      return res.status(400).json({ message: '请选择部门' });
    }
    if (!name) {
      return res.status(400).json({ message: '请输入职位名称' });
    }

    const result = await pool.query(
      'INSERT INTO org_positions (department_id, name) VALUES ($1, $2) RETURNING id, department_id as "departmentId", name',
      [departmentId, name]
    );

    res.status(201).json({ position: result.rows[0] });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: '该部门下职位名称已存在' });
    }
    console.error('创建职位失败:', error);
    res.status(500).json({ message: '创建职位失败' });
  }
};

export const getPositionPeople = async (req: Request, res: Response) => {
  try {
    const positionId = parseRequiredInt(req.params.positionId);
    if (!positionId) {
      return res.status(400).json({ message: '无效职位' });
    }

    const result = await pool.query(
      `SELECT u.id, u.email
       FROM user_org_positions uop
       INNER JOIN users u ON u.id = uop.user_id
       WHERE uop.position_id = $1
       ORDER BY u.id ASC`,
      [positionId]
    );

    res.json({
      people: result.rows.map((row: { id: number; email: string }) => ({
        id: row.id,
        positionId,
        name: row.email,
        email: row.email,
      })),
    });
  } catch (error) {
    console.error('获取职位人员失败:', error);
    res.status(500).json({ message: '获取职位人员失败' });
  }
};

