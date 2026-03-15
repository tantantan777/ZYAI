import pool from '../config/database';

export const createProjectTables = async () => {
  const createTablesSql = `
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      manager VARCHAR(100),
      project_statuses TEXT[] NOT NULL DEFAULT '{}',
      cover_image TEXT,
      construction_address TEXT,
      project_code VARCHAR(100),
      project_type_id INTEGER REFERENCES project_types(id) ON DELETE SET NULL,
      construction_nature_id INTEGER REFERENCES construction_natures(id) ON DELETE SET NULL,
      construction_scale TEXT,
      cost NUMERIC(18, 2),
      planned_start_date DATE,
      planned_completion_date DATE,
      actual_start_date DATE,
      actual_completion_date DATE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_code)
    );

    CREATE TABLE IF NOT EXISTS project_units (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      unit_id INTEGER NOT NULL REFERENCES org_units(id) ON DELETE CASCADE,
      website TEXT,
      introduction TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_id, unit_id)
    );
  `;

  await pool.query(createTablesSql);
  await pool.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_statuses TEXT[] NOT NULL DEFAULT '{}';");
  await pool.query('ALTER TABLE projects ALTER COLUMN manager DROP NOT NULL;');
  await pool.query('ALTER TABLE projects ALTER COLUMN construction_address DROP NOT NULL;');
  await pool.query('ALTER TABLE projects ALTER COLUMN project_code DROP NOT NULL;');
  await pool.query('ALTER TABLE projects ALTER COLUMN construction_scale DROP NOT NULL;');
  await pool.query('ALTER TABLE projects ALTER COLUMN cost DROP NOT NULL;');
  await pool.query('ALTER TABLE projects ALTER COLUMN planned_start_date DROP NOT NULL;');
  await pool.query('ALTER TABLE projects ALTER COLUMN planned_completion_date DROP NOT NULL;');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_projects_project_type_id ON projects(project_type_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_projects_construction_nature_id ON projects(construction_nature_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_projects_project_statuses ON projects USING GIN(project_statuses);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_project_units_project_id ON project_units(project_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_project_units_unit_id ON project_units(unit_id);');
};
