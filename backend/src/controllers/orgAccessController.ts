import { Request, Response } from 'express';
import pool from '../config/database';
import { emitOrgStructureUpdated, emitUserDirectoryUpdated, emitUserProfileUpdated } from '../services/socketServer';

function parseRequiredInt(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const asInt = Math.trunc(parsed);
  return asInt > 0 ? asInt : null;
}

function parseRequiredBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function parsePositiveIntArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as number[];
  }

  const ids = new Set<number>();
  for (const item of value) {
    const parsed = parseRequiredInt(item);
    if (parsed) {
      ids.add(parsed);
    }
  }

  return Array.from(ids);
}

type PositionPermissionInput = {
  businessDomainId: number;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canUpload: boolean;
};

function parsePositionPermissions(value: unknown): PositionPermissionInput[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const results: PositionPermissionInput[] = [];
  const seenDomainIds = new Set<number>();

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const record = item as Record<string, unknown>;
    const businessDomainId = parseRequiredInt(record.businessDomainId);
    const canView = parseRequiredBoolean(record.canView);
    const canCreate = parseRequiredBoolean(record.canCreate);
    const canEdit = parseRequiredBoolean(record.canEdit);
    const canDelete = parseRequiredBoolean(record.canDelete);
    const canUpload = parseRequiredBoolean(record.canUpload);

    if (
      !businessDomainId ||
      canView === null ||
      canCreate === null ||
      canEdit === null ||
      canDelete === null ||
      canUpload === null ||
      seenDomainIds.has(businessDomainId)
    ) {
      return null;
    }

    seenDomainIds.add(businessDomainId);
    results.push({
      businessDomainId,
      canView,
      canCreate,
      canEdit,
      canDelete,
      canUpload,
    });
  }

  return results;
}

async function findDepartmentUserIds(departmentId: number) {
  const result = await pool.query<{ userId: number }>(
    `SELECT DISTINCT uop.user_id as "userId"
     FROM user_org_positions uop
     INNER JOIN org_positions p ON p.id = uop.position_id
     WHERE p.department_id = $1`,
    [departmentId],
  );

  return result.rows.map((row) => row.userId);
}

async function findPositionUserIds(positionId: number) {
  const result = await pool.query<{ userId: number }>(
    'SELECT user_id as "userId" FROM user_org_positions WHERE position_id = $1',
    [positionId],
  );

  return result.rows.map((row) => row.userId);
}

async function notifyUsers(userIds: number[]) {
  const uniqueUserIds = Array.from(new Set(userIds));
  for (const userId of uniqueUserIds) {
    emitUserProfileUpdated(userId);
    emitUserDirectoryUpdated(userId);
  }
}

export const getUnitProjectAssignments = async (req: Request, res: Response) => {
  try {
    const unitId = parseRequiredInt(req.params.unitId);
    if (!unitId) {
      return res.status(400).json({ message: '无效单位' });
    }

    const [unitResult, projectResult] = await Promise.all([
      pool.query('SELECT id, name FROM org_units WHERE id = $1 LIMIT 1', [unitId]),
      pool.query<{ projectId: number }>(
        'SELECT project_id as "projectId" FROM project_units WHERE unit_id = $1 ORDER BY project_id ASC',
        [unitId],
      ),
    ]);

    if (unitResult.rows.length === 0) {
      return res.status(404).json({ message: '单位不存在' });
    }

    res.json({
      unit: unitResult.rows[0],
      projectIds: projectResult.rows.map((row) => row.projectId),
    });
  } catch (error) {
    console.error('获取单位项目分配失败:', error);
    res.status(500).json({ message: '获取单位项目分配失败' });
  }
};

export const updateUnitProjectAssignments = async (req: Request, res: Response) => {
  const unitId = parseRequiredInt(req.params.unitId);
  const projectIds = parsePositiveIntArray(req.body?.projectIds);

  if (!unitId) {
    return res.status(400).json({ message: '无效单位' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const [unitResult, projectResult] = await Promise.all([
      client.query('SELECT id FROM org_units WHERE id = $1 LIMIT 1', [unitId]),
      projectIds.length
        ? client.query('SELECT id FROM projects WHERE id = ANY($1::int[])', [projectIds])
        : Promise.resolve({ rows: [] } as { rows: Array<{ id: number }> }),
    ]);

    if (unitResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: '单位不存在' });
    }

    if (projectIds.length !== projectResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: '包含无效项目' });
    }

    await client.query('DELETE FROM project_units WHERE unit_id = $1 AND project_id <> ALL($2::int[])', [
      unitId,
      projectIds.length ? projectIds : [0],
    ]);

    if (projectIds.length === 0) {
      await client.query('DELETE FROM project_units WHERE unit_id = $1', [unitId]);
    } else {
      for (const projectId of projectIds) {
        await client.query(
          `INSERT INTO project_units (project_id, unit_id, website, introduction)
           VALUES ($1, $2, NULL, NULL)
           ON CONFLICT (project_id, unit_id) DO NOTHING`,
          [projectId, unitId],
        );
      }
    }

    await client.query('COMMIT');
    emitOrgStructureUpdated('unit');
    res.json({ unitId, projectIds });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('更新单位项目分配失败:', error);
    res.status(500).json({ message: '更新单位项目分配失败' });
  } finally {
    client.release();
  }
};

export const getDepartmentBusinessDomains = async (req: Request, res: Response) => {
  try {
    const departmentId = parseRequiredInt(req.params.departmentId);
    if (!departmentId) {
      return res.status(400).json({ message: '无效部门' });
    }

    const [departmentResult, domainResult] = await Promise.all([
      pool.query('SELECT id, name FROM org_departments WHERE id = $1 LIMIT 1', [departmentId]),
      pool.query<{ businessDomainId: number }>(
        `SELECT business_domain_id as "businessDomainId"
         FROM department_business_domains
         WHERE department_id = $1
         ORDER BY business_domain_id ASC`,
        [departmentId],
      ),
    ]);

    if (departmentResult.rows.length === 0) {
      return res.status(404).json({ message: '部门不存在' });
    }

    res.json({
      department: departmentResult.rows[0],
      businessDomainIds: domainResult.rows.map((row) => row.businessDomainId),
    });
  } catch (error) {
    console.error('获取部门业务范围失败:', error);
    res.status(500).json({ message: '获取部门业务范围失败' });
  }
};

export const updateDepartmentBusinessDomains = async (req: Request, res: Response) => {
  const departmentId = parseRequiredInt(req.params.departmentId);
  const businessDomainIds = parsePositiveIntArray(req.body?.businessDomainIds);

  if (!departmentId) {
    return res.status(400).json({ message: '无效部门' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const [departmentResult, domainResult] = await Promise.all([
      client.query('SELECT id FROM org_departments WHERE id = $1 LIMIT 1', [departmentId]),
      businessDomainIds.length
        ? client.query('SELECT id FROM business_domains WHERE id = ANY($1::int[])', [businessDomainIds])
        : Promise.resolve({ rows: [] } as { rows: Array<{ id: number }> }),
    ]);

    if (departmentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: '部门不存在' });
    }

    if (businessDomainIds.length !== domainResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: '包含无效业务范围' });
    }

    await client.query('DELETE FROM department_business_domains WHERE department_id = $1', [departmentId]);
    for (const businessDomainId of businessDomainIds) {
      await client.query(
        `INSERT INTO department_business_domains (department_id, business_domain_id)
         VALUES ($1, $2)
         ON CONFLICT (department_id, business_domain_id) DO NOTHING`,
        [departmentId, businessDomainId],
      );
    }

    await client.query(
      `DELETE FROM position_business_permissions
       WHERE business_domain_id NOT IN (
         SELECT business_domain_id
         FROM department_business_domains
         WHERE department_id = $1
       )
         AND position_id IN (
           SELECT id
           FROM org_positions
           WHERE department_id = $1
         )`,
      [departmentId],
    );

    await client.query('COMMIT');
    await notifyUsers(await findDepartmentUserIds(departmentId));
    emitOrgStructureUpdated('department');
    res.json({ departmentId, businessDomainIds });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('更新部门业务范围失败:', error);
    res.status(500).json({ message: '更新部门业务范围失败' });
  } finally {
    client.release();
  }
};

export const getPositionBusinessPermissions = async (req: Request, res: Response) => {
  try {
    const positionId = parseRequiredInt(req.params.positionId);
    if (!positionId) {
      return res.status(400).json({ message: '无效职位' });
    }

    const positionResult = await pool.query<{ id: number; name: string; departmentId: number }>(
      `SELECT id, name, department_id as "departmentId"
       FROM org_positions
       WHERE id = $1
       LIMIT 1`,
      [positionId],
    );

    if (positionResult.rows.length === 0) {
      return res.status(404).json({ message: '职位不存在' });
    }

    const position = positionResult.rows[0];
    const permissionResult = await pool.query<{
      businessDomainId: number;
      code: string;
      name: string;
      canView: boolean;
      canCreate: boolean;
      canEdit: boolean;
      canDelete: boolean;
      canUpload: boolean;
    }>(
      `SELECT
         bd.id as "businessDomainId",
         bd.code,
         bd.name,
         COALESCE(pbp.can_view, FALSE) as "canView",
         COALESCE(pbp.can_create, FALSE) as "canCreate",
         COALESCE(pbp.can_edit, FALSE) as "canEdit",
         COALESCE(pbp.can_delete, FALSE) as "canDelete",
         COALESCE(pbp.can_upload, FALSE) as "canUpload"
       FROM department_business_domains dbd
       INNER JOIN business_domains bd ON bd.id = dbd.business_domain_id
       LEFT JOIN position_business_permissions pbp
         ON pbp.position_id = $1
        AND pbp.business_domain_id = dbd.business_domain_id
       WHERE dbd.department_id = $2
       ORDER BY bd.sort_order ASC, bd.id ASC`,
      [positionId, position.departmentId],
    );

    res.json({
      position,
      permissions: permissionResult.rows,
    });
  } catch (error) {
    console.error('获取职位业务权限失败:', error);
    res.status(500).json({ message: '获取职位业务权限失败' });
  }
};

export const updatePositionBusinessPermissions = async (req: Request, res: Response) => {
  const positionId = parseRequiredInt(req.params.positionId);
  const permissions = parsePositionPermissions(req.body?.permissions);

  if (!positionId) {
    return res.status(400).json({ message: '无效职位' });
  }

  if (!permissions) {
    return res.status(400).json({ message: '职位业务权限参数无效' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const positionResult = await client.query<{ departmentId: number }>(
      `SELECT department_id as "departmentId"
       FROM org_positions
       WHERE id = $1
       LIMIT 1`,
      [positionId],
    );

    if (positionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: '职位不存在' });
    }

    const departmentId = positionResult.rows[0].departmentId;
    const businessDomainIds = permissions.map((item) => item.businessDomainId);
    const domainResult = businessDomainIds.length
      ? await client.query<{ businessDomainId: number }>(
          `SELECT business_domain_id as "businessDomainId"
           FROM department_business_domains
           WHERE department_id = $1
             AND business_domain_id = ANY($2::int[])`,
          [departmentId, businessDomainIds],
        )
      : { rows: [] };

    if (domainResult.rows.length !== businessDomainIds.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: '包含超出部门业务范围的权限项' });
    }

    await client.query('DELETE FROM position_business_permissions WHERE position_id = $1', [positionId]);
    for (const item of permissions) {
      await client.query(
        `INSERT INTO position_business_permissions (
           position_id,
           business_domain_id,
           can_view,
           can_create,
           can_edit,
           can_delete,
           can_upload
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          positionId,
          item.businessDomainId,
          item.canView,
          item.canCreate,
          item.canEdit,
          item.canDelete,
          item.canUpload,
        ],
      );
    }

    await client.query('COMMIT');
    await notifyUsers(await findPositionUserIds(positionId));
    emitOrgStructureUpdated('position');
    res.json({ positionId, permissions });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('更新职位业务权限失败:', error);
    res.status(500).json({ message: '更新职位业务权限失败' });
  } finally {
    client.release();
  }
};

export const updatePersonSystemAdmin = async (req: Request, res: Response) => {
  try {
    const userId = parseRequiredInt(req.params.userId);
    const isSystemAdmin = parseRequiredBoolean(req.body?.isSystemAdmin);

    if (!userId) {
      return res.status(400).json({ message: '无效人员' });
    }

    if (isSystemAdmin === null) {
      return res.status(400).json({ message: '系统管理员参数无效' });
    }

    if (!isSystemAdmin) {
      const adminCountResult = await pool.query<{ count: string }>(
        'SELECT COUNT(*)::text as count FROM users WHERE is_system_admin = TRUE',
      );
      const adminCount = Number(adminCountResult.rows[0]?.count ?? '0');
      const targetResult = await pool.query<{ isSystemAdmin: boolean }>(
        'SELECT is_system_admin as "isSystemAdmin" FROM users WHERE id = $1 LIMIT 1',
        [userId],
      );

      if (targetResult.rows.length === 0) {
        return res.status(404).json({ message: '人员不存在' });
      }

      if (targetResult.rows[0].isSystemAdmin && adminCount <= 1) {
        return res.status(400).json({ message: '至少需要保留一名系统管理员' });
      }
    }

    const result = await pool.query<{
      id: number;
      email: string;
      name: string | null;
      isSystemAdmin: boolean;
    }>(
      `UPDATE users
       SET is_system_admin = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, email, name, is_system_admin as "isSystemAdmin"`,
      [isSystemAdmin, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: '人员不存在' });
    }

    emitUserProfileUpdated(userId);
    emitUserDirectoryUpdated(userId);
    res.json({ person: result.rows[0] });
  } catch (error) {
    console.error('更新系统管理员设置失败:', error);
    res.status(500).json({ message: '更新系统管理员设置失败' });
  }
};
