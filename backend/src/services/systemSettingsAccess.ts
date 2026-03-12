import pool from '../config/database';

export type FeatureAccessInfo = {
  dashboardVisible: boolean;
  aiChatVisible: boolean;
  projectsVisible: boolean;
  userQueryVisible: boolean;
  systemSettingsVisible: boolean;
};

type FeatureAccessRow = {
  user_dashboard_visible: boolean;
  unit_dashboard_visible: boolean | null;
  department_dashboard_visible: boolean | null;
  position_dashboard_visible: boolean | null;
  user_ai_chat_visible: boolean;
  unit_ai_chat_visible: boolean | null;
  department_ai_chat_visible: boolean | null;
  position_ai_chat_visible: boolean | null;
  user_projects_visible: boolean;
  unit_projects_visible: boolean | null;
  department_projects_visible: boolean | null;
  position_projects_visible: boolean | null;
  user_user_query_visible: boolean;
  unit_user_query_visible: boolean | null;
  department_user_query_visible: boolean | null;
  position_user_query_visible: boolean | null;
  user_system_settings_visible: boolean;
  unit_system_settings_visible: boolean | null;
  department_system_settings_visible: boolean | null;
  position_system_settings_visible: boolean | null;
};

function resolveVisibility(
  userVisible: boolean,
  unitVisible: boolean | null,
  departmentVisible: boolean | null,
  positionVisible: boolean | null,
) {
  return userVisible !== false && unitVisible !== false && departmentVisible !== false && positionVisible !== false;
}

export const getFeatureAccessInfo = async (userId: number): Promise<FeatureAccessInfo | null> => {
  const result = await pool.query(
    `SELECT
       COALESCE(u.dashboard_visible, TRUE) as user_dashboard_visible,
       un.dashboard_visible as unit_dashboard_visible,
       d.dashboard_visible as department_dashboard_visible,
       p.dashboard_visible as position_dashboard_visible,
       COALESCE(u.ai_chat_visible, TRUE) as user_ai_chat_visible,
       un.ai_chat_visible as unit_ai_chat_visible,
       d.ai_chat_visible as department_ai_chat_visible,
       p.ai_chat_visible as position_ai_chat_visible,
       COALESCE(u.projects_visible, TRUE) as user_projects_visible,
       un.projects_visible as unit_projects_visible,
       d.projects_visible as department_projects_visible,
       p.projects_visible as position_projects_visible,
       COALESCE(u.user_query_visible, TRUE) as user_user_query_visible,
       un.user_query_visible as unit_user_query_visible,
       d.user_query_visible as department_user_query_visible,
       p.user_query_visible as position_user_query_visible,
       COALESCE(u.system_settings_visible, TRUE) as user_system_settings_visible,
       un.system_settings_visible as unit_system_settings_visible,
       d.system_settings_visible as department_system_settings_visible,
       p.system_settings_visible as position_system_settings_visible
     FROM users u
     LEFT JOIN user_org_positions uop ON uop.user_id = u.id
     LEFT JOIN org_positions p ON p.id = uop.position_id
     LEFT JOIN org_departments d ON d.id = p.department_id
     LEFT JOIN org_units un ON un.id = d.unit_id
     WHERE u.id = $1`,
    [userId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0] as FeatureAccessRow;

  return {
    dashboardVisible: resolveVisibility(
      row.user_dashboard_visible,
      row.unit_dashboard_visible,
      row.department_dashboard_visible,
      row.position_dashboard_visible,
    ),
    aiChatVisible: resolveVisibility(
      row.user_ai_chat_visible,
      row.unit_ai_chat_visible,
      row.department_ai_chat_visible,
      row.position_ai_chat_visible,
    ),
    projectsVisible: resolveVisibility(
      row.user_projects_visible,
      row.unit_projects_visible,
      row.department_projects_visible,
      row.position_projects_visible,
    ),
    userQueryVisible: resolveVisibility(
      row.user_user_query_visible,
      row.unit_user_query_visible,
      row.department_user_query_visible,
      row.position_user_query_visible,
    ),
    systemSettingsVisible: resolveVisibility(
      row.user_system_settings_visible,
      row.unit_system_settings_visible,
      row.department_system_settings_visible,
      row.position_system_settings_visible,
    ),
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

export const getUserQueryVisibility = async (userId: number): Promise<boolean> => {
  const accessInfo = await getFeatureAccessInfo(userId);
  return accessInfo?.userQueryVisible ?? false;
};

export const getSystemSettingsVisibility = async (userId: number): Promise<boolean> => {
  const accessInfo = await getFeatureAccessInfo(userId);
  return accessInfo?.systemSettingsVisible ?? false;
};
