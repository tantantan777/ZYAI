import pool from '../config/database';

export type FeatureAccessInfo = {
  isSystemAdmin: boolean;
  unitId: number | null;
  departmentId: number | null;
  positionId: number | null;
  dashboardVisible: boolean;
  aiChatVisible: boolean;
  projectsVisible: boolean;
  projectCreateAllowed: boolean;
  projectEditAllowed: boolean;
  projectDeleteAllowed: boolean;
  projectUploadAllowed: boolean;
  userQueryVisible: boolean;
  systemSettingsVisible: boolean;
};

type FeatureAccessRow = {
  is_system_admin: boolean;
  unit_id: number | null;
  department_id: number | null;
  position_id: number | null;
  department_project_management_enabled: boolean;
  project_can_view: boolean | null;
  project_can_create: boolean | null;
  project_can_edit: boolean | null;
  project_can_delete: boolean | null;
  project_can_upload: boolean | null;
};

export const getFeatureAccessInfo = async (userId: number): Promise<FeatureAccessInfo | null> => {
  const result = await pool.query<FeatureAccessRow>(
    `SELECT
       COALESCE(u.is_system_admin, FALSE) as is_system_admin,
       un.id as unit_id,
       d.id as department_id,
       p.id as position_id,
       CASE WHEN dbd.business_domain_id IS NOT NULL THEN TRUE ELSE FALSE END as department_project_management_enabled,
       pbp.can_view as project_can_view,
       pbp.can_create as project_can_create,
       pbp.can_edit as project_can_edit,
       pbp.can_delete as project_can_delete,
       pbp.can_upload as project_can_upload
     FROM users u
     LEFT JOIN user_org_positions uop ON uop.user_id = u.id
     LEFT JOIN org_positions p ON p.id = uop.position_id
     LEFT JOIN org_departments d ON d.id = p.department_id
     LEFT JOIN org_units un ON un.id = d.unit_id
     LEFT JOIN business_domains bd ON bd.code = 'project_management'
     LEFT JOIN department_business_domains dbd
       ON dbd.department_id = d.id
      AND dbd.business_domain_id = bd.id
     LEFT JOIN position_business_permissions pbp
       ON pbp.position_id = p.id
      AND pbp.business_domain_id = bd.id
     WHERE u.id = $1
     LIMIT 1`,
    [userId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  if (row.is_system_admin) {
    return {
      isSystemAdmin: true,
      unitId: row.unit_id,
      departmentId: row.department_id,
      positionId: row.position_id,
      dashboardVisible: true,
      aiChatVisible: true,
      projectsVisible: true,
      projectCreateAllowed: true,
      projectEditAllowed: true,
      projectDeleteAllowed: true,
      projectUploadAllowed: true,
      userQueryVisible: true,
      systemSettingsVisible: true,
    };
  }

  const projectDomainEnabled = row.department_project_management_enabled === true;

  return {
    isSystemAdmin: false,
    unitId: row.unit_id,
    departmentId: row.department_id,
    positionId: row.position_id,
    dashboardVisible: true,
    aiChatVisible: false,
    projectsVisible: true,
    projectCreateAllowed: projectDomainEnabled && row.project_can_create === true,
    projectEditAllowed: projectDomainEnabled && row.project_can_edit === true,
    projectDeleteAllowed: projectDomainEnabled && row.project_can_delete === true,
    projectUploadAllowed: projectDomainEnabled && row.project_can_upload === true,
    userQueryVisible: true,
    systemSettingsVisible: false,
  };
};

export const getSystemSettingsAccessInfo = getFeatureAccessInfo;

export const getDashboardVisibility = async (userId: number): Promise<boolean> => {
  const accessInfo = await getFeatureAccessInfo(userId);
  return accessInfo?.dashboardVisible ?? false;
};

export const getAIChatVisibility = async (userId: number): Promise<boolean> => {
  const accessInfo = await getFeatureAccessInfo(userId);
  return accessInfo?.aiChatVisible ?? false;
};

export const getProjectsVisibility = async (userId: number): Promise<boolean> => {
  const accessInfo = await getFeatureAccessInfo(userId);
  return accessInfo?.projectsVisible ?? false;
};

export const getProjectCreateAccess = async (userId: number): Promise<boolean> => {
  const accessInfo = await getFeatureAccessInfo(userId);
  return accessInfo?.projectCreateAllowed ?? false;
};

export const getProjectEditAccess = async (userId: number): Promise<boolean> => {
  const accessInfo = await getFeatureAccessInfo(userId);
  return accessInfo?.projectEditAllowed ?? false;
};

export const getProjectDeleteAccess = async (userId: number): Promise<boolean> => {
  const accessInfo = await getFeatureAccessInfo(userId);
  return accessInfo?.projectDeleteAllowed ?? false;
};

export const getUserQueryVisibility = async (userId: number): Promise<boolean> => {
  const accessInfo = await getFeatureAccessInfo(userId);
  return accessInfo?.userQueryVisible ?? false;
};

export const getSystemSettingsVisibility = async (userId: number): Promise<boolean> => {
  const accessInfo = await getFeatureAccessInfo(userId);
  return accessInfo?.systemSettingsVisible ?? false;
};
