import { Request, Response } from 'express';
import pool from '../config/database';
import { emitOrgStructureUpdated, emitUserDirectoryUpdated, emitUserProfileUpdated } from '../services/socketServer';

type VisibilitySettings = {
  dashboardVisible: boolean;
  aiChatVisible: boolean;
  projectsVisible: boolean;
  projectCreateAllowed: boolean;
  projectEditAllowed: boolean;
  projectDeleteAllowed: boolean;
  userQueryVisible: boolean;
  systemSettingsVisible: boolean;
};

const basePlatformConfigReturningSql = 'id, name';
const unitNatureReturningSql = `${basePlatformConfigReturningSql}, org_enabled as "orgEnabled"`;
const projectTypeReturningSql = basePlatformConfigReturningSql;
const constructionNatureReturningSql = basePlatformConfigReturningSql;
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
  u.project_create_allowed as "projectCreateAllowed",
  u.project_edit_allowed as "projectEditAllowed",
  u.project_delete_allowed as "projectDeleteAllowed",
  u.user_query_visible as "userQueryVisible",
  u.system_settings_visible as "systemSettingsVisible",
  u.is_system_admin as "isSystemAdmin"
`;

const unitReturningSql = `id, unit_nature_id as "unitNatureId", name, ${visibilitySelectSql}`;
const departmentReturningSql = `id, unit_id as "unitId", name, ${visibilitySelectSql}`;
const positionReturningSql = `id, department_id as "departmentId", name, ${visibilitySelectSql}`;
const personReturningSql = `id, email, name, phone,
  dashboard_visible as "dashboardVisible",
  ai_chat_visible as "aiChatVisible",
  projects_visible as "projectsVisible",
  project_create_allowed as "projectCreateAllowed",
  project_edit_allowed as "projectEditAllowed",
  project_delete_allowed as "projectDeleteAllowed",
  user_query_visible as "userQueryVisible",
  system_settings_visible as "systemSettingsVisible",
  is_system_admin as "isSystemAdmin"`;
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

type PlatformConfigTableName = 'project_types' | 'construction_natures';

async function createPlatformConfigItem(tableName: PlatformConfigTableName, name: string) {
  return pool.query(`INSERT INTO ${tableName} (name) VALUES ($1) RETURNING ${basePlatformConfigReturningSql}`, [name]);
}

async function renamePlatformConfigItem(tableName: PlatformConfigTableName, id: number, name: string) {
  return pool.query(
    `UPDATE ${tableName}
     SET name = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING ${basePlatformConfigReturningSql}`,
    [name, id],
  );
}

async function deletePlatformConfigItem(tableName: PlatformConfigTableName, id: number) {
  return pool.query(`DELETE FROM ${tableName} WHERE id = $1 RETURNING id`, [id]);
}

function parseVisibilitySettings(value: unknown): VisibilitySettings | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const body = value as Record<string, unknown>;
  const dashboardVisible = parseRequiredBoolean(body.dashboardVisible);
  const aiChatVisible = parseRequiredBoolean(body.aiChatVisible);
  const projectsVisible = parseRequiredBoolean(body.projectsVisible);
  const projectCreateAllowed = parseRequiredBoolean(body.projectCreateAllowed);
  const projectEditAllowed = parseRequiredBoolean(body.projectEditAllowed);
  const projectDeleteAllowed = parseRequiredBoolean(body.projectDeleteAllowed);
  const userQueryVisible = parseRequiredBoolean(body.userQueryVisible);
  const systemSettingsVisible = parseRequiredBoolean(body.systemSettingsVisible);

  if (
    dashboardVisible === null ||
    aiChatVisible === null ||
    projectsVisible === null ||
    projectCreateAllowed === null ||
    projectEditAllowed === null ||
    projectDeleteAllowed === null ||
    userQueryVisible === null ||
    systemSettingsVisible === null
  ) {
    return null;
  }

  return {
    dashboardVisible,
    aiChatVisible,
    projectsVisible,
    projectCreateAllowed,
    projectEditAllowed,
    projectDeleteAllowed,
    userQueryVisible,
    systemSettingsVisible,
  };
}

function getVisibilityValues(settings: VisibilitySettings) {
  return [
    settings.dashboardVisible,
    settings.aiChatVisible,
    settings.projectsVisible,
    settings.projectCreateAllowed,
    settings.projectEditAllowed,
    settings.projectDeleteAllowed,
    settings.userQueryVisible,
    settings.systemSettingsVisible,
  ];
}

function normalizeVisibilitySettings(row: Partial<VisibilitySettings>): VisibilitySettings {
  return {
    dashboardVisible: row.dashboardVisible !== false,
    aiChatVisible: row.aiChatVisible !== false,
    projectsVisible: row.projectsVisible !== false,
    projectCreateAllowed: row.projectCreateAllowed !== false,
    projectEditAllowed: row.projectEditAllowed !== false,
    projectDeleteAllowed: row.projectDeleteAllowed !== false,
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
    isSystemAdmin?: boolean;
  } & Partial<VisibilitySettings>,
  positionId: number | null,
) {
  return {
    id: row.id,
    positionId,
    name: row.name || row.email,
    email: row.email,
    phone: row.phone || undefined,
    isSystemAdmin: row.isSystemAdmin === true,
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
    const [
      unitNaturesResult,
      projectTypesResult,
      constructionNaturesResult,
      businessDomainsResult,
      unitsResult,
      departmentsResult,
      positionsResult,
    ] = await Promise.all([
      pool.query(`SELECT ${unitNatureReturningSql} FROM org_unit_natures ORDER BY sort_order ASC, id ASC`),
      pool.query(`SELECT ${projectTypeReturningSql} FROM project_types ORDER BY sort_order ASC, id ASC`),
      pool.query(`SELECT ${constructionNatureReturningSql} FROM construction_natures ORDER BY sort_order ASC, id ASC`),
      pool.query('SELECT id, code, name FROM business_domains ORDER BY sort_order ASC, id ASC'),
      pool.query(`SELECT ${unitReturningSql} FROM org_units ORDER BY sort_order ASC, id ASC`),
      pool.query(`SELECT ${departmentReturningSql} FROM org_departments ORDER BY sort_order ASC, id ASC`),
      pool.query(`SELECT ${positionReturningSql} FROM org_positions ORDER BY sort_order ASC, id ASC`),
    ]);

    res.json({
      unitNatures: unitNaturesResult.rows,
      projectTypes: projectTypesResult.rows,
      constructionNatures: constructionNaturesResult.rows,
      businessDomains: businessDomainsResult.rows,
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

export const deactivateUnitNatureForOrg = async (req: Request, res: Response) => {
  const unitNatureId = parseRequiredInt(req.params.unitNatureId);
  if (!unitNatureId) {
    return res.status(400).json({ message: '无效单位性质' });
  }

  const affectedUserIds = await findAffectedUserIdsByUnitNature(unitNatureId);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const unitNatureResult = await client.query(
      `UPDATE org_unit_natures
       SET org_enabled = FALSE, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING ${unitNatureReturningSql}`,
      [unitNatureId],
    );

    if (unitNatureResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: '单位性质不存在' });
    }

    await client.query('DELETE FROM org_units WHERE unit_nature_id = $1', [unitNatureId]);
    await client.query('COMMIT');

    notifyUsersProfileUpdated(affectedUserIds);
    emitOrgStructureUpdated('unitNature');
    res.json({ unitNature: unitNatureResult.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('从单位管理中删除单位性质失败:', error);
    res.status(500).json({ message: '从单位管理中删除单位性质失败' });
  } finally {
    client.release();
  }
};

export const createProjectType = async (req: Request, res: Response) => {
  try {
    const name = normalizeName(req.body?.name);
    if (!name) {
      return res.status(400).json({ message: '请输入项目类型名称' });
    }

    const result = await createPlatformConfigItem('project_types', name);
    emitOrgStructureUpdated('projectType');
    res.status(201).json({ projectType: result.rows[0] });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: '项目类型名称已存在' });
    }
    console.error('创建项目类型失败:', error);
    res.status(500).json({ message: '创建项目类型失败' });
  }
};

export const renameProjectType = async (req: Request, res: Response) => {
  try {
    const projectTypeId = parseRequiredInt(req.params.projectTypeId);
    const name = normalizeName(req.body?.name);

    if (!projectTypeId) {
      return res.status(400).json({ message: '无效项目类型' });
    }
    if (!name) {
      return res.status(400).json({ message: '请输入项目类型名称' });
    }

    const result = await renamePlatformConfigItem('project_types', projectTypeId, name);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: '项目类型不存在' });
    }

    emitOrgStructureUpdated('projectType');
    res.json({ projectType: result.rows[0] });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: '项目类型名称已存在' });
    }
    console.error('重命名项目类型失败:', error);
    res.status(500).json({ message: '重命名项目类型失败' });
  }
};

export const deleteProjectType = async (req: Request, res: Response) => {
  try {
    const projectTypeId = parseRequiredInt(req.params.projectTypeId);
    if (!projectTypeId) {
      return res.status(400).json({ message: '无效项目类型' });
    }

    const result = await deletePlatformConfigItem('project_types', projectTypeId);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: '项目类型不存在' });
    }

    emitOrgStructureUpdated('projectType');
    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('删除项目类型失败:', error);
    res.status(500).json({ message: '删除项目类型失败' });
  }
};

export const createConstructionNature = async (req: Request, res: Response) => {
  try {
    const name = normalizeName(req.body?.name);
    if (!name) {
      return res.status(400).json({ message: '请输入建设性质名称' });
    }

    const result = await createPlatformConfigItem('construction_natures', name);
    emitOrgStructureUpdated('constructionNature');
    res.status(201).json({ constructionNature: result.rows[0] });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: '建设性质名称已存在' });
    }
    console.error('创建建设性质失败:', error);
    res.status(500).json({ message: '创建建设性质失败' });
  }
};

export const renameConstructionNature = async (req: Request, res: Response) => {
  try {
    const constructionNatureId = parseRequiredInt(req.params.constructionNatureId);
    const name = normalizeName(req.body?.name);

    if (!constructionNatureId) {
      return res.status(400).json({ message: '无效建设性质' });
    }
    if (!name) {
      return res.status(400).json({ message: '请输入建设性质名称' });
    }

    const result = await renamePlatformConfigItem('construction_natures', constructionNatureId, name);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: '建设性质不存在' });
    }

    emitOrgStructureUpdated('constructionNature');
    res.json({ constructionNature: result.rows[0] });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: '建设性质名称已存在' });
    }
    console.error('重命名建设性质失败:', error);
    res.status(500).json({ message: '重命名建设性质失败' });
  }
};

export const deleteConstructionNature = async (req: Request, res: Response) => {
  try {
    const constructionNatureId = parseRequiredInt(req.params.constructionNatureId);
    if (!constructionNatureId) {
      return res.status(400).json({ message: '无效建设性质' });
    }

    const result = await deletePlatformConfigItem('construction_natures', constructionNatureId);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: '建设性质不存在' });
    }

    emitOrgStructureUpdated('constructionNature');
    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('删除建设性质失败:', error);
    res.status(500).json({ message: '删除建设性质失败' });
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
    const targetType = 'person';
    const targetId = parseRequiredInt(req.params.targetId);
    const visibilitySettings = parseVisibilitySettings(req.body);

    if (!targetId) {
      return res.status(400).json({ message: '无效目标' });
    }

    if (!visibilitySettings) {
      return res.status(400).json({ message: '权限参数无效' });
    }

    const visibilityValues = getVisibilityValues(visibilitySettings);
    const result = await pool.query(
      `UPDATE users
       SET
         dashboard_visible = $1,
         ai_chat_visible = $2,
         projects_visible = $3,
         project_create_allowed = $4,
         project_edit_allowed = $5,
         project_delete_allowed = $6,
         user_query_visible = $7,
         system_settings_visible = $8,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $9
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
