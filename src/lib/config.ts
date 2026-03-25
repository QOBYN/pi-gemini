import 'dotenv/config';

export interface Config {
  port: number;
  authFile: string;
  secretKey: string;
  saltKey: string;
  adminKey: string;
  defaultModel: string;
  allowedOrigins: string[];
}

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

export function loadConfig(): Config {
  return {
    port: parseInt(process.env['PORT'] ?? '3004', 10),
    authFile: process.env['AUTH_FILE'] ?? 'auth.json',
    secretKey: required('SECRET_KEY'),
    saltKey: required('SALT_KEY'),
    adminKey: required('ADMIN_KEY'),
    defaultModel: process.env['DEFAULT_MODEL'] ?? 'gemini-2.0-flash',
    allowedOrigins: (process.env['ALLOWED_ORIGINS'] ?? '').split(',').map(s => s.trim()).filter(Boolean),
  };
}
