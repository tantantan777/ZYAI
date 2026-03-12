import pool from '../config/database';

export const createUsersTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS verification_codes (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      code VARCHAR(6) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN DEFAULT FALSE
    );

    CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON verification_codes(email);
    CREATE INDEX IF NOT EXISTS idx_verification_codes_expires ON verification_codes(expires_at);
  `;

  await pool.query(query);

  // Backward-compatible migrations
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(100);`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(100);`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(20);`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS hire_date DATE;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP;`);

  const visibilityColumns = [
    'dashboard_visible',
    'ai_chat_visible',
    'projects_visible',
    'user_query_visible',
    'system_settings_visible',
  ];

  for (const column of visibilityColumns) {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${column} BOOLEAN NOT NULL DEFAULT TRUE;`);
    await pool.query(`ALTER TABLE users ALTER COLUMN ${column} SET DEFAULT TRUE;`);
    await pool.query(`UPDATE users SET ${column} = TRUE WHERE ${column} IS NULL;`);
  }
};
