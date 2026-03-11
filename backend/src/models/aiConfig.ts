import pool from '../config/database';

export interface AIConfig {
  id: number;
  user_id: number;
  provider: string;
  api_key: string;
  model: string;
  base_url?: string;
  openai_organization?: string;
  openai_project?: string;
  anthropic_version?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  top_k?: number;
  timeout_ms?: number;
  max_retries?: number;
  created_at: Date;
  updated_at: Date;
}

export const createAIConfigTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS ai_configs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider VARCHAR(50) NOT NULL,
      api_key TEXT NOT NULL,
      model VARCHAR(100) NOT NULL,
      base_url TEXT,
      openai_organization TEXT,
      openai_project TEXT,
      anthropic_version TEXT,
      temperature DOUBLE PRECISION,
      max_tokens INTEGER,
      top_p DOUBLE PRECISION,
      top_k INTEGER,
      timeout_ms INTEGER,
      max_retries INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id)
    );
  `;
  await pool.query(query);

  // Backward-compatible migrations: older installs created `ai_configs` without some columns.
  await pool.query(`ALTER TABLE ai_configs ADD COLUMN IF NOT EXISTS base_url TEXT;`);
  await pool.query(`ALTER TABLE ai_configs ADD COLUMN IF NOT EXISTS openai_organization TEXT;`);
  await pool.query(`ALTER TABLE ai_configs ADD COLUMN IF NOT EXISTS openai_project TEXT;`);
  await pool.query(`ALTER TABLE ai_configs ADD COLUMN IF NOT EXISTS anthropic_version TEXT;`);
  await pool.query(`ALTER TABLE ai_configs ADD COLUMN IF NOT EXISTS temperature DOUBLE PRECISION;`);
  await pool.query(`ALTER TABLE ai_configs ADD COLUMN IF NOT EXISTS max_tokens INTEGER;`);
  await pool.query(`ALTER TABLE ai_configs ADD COLUMN IF NOT EXISTS top_p DOUBLE PRECISION;`);
  await pool.query(`ALTER TABLE ai_configs ADD COLUMN IF NOT EXISTS top_k INTEGER;`);
  await pool.query(`ALTER TABLE ai_configs ADD COLUMN IF NOT EXISTS timeout_ms INTEGER;`);
  await pool.query(`ALTER TABLE ai_configs ADD COLUMN IF NOT EXISTS max_retries INTEGER;`);
};

export const createConversationsTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(200) NOT NULL,
      topic VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await pool.query(query);
};

export const createMessagesTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role VARCHAR(20) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await pool.query(query);
};
