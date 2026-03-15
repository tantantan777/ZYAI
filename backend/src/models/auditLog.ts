import pool from '../config/database';

export const createAuditLogsTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_name VARCHAR(100),
      user_email VARCHAR(255),
      unit_name VARCHAR(200),
      department_name VARCHAR(200),
      position_name VARCHAR(200),
      action_type VARCHAR(32) NOT NULL,
      target_type VARCHAR(100) NOT NULL,
      target_name VARCHAR(255) NOT NULL,
      detail TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON audit_logs(action_type);
  `;

  await pool.query(query);
  await pool.query('ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS unit_name VARCHAR(200);');
  await pool.query('ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS department_name VARCHAR(200);');
  await pool.query('ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS position_name VARCHAR(200);');
};
