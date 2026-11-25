import 'dotenv/config';
import { z } from 'zod';

const emptyToUndefined = (val: unknown): unknown => {
  if (typeof val === 'string' && val.trim() === '') {
    return undefined;
  }
  return val;
};

const optionalNonEmptyString = z.preprocess(emptyToUndefined, z.string().min(1).optional());

const booleanEnv = (defaultValue: boolean) =>
  z.preprocess((val) => {
    if (val === undefined || val === null) return undefined;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') {
      const normalized = val.trim().toLowerCase();
      if (normalized === '') return undefined;
      if (normalized === 'true' || normalized === '1') return true;
      if (normalized === 'false' || normalized === '0') return false;
    }
    return false;
  }, z.boolean().default(defaultValue));

export const envSchema = z.object({
  // Server
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PUBLIC_BASE_URL: optionalNonEmptyString,

  // PostgreSQL
  DATABASE_URL: optionalNonEmptyString,

  // AI Provider (OpenRouter or Google Gemini)
  AI_PROVIDER: z.enum(['auto', 'openrouter', 'gemini']).default('auto'),
  OPENROUTER_API_KEY: optionalNonEmptyString,
  OPENROUTER_TEXT_MODEL: z.string().min(1).default('google/gemini-2.5-flash'),
  OPENROUTER_IMAGE_MODEL: z.string().min(1).default('google/gemini-2.5-flash-image'),

  // Google Gemini (optional fallback)
  GEMINI_API_KEY: optionalNonEmptyString,
  GEMINI_TEXT_MODEL: z.string().min(1).default('gemini-2.5-flash'),
  GEMINI_IMAGE_MODEL: z.string().min(1).default('gemini-2.5-flash-image-preview'),

  // Cloudflare R2
  R2_ACCOUNT_ID: optionalNonEmptyString,
  R2_ACCESS_KEY_ID: optionalNonEmptyString,
  R2_SECRET_ACCESS_KEY: optionalNonEmptyString,
  R2_BUCKET_NAME: optionalNonEmptyString,
  R2_PUBLIC_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),

  // Telegram Bot
  TELEGRAM_BOT_TOKEN: optionalNonEmptyString,
  TELEGRAM_CHAT_ID: optionalNonEmptyString,
  TELEGRAM_WEBHOOK_SECRET: optionalNonEmptyString,

  // Instagram Meta Graph API (optional until Phase 4)
  INSTAGRAM_ACCESS_TOKEN: optionalNonEmptyString,
  INSTAGRAM_ACCOUNT_ID: optionalNonEmptyString,
  META_GRAPH_API_VERSION: z.string().min(1).default('v22.0'),

  // Scheduler / Cron
  CRON_ENABLED: booleanEnv(false),
  CRON_SCHEDULE: z.string().min(1).default('0 10 * * 1,3,5'),
  CRON_TIMEZONE: z.string().min(1).default('America/Bogota'),
  RECORDING_CRON_ENABLED: booleanEnv(true),
  RECORDING_CRON_SCHEDULE: z.string().min(1).default('0 9 * * 1,4'),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (!cachedEnv) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const formatted = parsed.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`Invalid environment variables:\n${formatted}`);
    }
    cachedEnv = parsed.data;
  }
  return cachedEnv;
}

export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = getEnv()[key];
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required environment variable: ${String(key)}`);
  }
  return value as NonNullable<Env[K]>;
}

const SERVER_REQUIRED_KEYS: Array<keyof Env> = [
  'DATABASE_URL',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_URL',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
  'TELEGRAM_WEBHOOK_SECRET',
];

export function assertServerEnv(): Env {
  const env = getEnv();
  const missing: string[] = SERVER_REQUIRED_KEYS.filter((k) => {
    const v = env[k];
    return v === undefined || v === null || v === '';
  }).map(String);

  if (!env.OPENROUTER_API_KEY && !env.GEMINI_API_KEY) {
    missing.push('OPENROUTER_API_KEY (or GEMINI_API_KEY)');
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables to start server:\n${missing.map((k) => `  - ${k}`).join('\n')}`
    );
  }
  return env;
}

export function isInstagramConfigured(env: Env = getEnv()): boolean {
  return Boolean(env.INSTAGRAM_ACCESS_TOKEN && env.INSTAGRAM_ACCOUNT_ID);
}
