import { Response } from 'express';
import type { PoolClient } from 'pg';
import pool from '../config/database';
import { PROJECT_STATUS_OPTIONS, type ProjectStatus } from '../constants/projectStatus';
import type { AuthRequest } from '../middleware/auth';
import { getFeatureAccessInfo } from '../services/systemSettingsAccess';

type ProjectPayload = {
  name: string;
  manager: string | null;
  projectStatuses: ProjectStatus[];
  coverImage: string | null;
  constructionAddress: string | null;
  projectCode: string | null;
  projectTypeId: number | null;
  constructionNatureId: number | null;
  constructionScale: string | null;
  cost: number | null;
  plannedStartDate: string | null;
  plannedCompletionDate: string | null;
  actualStartDate: string | null;
  actualCompletionDate: string | null;
};

type ProjectRow = {
  id: number;
  name: string;
  manager: string | null;
  projectStatuses: string[] | null;
  coverImage: string | null;
  constructionAddress: string | null;
  projectCode: string | null;
  projectTypeId: number | null;
  projectTypeName: string | null;
  constructionNatureId: number | null;
  constructionNatureName: string | null;
  constructionScale: string | null;
  cost: number | string | null;
  plannedStartDate: string | null;
  plannedCompletionDate: string | null;
  actualStartDate: string | null;
  actualCompletionDate: string | null;
  unitId: number | null;
  unitName: string | null;
  unitNatureId: number | null;
  unitNatureName: string | null;
  website: string | null;
  introduction: string | null;
  createdAt: string;
  updatedAt: string;
};

type ProjectResponse = {
  id: number;
  name: string;
  manager: string | null;
  projectStatuses: ProjectStatus[];
  coverImage: string | null;
  constructionAddress: string | null;
  projectCode: string | null;
  projectTypeId: number | null;
  projectTypeName: string | null;
  constructionNatureId: number | null;
  constructionNatureName: string | null;
  constructionScale: string | null;
  cost: number | null;
  plannedStartDate: string | null;
  plannedCompletionDate: string | null;
  actualStartDate: string | null;
  actualCompletionDate: string | null;
  createdAt: string;
  updatedAt: string;
  units: Array<{
    unitId: number;
    unitName: string | null;
    unitNatureId: number | null;
    unitNatureName: string | null;
    website: string | null;
    introduction: string | null;
    members: Array<{
      departmentName: string | null;
      positionName: string | null;
      personName: string;
    }>;
  }>;
};

type ProjectUnitMemberRow = {
  unitId: number;
  departmentName: string | null;
  positionName: string | null;
  userName: string | null;
  userEmail: string | null;
};

type DashboardSummary = {
  totalProjects: number;
  totalCost: number;
  unitCount: number;
  upcomingStartCount: number;
  upcomingCompletionCount: number;
  actualStartedCount: number;
  actualCompletedCount: number;
  averageCost: number;
  statusCounts: Array<{ status: ProjectStatus; count: number }>;
};

function normalizeRequiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function parsePositiveInt(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const intValue = Math.trunc(parsed);
  return intValue > 0 ? intValue : null;
}

function parseOptionalInt(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return parsePositiveInt(value);
}

function parseDateString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const parsed = new Date(`${trimmed}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : trimmed;
}

function parseOptionalDate(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return parseDateString(value);
}

function parseOptionalCost(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Number(parsed.toFixed(2));
}

function parseProjectStatuses(value: unknown): ProjectStatus[] | null {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const seen = new Set<ProjectStatus>();
  const results: ProjectStatus[] = [];

  for (const item of value) {
    if (typeof item !== 'string') {
      return null;
    }

    const trimmed = item.trim() as ProjectStatus;
    if (!PROJECT_STATUS_OPTIONS.includes(trimmed)) {
      return null;
    }

    if (seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    results.push(trimmed);
  }

  return results;
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === '23505');
}

function validateProjectPayload(body: unknown): { data?: ProjectPayload; message?: string } {
  if (!body || typeof body !== 'object') {
    return { message: '项目数据无效' };
  }

  const payload = body as Record<string, unknown>;
  const name = normalizeRequiredString(payload.name);
  const manager = normalizeOptionalString(payload.manager);
  const projectStatuses = parseProjectStatuses(payload.projectStatuses);
  const coverImage = normalizeOptionalString(payload.coverImage);
  const constructionAddress = normalizeOptionalString(payload.constructionAddress);
  const projectCode = normalizeOptionalString(payload.projectCode);
  const projectTypeId = parseOptionalInt(payload.projectTypeId);
  const constructionNatureId = parseOptionalInt(payload.constructionNatureId);
  const constructionScale = normalizeOptionalString(payload.constructionScale);
  const cost = parseOptionalCost(payload.cost);
  const plannedStartDate = parseOptionalDate(payload.plannedStartDate);
  const plannedCompletionDate = parseOptionalDate(payload.plannedCompletionDate);
  const actualStartDate = parseOptionalDate(payload.actualStartDate);
  const actualCompletionDate = parseOptionalDate(payload.actualCompletionDate);

  if (!name) {
    return { message: '请输入项目名称' };
  }
  if (projectStatuses === null) {
    return { message: '项目状态无效' };
  }
  if (payload.projectTypeId !== undefined && payload.projectTypeId !== null && !projectTypeId) {
    return { message: '请选择有效的项目类型' };
  }
  if (payload.constructionNatureId !== undefined && payload.constructionNatureId !== null && !constructionNatureId) {
    return { message: '请选择有效的建设性质' };
  }
  if (payload.cost !== undefined && payload.cost !== null && payload.cost !== '' && cost === null) {
    return { message: '请输入有效的工程造价' };
  }
  if (payload.plannedStartDate && !plannedStartDate) {
    return { message: '计划开工日期无效' };
  }
  if (payload.plannedCompletionDate && !plannedCompletionDate) {
    return { message: '计划竣工日期无效' };
  }
  if (
    plannedStartDate &&
    plannedCompletionDate &&
    new Date(`${plannedCompletionDate}T00:00:00`).getTime() < new Date(`${plannedStartDate}T00:00:00`).getTime()
  ) {
    return { message: '计划竣工日期不能早于计划开工日期' };
  }
  if (payload.actualStartDate && !actualStartDate) {
    return { message: '实际开工日期无效' };
  }
  if (payload.actualCompletionDate && !actualCompletionDate) {
    return { message: '实际竣工日期无效' };
  }
  if (
    actualStartDate &&
    actualCompletionDate &&
    new Date(`${actualCompletionDate}T00:00:00`).getTime() < new Date(`${actualStartDate}T00:00:00`).getTime()
  ) {
    return { message: '实际竣工日期不能早于实际开工日期' };
  }

  return {
    data: {
      name,
      manager,
      projectStatuses,
      coverImage,
      constructionAddress,
      projectCode,
      projectTypeId,
      constructionNatureId,
      constructionScale,
      cost,
      plannedStartDate,
      plannedCompletionDate,
      actualStartDate,
      actualCompletionDate,
    },
  };
}
async function ensureExistingIds(
  client: PoolClient,
  tableName: 'project_types' | 'construction_natures' | 'org_units',
  ids: number[],
) {
  if (ids.length === 0) {
    return true;
  }

  const result = await client.query(`SELECT id FROM ${tableName} WHERE id = ANY($1::int[])`, [ids]);
  return result.rows.length === ids.length;
}

const projectSelectSql = `
  p.id,
  p.name,
  p.manager,
  COALESCE(p.project_statuses, ARRAY[]::text[]) as "projectStatuses",
  p.cover_image as "coverImage",
  p.construction_address as "constructionAddress",
  p.project_code as "projectCode",
  p.project_type_id as "projectTypeId",
  pt.name as "projectTypeName",
  p.construction_nature_id as "constructionNatureId",
  cn.name as "constructionNatureName",
  p.construction_scale as "constructionScale",
  p.cost::float8 as cost,
  p.planned_start_date::text as "plannedStartDate",
  p.planned_completion_date::text as "plannedCompletionDate",
  p.actual_start_date::text as "actualStartDate",
  p.actual_completion_date::text as "actualCompletionDate",
  pu.unit_id as "unitId",
  ou.name as "unitName",
  ou.unit_nature_id as "unitNatureId",
  oun.name as "unitNatureName",
  pu.website,
  pu.introduction,
  p.created_at as "createdAt",
  p.updated_at as "updatedAt"
`;

const projectJoinSql = `
  FROM projects p
  LEFT JOIN project_types pt ON pt.id = p.project_type_id
  LEFT JOIN construction_natures cn ON cn.id = p.construction_nature_id
  LEFT JOIN project_units pu ON pu.project_id = p.id
  LEFT JOIN org_units ou ON ou.id = pu.unit_id
  LEFT JOIN org_unit_natures oun ON oun.id = ou.unit_nature_id
`;

function mapProjectRows(rows: ProjectRow[]): ProjectResponse[] {
  const projects = new Map<number, ProjectResponse>();

  for (const row of rows) {
    if (!projects.has(row.id)) {
      projects.set(row.id, {
        id: row.id,
        name: row.name,
        manager: row.manager,
        projectStatuses: ((row.projectStatuses ?? []).filter((item): item is ProjectStatus =>
          PROJECT_STATUS_OPTIONS.includes(item as ProjectStatus),
        ) as ProjectStatus[]),
        coverImage: row.coverImage,
        constructionAddress: row.constructionAddress,
        projectCode: row.projectCode,
        projectTypeId: row.projectTypeId,
        projectTypeName: row.projectTypeName,
        constructionNatureId: row.constructionNatureId,
        constructionNatureName: row.constructionNatureName,
        constructionScale: row.constructionScale,
        cost: row.cost === null ? null : Number(row.cost),
        plannedStartDate: row.plannedStartDate,
        plannedCompletionDate: row.plannedCompletionDate,
        actualStartDate: row.actualStartDate,
        actualCompletionDate: row.actualCompletionDate,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        units: [],
      });
    }

    if (row.unitId) {
      projects.get(row.id)?.units.push({
        unitId: row.unitId,
        unitName: row.unitName,
        unitNatureId: row.unitNatureId,
        unitNatureName: row.unitNatureName,
        website: row.website,
        introduction: row.introduction,
        members: [],
      });
    }
  }

  return Array.from(projects.values());
}

async function attachUnitMembers(projects: ProjectResponse[]) {
  const unitIds = Array.from(
    new Set(
      projects.flatMap((project) =>
        project.units.map((unit) => unit.unitId).filter((unitId): unitId is number => typeof unitId === 'number'),
      ),
    ),
  );

  if (unitIds.length === 0) {
    return projects;
  }

  const result = await pool.query<ProjectUnitMemberRow>(
    `SELECT
       d.unit_id as "unitId",
       d.name as "departmentName",
       p.name as "positionName",
       u.name as "userName",
       u.email as "userEmail"
     FROM org_departments d
     LEFT JOIN org_positions p ON p.department_id = d.id
     LEFT JOIN user_org_positions uop ON uop.position_id = p.id
     LEFT JOIN users u ON u.id = uop.user_id
     WHERE d.unit_id = ANY($1::int[])
     ORDER BY
       d.sort_order ASC,
       d.id ASC,
       p.sort_order ASC NULLS LAST,
       p.id ASC NULLS LAST,
       COALESCE(NULLIF(u.name, ''), u.email, '') ASC,
       u.id ASC NULLS LAST`,
    [unitIds],
  );

  const membersByUnitId = new Map<number, ProjectResponse['units'][number]['members']>();
  for (const row of result.rows) {
    const currentMembers = membersByUnitId.get(row.unitId) ?? [];
    currentMembers.push({
      departmentName: row.departmentName,
      positionName: row.positionName,
      personName: row.userName?.trim() || row.userEmail || '-',
    });
    membersByUnitId.set(row.unitId, currentMembers);
  }

  for (const project of projects) {
    project.units = project.units.map((unit) => ({
      ...unit,
      members: typeof unit.unitId === 'number' ? membersByUnitId.get(unit.unitId) ?? [] : [],
    }));
  }

  return projects;
}

function buildProjectScopeConditions(unitId: number | null, isSystemAdmin: boolean, alias = 'p') {
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (!isSystemAdmin) {
    if (!unitId) {
      conditions.push('1 = 0');
    } else {
      params.push(unitId);
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM project_units project_scope
          WHERE project_scope.project_id = ${alias}.id
            AND project_scope.unit_id = $${params.length}
        )
      `);
    }
  }

  return { params, conditions };
}

async function fetchProjects(projectId?: number, unitId?: number | null, isSystemAdmin = false) {
  const { params, conditions } = buildProjectScopeConditions(unitId ?? null, isSystemAdmin);

  if (projectId !== undefined) {
    params.push(projectId);
    conditions.push(`p.id = $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query<ProjectRow>(
    `SELECT ${projectSelectSql}
     ${projectJoinSql}
     ${whereClause}
     ORDER BY p.updated_at DESC, p.id DESC, pu.id ASC`,
    params,
  );

  const projects = mapProjectRows(result.rows);
  return attachUnitMembers(projects);
}

async function fetchDashboardSummary(unitId?: number | null, isSystemAdmin = false): Promise<DashboardSummary> {
  const { params, conditions } = buildProjectScopeConditions(unitId ?? null, isSystemAdmin);
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const summaryResult = await pool.query<{
    totalProjects: string;
    totalCost: number | string | null;
    unitCount: string;
    upcomingStartCount: string;
    upcomingCompletionCount: string;
    actualStartedCount: string;
    actualCompletedCount: string;
  }>(
    `WITH scoped_projects AS (
       SELECT DISTINCT
         p.id,
         p.cost,
         p.planned_start_date,
         p.planned_completion_date,
         p.actual_start_date,
         p.actual_completion_date,
         COALESCE(p.project_statuses, ARRAY[]::text[]) as project_statuses
       FROM projects p
       ${whereClause}
     )
     SELECT
       COUNT(*)::text as "totalProjects",
       COALESCE(SUM(cost), 0)::float8 as "totalCost",
       (
         SELECT COUNT(DISTINCT pu.unit_id)::text
         FROM project_units pu
         INNER JOIN scoped_projects sp ON sp.id = pu.project_id
       ) as "unitCount",
       COUNT(*) FILTER (
         WHERE planned_start_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
       )::text as "upcomingStartCount",
       COUNT(*) FILTER (
         WHERE planned_completion_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
       )::text as "upcomingCompletionCount",
       COUNT(*) FILTER (WHERE actual_start_date IS NOT NULL)::text as "actualStartedCount",
       COUNT(*) FILTER (WHERE actual_completion_date IS NOT NULL)::text as "actualCompletedCount"
     FROM scoped_projects`,
    params,
  );

  const statusResult = await pool.query<{ status: string; count: string }>(
    `WITH scoped_projects AS (
       SELECT DISTINCT
         p.id,
         COALESCE(p.project_statuses, ARRAY[]::text[]) as project_statuses
       FROM projects p
       ${whereClause}
     )
     SELECT status_item as status, COUNT(*)::text as count
     FROM scoped_projects sp
     CROSS JOIN LATERAL unnest(sp.project_statuses) as status_item
     GROUP BY status_item`,
    params,
  );

  const row = summaryResult.rows[0] ?? {
    totalProjects: '0',
    totalCost: 0,
    unitCount: '0',
    upcomingStartCount: '0',
    upcomingCompletionCount: '0',
    actualStartedCount: '0',
    actualCompletedCount: '0',
  };

  const totalProjects = Number(row.totalProjects ?? '0');
  const totalCost = row.totalCost === null ? 0 : Number(row.totalCost);
  const statusCountMap = new Map<string, number>(
    statusResult.rows.map((item) => [item.status, Number(item.count ?? '0')]),
  );

  return {
    totalProjects,
    totalCost,
    unitCount: Number(row.unitCount ?? '0'),
    upcomingStartCount: Number(row.upcomingStartCount ?? '0'),
    upcomingCompletionCount: Number(row.upcomingCompletionCount ?? '0'),
    actualStartedCount: Number(row.actualStartedCount ?? '0'),
    actualCompletedCount: Number(row.actualCompletedCount ?? '0'),
    averageCost: totalProjects > 0 ? Number((totalCost / totalProjects).toFixed(2)) : 0,
    statusCounts: PROJECT_STATUS_OPTIONS.map((status) => ({
      status,
      count: statusCountMap.get(status) ?? 0,
    })),
  };
}

async function projectBelongsToUnit(client: PoolClient, projectId: number, unitId: number) {
  const result = await client.query('SELECT 1 FROM project_units WHERE project_id = $1 AND unit_id = $2 LIMIT 1', [
    projectId,
    unitId,
  ]);

  return result.rows.length > 0;
}

export const listProjects = async (req: AuthRequest, res: Response) => {
  try {
    const accessInfo = req.userId ? await getFeatureAccessInfo(req.userId) : null;
    const projects = await fetchProjects(undefined, accessInfo?.unitId ?? null, accessInfo?.isSystemAdmin === true);
    res.json({ projects });
  } catch (error) {
    console.error('鍔犺浇椤圭洰鍒楄〃澶辫触:', error);
    res.status(500).json({ message: '鍔犺浇椤圭洰鍒楄〃澶辫触' });
  }
};

export const getProjectDashboardSummary = async (req: AuthRequest, res: Response) => {
  try {
    const accessInfo = req.userId ? await getFeatureAccessInfo(req.userId) : null;
    const summary = await fetchDashboardSummary(accessInfo?.unitId ?? null, accessInfo?.isSystemAdmin === true);
    res.json({ summary });
  } catch (error) {
    console.error('加载工作台项目统计失败:', error);
    res.status(500).json({ message: '加载工作台项目统计失败' });
  }
};

export const createProject = async (req: AuthRequest, res: Response) => {
  const parsed = validateProjectPayload(req.body);
  if (!parsed.data) {
    return res.status(400).json({ message: parsed.message });
  }

  const accessInfo = req.userId ? await getFeatureAccessInfo(req.userId) : null;
  if (!accessInfo?.projectCreateAllowed) {
    return res.status(403).json({ message: '你没有新增项目的权限，请联系管理员。' });
  }

  const client = await pool.connect();

  try {
    const payload = parsed.data;

    if (!accessInfo.isSystemAdmin && !accessInfo.unitId) {
      return res.status(403).json({ message: '当前用户未配置单位，无法新增项目' });
    }

    await client.query('BEGIN');

    const [projectTypeExists, constructionNatureExists] = await Promise.all([
      ensureExistingIds(client, 'project_types', payload.projectTypeId ? [payload.projectTypeId] : []),
      ensureExistingIds(
        client,
        'construction_natures',
        payload.constructionNatureId ? [payload.constructionNatureId] : [],
      ),
    ]);

    if (!projectTypeExists) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: '项目类型不存在' });
    }
    if (!constructionNatureExists) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: '建设性质不存在' });
    }

    const result = await client.query<{ id: number }>(
      `INSERT INTO projects (
         name,
         manager,
         project_statuses,
         cover_image,
         construction_address,
         project_code,
         project_type_id,
         construction_nature_id,
         construction_scale,
         cost,
         planned_start_date,
         planned_completion_date,
         actual_start_date,
         actual_completion_date,
         created_by
       ) VALUES ($1, $2, $3::text[], $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id`,
      [
        payload.name,
        payload.manager,
        payload.projectStatuses,
        payload.coverImage,
        payload.constructionAddress,
        payload.projectCode,
        payload.projectTypeId,
        payload.constructionNatureId,
        payload.constructionScale,
        payload.cost,
        payload.plannedStartDate,
        payload.plannedCompletionDate,
        payload.actualStartDate,
        payload.actualCompletionDate,
        req.userId ?? null,
      ],
    );

    const projectId = result.rows[0].id;
    if (!accessInfo.isSystemAdmin && accessInfo.unitId) {
      await client.query(
        `INSERT INTO project_units (project_id, unit_id, website, introduction)
         VALUES ($1, $2, NULL, NULL)
         ON CONFLICT (project_id, unit_id) DO NOTHING`,
        [projectId, accessInfo.unitId],
      );
    }

    await client.query('COMMIT');

    const [project] = await fetchProjects(projectId, accessInfo.unitId, accessInfo.isSystemAdmin);
    res.status(201).json({ project });
  } catch (error) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: '项目编号已存在' });
    }

    console.error('创建项目失败:', error);
    res.status(500).json({ message: '创建项目失败' });
  } finally {
    client.release();
  }
};
export const updateProject = async (req: AuthRequest, res: Response) => {
  const projectId = parsePositiveInt(req.params.projectId);
  if (!projectId) {
    return res.status(400).json({ message: '无效项目' });
  }

  const parsed = validateProjectPayload(req.body);
  if (!parsed.data) {
    return res.status(400).json({ message: parsed.message });
  }

  const accessInfo = req.userId ? await getFeatureAccessInfo(req.userId) : null;
  if (!accessInfo?.projectEditAllowed) {
    return res.status(403).json({ message: '你没有编辑项目的权限，请联系管理员。' });
  }

  const client = await pool.connect();

  try {
    const payload = parsed.data;

    await client.query('BEGIN');

    const existingProject = await client.query('SELECT id FROM projects WHERE id = $1', [projectId]);
    if (existingProject.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: '项目不存在' });
    }

    if (!accessInfo.isSystemAdmin) {
      if (!accessInfo.unitId) {
        await client.query('ROLLBACK');
        return res.status(403).json({ message: '当前用户未配置单位，无法编辑项目' });
      }

      const inScope = await projectBelongsToUnit(client, projectId, accessInfo.unitId);
      if (!inScope) {
        await client.query('ROLLBACK');
        return res.status(403).json({ message: '你没有编辑该项目的权限，请联系管理员。' });
      }
    }

    const [projectTypeExists, constructionNatureExists] = await Promise.all([
      ensureExistingIds(client, 'project_types', payload.projectTypeId ? [payload.projectTypeId] : []),
      ensureExistingIds(
        client,
        'construction_natures',
        payload.constructionNatureId ? [payload.constructionNatureId] : [],
      ),
    ]);

    if (!projectTypeExists) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: '项目类型不存在' });
    }
    if (!constructionNatureExists) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: '建设性质不存在' });
    }

    await client.query(
      `UPDATE projects
       SET
         name = $1,
         manager = $2,
         project_statuses = $3::text[],
         cover_image = $4,
         construction_address = $5,
         project_code = $6,
         project_type_id = $7,
         construction_nature_id = $8,
         construction_scale = $9,
         cost = $10,
         planned_start_date = $11,
         planned_completion_date = $12,
         actual_start_date = $13,
         actual_completion_date = $14,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $15`,
      [
        payload.name,
        payload.manager,
        payload.projectStatuses,
        payload.coverImage,
        payload.constructionAddress,
        payload.projectCode,
        payload.projectTypeId,
        payload.constructionNatureId,
        payload.constructionScale,
        payload.cost,
        payload.plannedStartDate,
        payload.plannedCompletionDate,
        payload.actualStartDate,
        payload.actualCompletionDate,
        projectId,
      ],
    );

    await client.query('COMMIT');

    const [project] = await fetchProjects(projectId, accessInfo.unitId, accessInfo.isSystemAdmin);
    res.json({ project });
  } catch (error) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: '项目编号已存在' });
    }

    console.error('更新项目失败:', error);
    res.status(500).json({ message: '更新项目失败' });
  } finally {
    client.release();
  }
};
export const deleteProject = async (req: AuthRequest, res: Response) => {
  const projectId = parsePositiveInt(req.params.projectId);
  if (!projectId) {
    return res.status(400).json({ message: '无效项目' });
  }

  try {
    const accessInfo = req.userId ? await getFeatureAccessInfo(req.userId) : null;
    if (!accessInfo?.projectDeleteAllowed) {
      return res.status(403).json({ message: '你没有删除项目的权限，请联系管理员。' });
    }

    if (!accessInfo.isSystemAdmin) {
      if (!accessInfo.unitId) {
        return res.status(403).json({ message: '当前用户未配置单位，无法删除项目' });
      }

      const scopedResult = await pool.query('SELECT 1 FROM project_units WHERE project_id = $1 AND unit_id = $2 LIMIT 1', [
        projectId,
        accessInfo.unitId,
      ]);
      if (scopedResult.rows.length === 0) {
        return res.status(403).json({ message: '你没有删除该项目的权限，请联系管理员。' });
      }
    }

    const result = await pool.query('DELETE FROM projects WHERE id = $1 RETURNING id', [projectId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: '项目不存在' });
    }

    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('删除项目失败:', error);
    res.status(500).json({ message: '删除项目失败' });
  }
};


