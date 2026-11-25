import { timingSafeEqual } from 'node:crypto';
import Fastify from 'fastify';
import { assertServerEnv } from './config/env.js';
import { runMigrations } from './db/migrate.js';
import { checkDbConnection, closePool } from './db/pool.js';
import { startScheduler, stopScheduler } from './scheduler/cron.js';
import { processTelegramUpdate } from './telegram/handlers.js';

function verifyTelegramSecret(
  receivedHeader: string | string[] | undefined,
  expectedSecret: string
): boolean {
  if (typeof receivedHeader !== 'string' || receivedHeader.length === 0) {
    return false;
  }

  const receivedBuf = Buffer.from(receivedHeader, 'utf8');
  const expectedBuf = Buffer.from(expectedSecret, 'utf8');

  if (receivedBuf.length !== expectedBuf.length) {
    return false;
  }

  return timingSafeEqual(receivedBuf, expectedBuf);
}

async function bootstrap(): Promise<void> {
  const env = assertServerEnv();
  const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET!;

  // Run idempotent SQL migrations on startup
  await runMigrations();

  const app = Fastify({
    logger: env.NODE_ENV !== 'test',
    bodyLimit: 2 * 1024 * 1024,
  });

  app.get('/health', async (_request, reply) => {
    const dbOk = await checkDbConnection();
    const statusCode = dbOk ? 200 : 503;
    return reply.code(statusCode).send({
      status: dbOk ? 'ok' : 'degraded',
      database: dbOk ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/webhooks/telegram', async (request, reply) => {
    const tokenHeader = request.headers['x-telegram-bot-api-secret-token'];

    if (!verifyTelegramSecret(tokenHeader, webhookSecret)) {
      request.log.warn('Rejected Telegram webhook with invalid secret token');
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const body = request.body;

    // Respond 200 OK immediately so Telegram does not retry while AI/media runs
    void processTelegramUpdate(body).catch((err) => {
      request.log.error({ err }, 'Unhandled error processing Telegram update');
    });

    return reply.code(200).send({ ok: true });
  });

  startScheduler();

  await app.listen({ host: '0.0.0.0', port: env.PORT });
  console.log(`[server] FabSoft Social Pipeline listening on 0.0.0.0:${env.PORT}`);

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[server] Received ${signal}, shutting down gracefully...`);
    stopScheduler();
    await app.close();
    await closePool();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch(async (err) => {
  console.error('[server] Fatal startup error:', err);
  await closePool().catch(() => {});
  process.exit(1);
});
