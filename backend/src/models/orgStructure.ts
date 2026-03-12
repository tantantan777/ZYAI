import pool from '../config/database';

export const createOrgStructureTables = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS org_units (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      dashboard_visible BOOLEAN NOT NULL DEFAULT TRUE,
      ai_chat_visible BOOLEAN NOT NULL DEFAULT TRUE,
      projects_visible BOOLEAN NOT NULL DEFAULT TRUE,
      user_query_visible BOOLEAN NOT NULL DEFAULT TRUE,
      system_settings_visible BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(name)
    );

    CREATE TABLE IF NOT EXISTS org_departments (
      id SERIAL PRIMARY KEY,
      unit_id INTEGER NOT NULL REFERENCES org_units(id) ON DELETE CASCADE,
      name VARCHAR(200) NOT NULL,
      dashboard_visible BOOLEAN NOT NULL DEFAULT TRUE,
      ai_chat_visible BOOLEAN NOT NULL DEFAULT TRUE,
      projects_visible BOOLEAN NOT NULL DEFAULT TRUE,
      user_query_visible BOOLEAN NOT NULL DEFAULT TRUE,
      system_settings_visible BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(unit_id, name)
    );

    CREATE TABLE IF NOT EXISTS org_positions (
      id SERIAL PRIMARY KEY,
      department_id INTEGER NOT NULL REFERENCES org_departments(id) ON DELETE CASCADE,
      name VARCHAR(200) NOT NULL,
      dashboard_visible BOOLEAN NOT NULL DEFAULT TRUE,
      ai_chat_visible BOOLEAN NOT NULL DEFAULT TRUE,
      projects_visible BOOLEAN NOT NULL DEFAULT TRUE,
      user_query_visible BOOLEAN NOT NULL DEFAULT TRUE,
      system_settings_visible BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(department_id, name)
    );

    -- Later: logged-in users can bind themselves to a position.
    CREATE TABLE IF NOT EXISTS user_org_positions (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      position_id INTEGER REFERENCES org_positions(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_org_departments_unit_id ON org_departments(unit_id);
    CREATE INDEX IF NOT EXISTS idx_org_positions_department_id ON org_positions(department_id);
    CREATE INDEX IF NOT EXISTS idx_user_org_positions_position_id ON user_org_positions(position_id);
  `;

  await pool.query(query);

  const visibilityColumns = [
    'dashboard_visible',
    'ai_chat_visible',
    'projects_visible',
    'user_query_visible',
    'system_settings_visible',
  ];

  for (const tableName of ['org_units', 'org_departments', 'org_positions']) {
    for (const column of visibilityColumns) {
      await pool.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${column} BOOLEAN NOT NULL DEFAULT TRUE;`);
      await pool.query(`ALTER TABLE ${tableName} ALTER COLUMN ${column} SET DEFAULT TRUE;`);
      await pool.query(`UPDATE ${tableName} SET ${column} = TRUE WHERE ${column} IS NULL;`);
    }
  }
};
