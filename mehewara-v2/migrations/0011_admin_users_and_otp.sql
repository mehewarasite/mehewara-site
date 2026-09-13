-- Migration: 0011_admin_users_and_otp.sql
-- Description: Create personalized admin users table and OTP verification table

CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE CHECK (length(username) >= 3 AND length(username) <= 50),
  name TEXT NOT NULL DEFAULT '' CHECK (length(name) <= 100),
  email TEXT NOT NULL UNIQUE CHECK (length(email) >= 5 AND length(email) <= 100),
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'super-admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS admin_users_username_idx ON admin_users(username);
CREATE INDEX IF NOT EXISTS admin_users_email_idx ON admin_users(email);
CREATE INDEX IF NOT EXISTS admin_users_status_idx ON admin_users(status);

CREATE TABLE IF NOT EXISTS admin_otp_tokens (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  otp_code TEXT NOT NULL CHECK (length(otp_code) = 6),
  purpose TEXT NOT NULL CHECK (purpose IN ('signup', 'password_reset')),
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS admin_otp_tokens_email_purpose_idx ON admin_otp_tokens(email, purpose);
CREATE INDEX IF NOT EXISTS admin_otp_tokens_expires_idx ON admin_otp_tokens(expires_at);
