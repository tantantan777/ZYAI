import pool from '../config/database';

export type AuditActionType = 'add' | 'edit' | 'delete';

type CreateAuditLogInput = {
  userId?: number | null;
  userName?: string | null;
  userEmail?: string | null;
  actionType: AuditActionType;
  targetType: string;
  targetName: string;
  detail?: string | null;
};

type AuditActor = {
  userId: number | null;
  userName: string | null;
  userEmail: string | null;
  unitName: string | null;
  departmentName: string | null;
  positionName: string | null;
};

async function resolveActor(userId?: number | null, userName?: string | null, userEmail?: string | null): Promise<AuditActor> {
  if (!userId) {
    return {
      userId: null,
      userName: userName?.trim() || null,
      userEmail: userEmail?.trim() || null,
      unitName: null,
      departmentName: null,
      positionName: null,
    };
  }

  const result = await pool.query<{
    name: string | null;
    email: string | null;
    unitName: string | null;
    departmentName: string | null;
    positionName: string | null;
  }>(
    `SELECT
       users.name,
       users.email,
       org_units.name AS "unitName",
       org_departments.name AS "departmentName",
       org_positions.name AS "positionName"
     FROM users
     LEFT JOIN user_org_positions ON user_org_positions.user_id = users.id
     LEFT JOIN org_positions ON org_positions.id = user_org_positions.position_id
     LEFT JOIN org_departments ON org_departments.id = org_positions.department_id
     LEFT JOIN org_units ON org_units.id = org_departments.unit_id
     WHERE users.id = $1
     LIMIT 1`,
    [userId],
  );

  if (result.rows.length === 0) {
    return {
      userId,
      userName: userName?.trim() || null,
      userEmail: userEmail?.trim() || null,
      unitName: null,
      departmentName: null,
      positionName: null,
    };
  }

  const row = result.rows[0];
  return {
    userId,
    userName: userName?.trim() || row.name?.trim() || null,
    userEmail: userEmail?.trim() || row.email?.trim() || null,
    unitName: row.unitName?.trim() || null,
    departmentName: row.departmentName?.trim() || null,
    positionName: row.positionName?.trim() || null,
  };
}

export async function createAuditLog(input: CreateAuditLogInput) {
  const actor = await resolveActor(input.userId, input.userName, input.userEmail);

  await pool.query(
    `INSERT INTO audit_logs (
       user_id,
       user_name,
       user_email,
       unit_name,
       department_name,
       position_name,
       action_type,
       target_type,
       target_name,
       detail
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      actor.userId,
      actor.userName,
      actor.userEmail,
      actor.unitName,
      actor.departmentName,
      actor.positionName,
      input.actionType,
      input.targetType.trim(),
      input.targetName.trim(),
      input.detail?.trim() || null,
    ],
  );
}

export async function createAuditLogSafe(input: CreateAuditLogInput) {
  try {
    await createAuditLog(input);
  } catch (error) {
    console.error('写入系统日志失败:', error);
  }
}

export async function listAuditLogs(limit = 200) {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.trunc(limit))) : 200;
  const result = await pool.query(
    `SELECT
       id,
       user_id AS "userId",
       user_name AS "userName",
       user_email AS "userEmail",
       unit_name AS "unitName",
       department_name AS "departmentName",
       position_name AS "positionName",
       action_type AS "actionType",
       target_type AS "targetType",
       target_name AS "targetName",
       detail,
       created_at AS "createdAt"
     FROM audit_logs
     WHERE action_type IN ('add', 'edit', 'delete')
     ORDER BY created_at DESC, id DESC
     LIMIT $1`,
    [safeLimit],
  );

  return result.rows;
}
