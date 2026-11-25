import { GoogleGenAI } from '@google/genai';
import { getEnv, isInstagramConfigured } from '../config/env.js';
import { checkDbConnection, closePool } from '../db/pool.js';
import { R2Storage } from '../media/storage.js';
import { InstagramPublisher } from '../publishers/instagramPublisher.js';
import { TelegramClient } from '../telegram/telegramClient.js';

interface CheckResult {
  name: string;
  status: 'OK' | 'SKIP' | 'FAIL';
  detail: string;
}

async function main(): Promise<void> {
  const env = getEnv();
  const results: CheckResult[] = [];

  // 1. PostgreSQL
  if (!env.DATABASE_URL) {
    results.push({ name: 'PostgreSQL', status: 'SKIP', detail: 'DATABASE_URL not set' });
  } else {
    const ok = await checkDbConnection();
    results.push({
      name: 'PostgreSQL',
      status: ok ? 'OK' : 'FAIL',
      detail: ok ? 'Connected (SELECT 1)' : 'Could not connect to DATABASE_URL',
    });
  }

  // 2. AI Provider (OpenRouter preferred, fallback Gemini)
  if (
    env.AI_PROVIDER === 'openrouter' ||
    (env.AI_PROVIDER === 'auto' && env.OPENROUTER_API_KEY)
  ) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://fabsoft.app',
          'X-Title': 'FabSoft Social Pipeline',
        },
        body: JSON.stringify({
          model: env.OPENROUTER_TEXT_MODEL,
          max_tokens: 16,
          messages: [{ role: 'user', content: 'Responde únicamente con: OK' }],
        }),
      });
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };
      if (!res.ok || json.error) {
        throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      }
      results.push({
        name: 'OpenRouter AI',
        status: json.choices?.[0]?.message?.content ? 'OK' : 'FAIL',
        detail: `Model ${env.OPENROUTER_TEXT_MODEL} responded`,
      });
    } catch (err) {
      results.push({
        name: 'OpenRouter AI',
        status: 'FAIL',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  } else if (!env.GEMINI_API_KEY) {
    results.push({ name: 'AI Provider', status: 'SKIP', detail: 'OPENROUTER_API_KEY / GEMINI_API_KEY not set' });
  } else {
    try {
      const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
      const res = await ai.models.generateContent({
        model: env.GEMINI_TEXT_MODEL,
        contents: 'Responde únicamente con: OK',
      });
      results.push({
        name: 'Google Gemini',
        status: res.text ? 'OK' : 'FAIL',
        detail: `Model ${env.GEMINI_TEXT_MODEL} responded`,
      });
    } catch (err) {
      results.push({
        name: 'Google Gemini',
        status: 'FAIL',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 3. Cloudflare R2
  if (
    !env.R2_ACCOUNT_ID ||
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY ||
    !env.R2_BUCKET_NAME ||
    !env.R2_PUBLIC_URL
  ) {
    results.push({ name: 'Cloudflare R2', status: 'SKIP', detail: 'R2_* variables incomplete' });
  } else {
    const r2 = new R2Storage();
    const ok = await r2.checkConnection();
    results.push({
      name: 'Cloudflare R2',
      status: ok ? 'OK' : 'FAIL',
      detail: ok ? `Bucket "${env.R2_BUCKET_NAME}" reachable` : 'HeadBucket failed',
    });
  }

  // 4. Telegram Bot
  if (!env.TELEGRAM_BOT_TOKEN) {
    results.push({ name: 'Telegram Bot', status: 'SKIP', detail: 'TELEGRAM_BOT_TOKEN not set' });
  } else {
    try {
      const tg = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
      const me = await tg.getMe();
      results.push({
        name: 'Telegram Bot',
        status: 'OK',
        detail: `Authenticated as @${me.username ?? me.first_name}`,
      });
    } catch (err) {
      results.push({
        name: 'Telegram Bot',
        status: 'FAIL',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 5. Instagram Meta Graph API (optional until Phase 4)
  if (!isInstagramConfigured(env)) {
    results.push({
      name: 'Instagram Graph API',
      status: 'SKIP',
      detail: 'Optional until Phase 4 (INSTAGRAM_* not set)',
    });
  } else {
    const ig = new InstagramPublisher();
    const res = await ig.checkConnection();
    results.push({
      name: 'Instagram Graph API',
      status: res.ok ? 'OK' : 'FAIL',
      detail: res.ok
        ? `Connected (${res.username ? `@${res.username}` : env.INSTAGRAM_ACCOUNT_ID})`
        : 'Account lookup failed',
    });
  }

  console.log('\n=== FabSoft Pipeline — Connection Check ===\n');
  for (const r of results) {
    const icon = r.status === 'OK' ? '✅' : r.status === 'SKIP' ? '⏭️' : '❌';
    console.log(`${icon} [${r.status}] ${r.name}: ${r.detail}`);
  }
  console.log('');

  await closePool();

  const hasFailures = results.some((r) => r.status === 'FAIL');
  process.exit(hasFailures ? 1 : 0);
}

main().catch(async (err) => {
  console.error('[check] Unexpected error:', err);
  await closePool().catch(() => {});
  process.exit(1);
});
