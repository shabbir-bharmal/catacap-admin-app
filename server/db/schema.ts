import pool from "./pool.js";

export async function createSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      name VARCHAR(50) NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(128) PRIMARY KEY,
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      username VARCHAR(100),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255),
      account_balance DECIMAL(18,2) DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      date_created TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id VARCHAR(128) REFERENCES users(id),
      role_id INTEGER REFERENCES roles(id),
      PRIMARY KEY (user_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS themes (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255),
      user_id VARCHAR(128),
      themes VARCHAR(255),
      stage VARCHAR(50),
      fundraising_close_date TIMESTAMP,
      created_date TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS recommendations (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(128),
      user_email VARCHAR(255),
      user_full_name VARCHAR(255),
      campaign_id INTEGER REFERENCES campaigns(id),
      status VARCHAR(50),
      amount DECIMAL(18,2),
      date_created TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS groups (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS account_balance_change_logs (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(128),
      username VARCHAR(100),
      group_id INTEGER REFERENCES groups(id),
      campaign_id INTEGER,
      old_value DECIMAL(18,2),
      new_value DECIMAL(18,2),
      payment_type VARCHAR(100),
      fees DECIMAL(18,2),
      gross_amount DECIMAL(18,2),
      net_amount DECIMAL(18,2),
      change_date TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS requests (
      id SERIAL PRIMARY KEY,
      group_id INTEGER REFERENCES groups(id),
      user_id VARCHAR(128),
      status VARCHAR(50)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      record_id VARCHAR(255),
      table_name VARCHAR(100),
      action_type VARCHAR(50),
      old_values TEXT,
      new_values TEXT,
      changed_columns TEXT,
      updated_by VARCHAR(128),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
}
