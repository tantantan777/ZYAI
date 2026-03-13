import { Request, Response } from 'express';
import pool from '../config/database';
import { emitOrgStructureUpdated, emitUserDirectoryUpdated, emitUserProfileUpdated } from '../services/socketServer';

type VisibilitySettings = {
  dashboardVisible: boolean;
  aiChatVisible: boolean;
  projectsVisible: boolean;
  userQueryVisible: boolean;
  systemSettingsVisible: boolean;
};

const unitNatureReturningSql = 'id, name, org_enabled as "orgEnabled"';
const visibilitySelectSql = `
  dashboard_visible as "dashboardVisible",
  ai_chat_visible as "aiChatVisible",
  projects_visible as "projectsVisible",
  user_query_visible as "userQueryVisible",
  system_settings_visible as "systemSettingsVisible"
`;

const userVisibilitySelectSql = `
  u.dashboard_visible as "dashboardVisible",
  u.ai_chat_visible as "aiChatVisible",
  u.projects_visible as "projectsVisible",
  u.user_query_visible as "userQueryVisible",
  u.system_settings_visible as "systemSettingsVisible"
`;

const unitReturningSql = `id, unit_nature_id as "unitNatureId", name, ${visibilitySelectSql}`;
const departmentReturningSql = `id, unit_id as "unitId", name, ${visibilitySelectSql}`;
const positionReturningSql = `id, department_id as "departmentId", name, ${visibilitySelectSql}`;
const personReturningSql = `id, email, name, phone, ${visibilitySelectSql}`;
const personSelectSql = `u.id, u.email, u.name, u.phone, ${userVisibilitySelectSql}`;

function parseRequiredInt(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const asInt = Math.trunc(parsed);
  return asInt > 0 ? asInt : null;
}

function normalizeName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseRequiredBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function parsePositiveIntArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<number>();
  const result: number[] = [];

  for (const item of value) {
    const parsed = parseRequiredInt(item);
    if (!parsed || seen.has(parsed)) {
      continue;
    }
    seen.add(parsed);
    result.push(parsed);
  }

  return result;
}

function parseVisibilitySettings(value: unknown): VisibilitySettings | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const body = value as Record<string, unknown>;
  const dashboardVisible = parseRequiredBoolean(body.dashboardVisible);
  const aiChatVisible = parseRequiredBoolean(body.aiChatVisible);
  const projectsVisible = parseRequiredBoolean(body.projectsVisible);
  const userQueryVisible = parseRequiredBoolean(body.userQueryVisible);
  const systemSettingsVisible = parseRequiredBoolean(body.systemSettingsVisible);

  if (
    dashboardVisible === null ||
    aiChatVisible === null ||
    projectsVisible === null ||
    userQueryVisible === null ||
    systemSettingsVisible === null
  ) {
    return null;
  }

  return {
    dashboardVisible,
    aiChatVisible,
    projectsVisible,
    userQueryVisible,
    systemSettingsVisible,
  };
}

function getVisibilityValues(settings: VisibilitySettings) {
  return [
    settings.dashboardVisible,
    settings.aiChatVisible,
    settings.projectsVisible,
    settings.userQueryVisible,
    settings.systemSettingsVisible,
  ];
}

function normalizeVisibilitySettings(row: Partial<VisibilitySettings>): VisibilitySettings {
  return {
    dashboardVisible: row.dashboardVisible !== false,
    aiChatVisible: row.aiChatVisible !== false,
    projectsVisible: row.projectsVisible !== false,
    userQueryVisible: row.userQueryVisible !== false,
    systemSettingsVisible: row.systemSettingsVisible !== false,
  };
}

function mapPersonRow(
  row: {
    id: number;
    email: string;
    name: string | null;
    phone: string | null;
  } & Partial<VisibilitySettings>,
  positionId: number | null,
) {
  return {
    id: row.id,
    positionId,
    name: row.name || row.email,
    email: row.email,
    phone: row.phone || undefined,
    ...normalizeVisibilitySettings(row),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === '23505');
}

async function findAffectedUserIdsByUnit(unitId: number) {
  const result = await pool.query(
    `SELECT DISTINCT uop.user_id as "userId"
     FROM user_org_positions uop
     INNER JOIN org_positions p ON p.id = uop.position_id
     INNER JOIN org_departments d ON d.id = p.department_id
     WHERE d.unit_id = $1`,
    [unitId],
  );

  return result.rows.map((row: { userId: number }) => row.userId);
}

async function findAffectedUserIdsByUnitNature(unitNatureId: number) {
  const result = await pool.query(
    `SELECT DISTINCT uop.user_id as "userId"
     FROM user_org_positions uop
     INNER JOIN org_positions p ON p.id = uop.position_id
     INNER JOIN org_departments d ON d.id = p.department_id
     INNER JOIN org_units un ON un.id = d.unit_id
     WHERE un.unit_nature_id = $1`,
    [unitNatureId],
  );

  return result.rows.map((row: { userId: number }) => row.userId);
}

async function findAffectedUserIdsByDepartment(departmentId: number) {
  const result = await pool.query(
    `SELECT DISTINCT uop.user_id as "userId"
     FROM user_org_positions uop
     INNER JOIN org_positions p ON p.id = uop.position_id
     WHERE p.department_id = $1`,
    [departmentId],
  );

  return result.rows.map((row: { userId: number }) => row.userId);
}

async function findAffectedUserIdsByPosition(positionId: number) {
  const result = await pool.query(
    'SELECT user_id as "userId" FROM user_org_positions WHERE position_id = $1',
    [positionId],
  );

  return result.rows.map((row: { userId: number }) => row.userId);
}

function notifyUsersProfileUpdated(userIds: number[]) {
  for (const userId of new Set(userIds)) {
    emitUserProfileUpdated(userId);
  }
}

export const getOrgStructure = async (_req: Request, res: Response) => {
  try {
    const [unitNaturesResult, unitsResult, departmentsResult, positionsResult] = await Promise.all([
      pool.query(`SELECT ${unitNatureReturningSql} FROM org_unit_natures ORDER BY sort_order ASC, id ASC`),
      pool.query(`SELECT ${unitReturningSql} FROM org_units ORDER BY sort_order ASC, id ASC`),
      pool.query(`SELECT ${departmentReturningSql} FROM org_departments ORDER BY sort_order ASC, id ASC`),
      pool.query(`SELECT ${positionReturningSql} FROM org_positions ORDER BY sort_order ASC, id ASC`),
    ]);

    res.json({
      unitNatures: unitNaturesResult.rows,
      units: unitsResult.rows,
      departments: departmentsResult.rows,
      positions: positionsResult.rows,
    });
  } catch (error) {
    console.error('获取单位配置失败:', error);
    res.status(500).json({ message: '获取单位配置失败' });
  }
};

export const createUnitNature = async (req: Request, res: Response) => {
  try {
    const name = normalizeName(req.body?.name);
    if (!name) {
      return res.status(400).json({ message: '请输入单位性质名称' });
    }

    const result = await pool.query(
      `INSERT INTO org_unit_natures (name) VALUES ($1) RETURNING ${unitNatureReturningSql}`,
      [name],
    );

    emitOrgStructureUpdated('unitNature');
    res.status(201).json({ unitNature: result.rows[0] });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: '单位性质名称已存在' });
    }
    console.error('创建单位性质失败:', error);
    res.status(500).json({ message: '创建单位性质失败' });
  }
};

export const renameUnitNature = async (req: Request, res: Response) => {
  try {
    const unitNatureId = parseRequiredInt(req.params.unitNatureId);
    const name = normalizeName(req.body?.name);

    if (!unitNatureId) {
      return res.status(400).json({ message: '无效单位性质' });
    }
    if (!name) {
      return res.status(400).json({ message: '请输入单位性质名称' });
    }

    const result = await pool.query(
      `UPDATE org_unit_natures
       SET name = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING ${unitNatureReturningSql}`,
      [name, unitNatureId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: '单位性质不存在' });
    }

    emitOrgStructureUpdated('unitNature');
    res.json({ unitNature: result.rows[0] });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: '单位性质名称已存在' });
    }
    console.error('重命名单位性质失败:', error);
    res.status(500).json({ message: '重命名单位性质失败' });
  }
};

export const deleteUnitNature = async (req: Request, res: Response) => {
  try {
    const unitNatureId = parseRequiredInt(req.params.unitNatureId);
    if (!unitNatureId) {
      return res.status(400).json({ message: '无效单位性质' });
    }

    const affectedUserIds = await findAffectedUserIdsByUnitNature(unitNatureId);
    const result = await pool.query('DELETE FROM org_unit_natures WHERE id = $1 RETURNING id', [unitNatureId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: '单位性质不存在' });
    }

    notifyUsersProfileUpdated(affectedUserIds);
    emitOrgStructureUpdated('unitNature');
    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('删除单位性质失败:', error);
    res.status(500).json({ message: '删除单位性质失败' });
  }
};

export const activateUnitNaturesForOrg = async (req: Request, res: Response) => {
  try {
    const unitNatureIds = parsePositiveIntArray(req.body?.unitNatureIds);
    if (unitNatureIds.length === 0) {
      return res.status(400).json({ message: '请选择单位性质' });
    }

    const existingResult = await pool.query(
      `SELECT ${unitNatureReturningSql}
       FROM org_unit_natures
       WHERE id = ANY($1::int[])
       ORDER BY sort_order ASC, id ASC`,
      [unitNatureIds],
    );

    if (existingResult.rows.length !== unitNatureIds.length) {
      return res.status(400).json({ message: '存在无效的单位性质' });
    }

    const updatedResult = await pool.query(
      `UPDATE org_unit_natures
       SET org_enabled = TRUE, updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($1::int[])
       RETURNING ${unitNatureReturningSql}`,
      [unitNatureIds],
    );

    emitOrgStructureUpdated('unitNature');
    res.json({ unitNatures: updatedResult.rows });
  } catch (error) {
    console.error('添加单位性质到单位管理失败:', error);
    res.status(500).json({ message: '添加单位性质失败' });
  }
};

export const createUnit = async (req: Request, res: Response) => {
  try {
    const name = normalizeName(req.body?.name);
    const unitNatureId = parseRequiredInt(req.body?.unitNatureId);
    if (!name) {
      return res.status(400).json({ message: '请输入单位名称' });
    }
    if (!unitNatureId) {
      return res.status(400).json({ message: '请选择单位性质' });
    }

    const unitNatureExists = await pool.query('SELECT id FROM org_unit_natures WHERE id = $1 LIMIT 1', [unitNatureId]);
    if (unitNatureExists.rows.length === 0) {
      return res.status(400).json({ message: '所选单位性质不存在' });
    }

    const result = await pool.query(
      `INSERT INTO org_units (unit_nature_id, name) VALUES ($1, $2) RETURNING ${unitReturningSql}`,
      [unitNatureId, name],
    );

    emitOrgStructureUpdated('unit');
    res.status(201).json({ unit: result.rows[0] });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: '单位名称已存在' });
    }
    console.error('创建单位失败:', error);
    res.status(500).json({ message: '创建单位失败' });
  }
};

export const renameUnit = async (req: Request, res: Response) => {
  try {
    const unitId = parseRequiredInt(req.params.unitId);
    const name = normalizeName(req.body?.name);

    if (!unitId) {
      return res.status(400).json({ message: '无效单位' });
    }
    if (!name) {
      return res.status(400).json({ message: '请输入单位名称' });
    }

    const affectedUserIds = await findAffectedUserIdsByUnit(unitId);
    const result = await pool.query(
      `UPDATE org_units
       SET name = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING ${unitReturningSql}`,
      [name, unitId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: '单位不存在' });
    }

    notifyUsersProfileUpdated(affectedUserIds);
    emitOrgStructureUpdated('unit');
    res.json({ unit: result.rows[0] });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: '单位名称已存在' });
    }
    console.error('重命名单位失败:', error);
    res.status(500).json({ message: '重命名单位失败' });
  }
};

export const deleteUnit = async (req: Request, res: Response) => {
  try {
    const unitId = parseRequiredInt(req.params.unitId);
    if (!unitId) {
      return res.status(400).json({ message: '无效单位' });
    }

    const affectedUserIds = await findAffectedUserIdsByUnit(unitId);
    const result = await pool.query('DELETE FROM org_units WHERE id = $1 RETURNING id', [unitId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: '单位不存在' });
    }

    notifyUsersProfileUpdated(affectedUserIds);
    emitOrgStructureUpdated('unit');
    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('删除单位失败:', error);
    res.status(500).json({ message: '删除单位失败' });
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
      `INSERT INTO org_departments (unit_id, name) VALUES ($1, $2) RETURNING ${departmentReturningSql}`,
      [unitId, name],
    );

    emitOrgStructureUpdated('department');
    res.status(201).json({ department: result.rows[0] });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: '该单位下部门名称已存在' });
    }
    console.error('创建部门失败:', error);
    res.status(500).json({ message: '创建部门失败' });
  }
};

export const renameDepartment = async (req: Request, res: Response) => {
  try {
    const departmentId = parseRequiredInt(req.params.departmentId);
    const name = normalizeName(req.body?.name);

    if (!departmentId) {
      return res.status(400).json({ message: '无效部门' });
    }
    if (!name) {
      return res.status(400).json({ message: '请输入部门名称' });
    }

    const affectedUserIds = await findAffectedUserIdsByDepartment(departmentId);
    const result = await pool.query(
      `UPDATE org_departments
       SET name = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING ${departmentReturningSql}`,
      [name, departmentId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: '部门不存在' });
    }

    notifyUsersProfileUpdated(affectedUserIds);
    emitOrgStructureUpdated('department');
    res.json({ department: result.rows[0] });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: '该单位下部门名称已存在' });
    }
    console.error('重命名部门失败:', error);
    res.status(500).json({ message: '重命名部门失败' });
  }
};

export const deleteDepartment = async (req: Request, res: Response) => {
  try {
    const departmentId = parseRequiredInt(req.params.departmentId);
    if (!departmentId) {
      return res.status(400).json({ message: '无效部门' });
    }

    const affectedUserIds = await findAffectedUserIdsByDepartment(departmentId);
    const result = await pool.query('DELETE FROM org_departments WHERE id = $1 RETURNING id', [departmentId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: '部门不存在' });
    }

    notifyUsersProfileUpdated(affectedUserIds);
    emitOrgStructureUpdated('department');
    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('删除部门失败:', error);
    res.status(500).json({ message: '删除部门失败' });
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
      `INSERT INTO org_positions (department_id, name) VALUES ($1, $2) RETURNING ${positionReturningSql}`,
      [departmentId, name],
    );

    emitOrgStructureUpdated('position');
    res.status(201).json({ position: result.rows[0] });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: '该部门下职位名称已存在' });
    }
    console.error('创建职位失败:', error);
    res.status(500).json({ message: '创建职位失败' });
  }
};

export const renamePosition = async (req: Request, res: Response) => {
  try {
    const positionId = parseRequiredInt(req.params.positionId);
    const name = normalizeName(req.body?.name);

    if (!positionId) {
      return res.status(400).json({ message: '无效职位' });
    }
    if (!name) {
      return res.status(400).json({ message: '请输入职位名称' });
    }

    const affectedUserIds = await findAffectedUserIdsByPosition(positionId);
    const result = await pool.query(
      `UPDATE org_positions
       SET name = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING ${positionReturningSql}`,
      [name, positionId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: '职位不存在' });
    }

    notifyUsersProfileUpdated(affectedUserIds);
    emitOrgStructureUpdated('position');
    res.json({ position: result.rows[0] });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: '该部门下职位名称已存在' });
    }
    console.error('重命名职位失败:', error);
    res.status(500).json({ message: '重命名职位失败' });
  }
};

export const deletePosition = async (req: Request, res: Response) => {
  try {
    const positionId = parseRequiredInt(req.params.positionId);
    if (!positionId) {
      return res.status(400).json({ message: '无效职位' });
    }

    const affectedUserIds = await findAffectedUserIdsByPosition(positionId);
    const result = await pool.query('DELETE FROM org_positions WHERE id = $1 RETURNING id', [positionId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: '职位不存在' });
    }

    notifyUsersProfileUpdated(affectedUserIds);
    emitOrgStructureUpdated('position');
    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('删除职位失败:', error);
    res.status(500).json({ message: '删除职位失败' });
  }
};

export const getPositionPeople = async (req: Request, res: Response) => {
  try {
    const positionId = parseRequiredInt(req.params.positionId);
    if (!positionId) {
      return res.status(400).json({ message: '无效职位' });
    }

    const result = await pool.query(
      `SELECT ${personSelectSql}
       FROM user_org_positions uop
       INNER JOIN users u ON u.id = uop.user_id
       WHERE uop.position_id = $1
       ORDER BY u.id ASC`,
      [positionId],
    );

    res.json({
      people: result.rows.map((row: any) => mapPersonRow(row, positionId)),
    });
  } catch (error) {
    console.error('获取职位人员失败:', error);
    res.status(500).json({ message: '获取职位人员失败' });
  }
};

export const getUnassignedPeople = async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT ${personSelectSql}
       FROM users u
       LEFT JOIN user_org_positions uop ON uop.user_id = u.id
       LEFT JOIN org_positions p ON p.id = uop.position_id
       LEFT JOIN org_departments d ON d.id = p.department_id
       WHERE d.unit_id IS NULL
       ORDER BY u.id ASC`,
    );

    res.json({
      people: result.rows.map((row: any) => mapPersonRow(row, null)),
    });
  } catch (error) {
    console.error('获取未配置人员失败:', error);
    res.status(500).json({ message: '获取未配置人员失败' });
  }
};

export const updateSystemSettingsVisibility = async (req: Request, res: Response) => {
  try {
    const targetType = typeof req.params.targetType === 'string' ? req.params.targetType : '';
    const targetId = parseRequiredInt(req.params.targetId);
    const visibilitySettings = parseVisibilitySettings(req.body);

    if (!targetId) {
      return res.status(400).json({ message: '无效目标' });
    }

    if (!visibilitySettings) {
      return res.status(400).json({ message: '权限参数无效' });
    }

    const visibilityValues = getVisibilityValues(visibilitySettings);

    if (targetType === 'unit') {
      const affectedUserIds = await findAffectedUserIdsByUnit(targetId);
      const result = await pool.query(
        `UPDATE org_units
         SET
           dashboard_visible = $1,
           ai_chat_visible = $2,
           projects_visible = $3,
           user_query_visible = $4,
           system_settings_visible = $5,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $6
         RETURNING ${unitReturningSql}`,
        [...visibilityValues, targetId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: '单位不存在' });
      }

      notifyUsersProfileUpdated(affectedUserIds);
      emitOrgStructureUpdated('unit');
      res.json({ targetType, item: result.rows[0] });
      return;
    }

    if (targetType === 'department') {
      const affectedUserIds = await findAffectedUserIdsByDepartment(targetId);
      const result = await pool.query(
        `UPDATE org_departments
         SET
           dashboard_visible = $1,
           ai_chat_visible = $2,
           projects_visible = $3,
           user_query_visible = $4,
           system_settings_visible = $5,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $6
         RETURNING ${departmentReturningSql}`,
        [...visibilityValues, targetId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: '部门不存在' });
      }

      notifyUsersProfileUpdated(affectedUserIds);
      emitOrgStructureUpdated('department');
      res.json({ targetType, item: result.rows[0] });
      return;
    }

    if (targetType === 'position') {
      const affectedUserIds = await findAffectedUserIdsByPosition(targetId);
      const result = await pool.query(
        `UPDATE org_positions
         SET
           dashboard_visible = $1,
           ai_chat_visible = $2,
           projects_visible = $3,
           user_query_visible = $4,
           system_settings_visible = $5,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $6
         RETURNING ${positionReturningSql}`,
        [...visibilityValues, targetId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: '职位不存在' });
      }

      notifyUsersProfileUpdated(affectedUserIds);
      emitOrgStructureUpdated('position');
      res.json({ targetType, item: result.rows[0] });
      return;
    }

    if (targetType === 'person') {
      const result = await pool.query(
        `UPDATE users
         SET
           dashboard_visible = $1,
           ai_chat_visible = $2,
           projects_visible = $3,
           user_query_visible = $4,
           system_settings_visible = $5,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $6
         RETURNING ${personReturningSql}`,
        [...visibilityValues, targetId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: '人员不存在' });
      }

      emitUserProfileUpdated(targetId);
      emitUserDirectoryUpdated(targetId);
      res.json({
        targetType,
        item: mapPersonRow(result.rows[0], null),
      });
      return;
    }

    return res.status(400).json({ message: '不支持的权限目标' });
  } catch (error) {
    console.error('更新权限失败:', error);
    res.status(500).json({ message: '更新权限失败' });
  }
};

export const renamePerson = async (req: Request, res: Response) => {
  try {
    const userId = parseRequiredInt(req.params.userId);
    const name = normalizeName(req.body?.name);

    if (!userId) {
      return res.status(400).json({ message: '无效人员' });
    }
    if (!name) {
      return res.status(400).json({ message: '请输入人员姓名' });
    }

    const result = await pool.query(
      `UPDATE users
       SET name = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, email, name, phone`,
      [name, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: '人员不存在' });
    }

    const row = result.rows[0];
    emitUserProfileUpdated(userId);
    emitUserDirectoryUpdated(userId);
    res.json({
      person: {
        id: row.id,
        name: row.name || row.email,
        email: row.email,
        phone: row.phone || undefined,
      },
    });
  } catch (error) {
    console.error('重命名人员失败:', error);
    res.status(500).json({ message: '重命名人员失败' });
  }
};

export const removePersonFromPosition = async (req: Request, res: Response) => {
  try {
    const userId = parseRequiredInt(req.params.userId);
    const positionId = parseRequiredInt(req.params.positionId);

    if (!userId || !positionId) {
      return res.status(400).json({ message: '无效人员或职位' });
    }

    const result = await pool.query(
      'DELETE FROM user_org_positions WHERE user_id = $1 AND position_id = $2 RETURNING user_id as "userId"',
      [userId, positionId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: '人员不存在或已移除' });
    }

    emitUserProfileUpdated(userId);
    emitUserDirectoryUpdated(userId);
    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('删除人员失败:', error);
    res.status(500).json({ message: '删除人员失败' });
  }
};

export const movePersonToPosition = async (req: Request, res: Response) => {
  try {
    const userId = parseRequiredInt(req.params.userId);
    const positionId = parseRequiredInt(req.body?.positionId);

    if (!userId) {
      return res.status(400).json({ message: '无效人员' });
    }

    if (!positionId) {
      return res.status(400).json({ message: '请选择目标职位' });
    }

    const [userResult, positionResult] = await Promise.all([
      pool.query('SELECT id FROM users WHERE id = $1 LIMIT 1', [userId]),
      pool.query('SELECT id FROM org_positions WHERE id = $1 LIMIT 1', [positionId]),
    ]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: '人员不存在' });
    }

    if (positionResult.rows.length === 0) {
      return res.status(400).json({ message: '目标职位不存在' });
    }

    await pool.query(
      `INSERT INTO user_org_positions (user_id, position_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id)
       DO UPDATE SET position_id = EXCLUDED.position_id, updated_at = CURRENT_TIMESTAMP`,
      [userId, positionId],
    );

    emitUserProfileUpdated(userId);
    emitUserDirectoryUpdated(userId);
    res.json({ message: '移动成功' });
  } catch (error) {
    console.error('移动人员失败:', error);
    res.status(500).json({ message: '移动人员失败' });
  }
};
