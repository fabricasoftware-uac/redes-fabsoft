import cron, { type ScheduledTask } from 'node-cron';
import { getEnv, requireEnv } from '../config/env.js';
import { generateAndSendPost } from '../pipeline/generatePost.js';
import { escapeHtml, getTelegramClient } from '../telegram/telegramClient.js';

let activeTask: ScheduledTask | null = null;

export function startScheduler(): ScheduledTask | null {
  const env = getEnv();

  if (!env.CRON_ENABLED) {
    console.log('[cron] Autonomous scheduler is disabled (CRON_ENABLED=false).');
    return null;
  }

  if (!cron.validate(env.CRON_SCHEDULE)) {
    throw new Error(`Invalid CRON_SCHEDULE expression: "${env.CRON_SCHEDULE}"`);
  }

  activeTask = cron.schedule(
    env.CRON_SCHEDULE,
    async () => {
      console.log('[cron] Triggering autonomous FabSoft post generation...');
      try {
        const post = await generateAndSendPost(null);
        console.log(`[cron] Generated and sent post ${post.id} (${post.template})`);
      } catch (err) {
        console.error('[cron] Autonomous post generation failed:', err);
        try {
          const telegram = getTelegramClient();
          const chatId = requireEnv('TELEGRAM_CHAT_ID');
          const msg = err instanceof Error ? err.message : String(err);
          await telegram.sendMessage({
            chatId,
            text: `⚠️ <b>Error en generación programada (Cron):</b>\n<code>${escapeHtml(msg.slice(0, 350))}</code>`,
            parseMode: 'HTML',
          });
        } catch (notifyErr) {
          console.error('[cron] Failed to notify Telegram about cron error:', notifyErr);
        }
      }
    },
    {
      timezone: env.CRON_TIMEZONE,
    }
  );

  console.log(
    `[cron] Scheduler active: "${env.CRON_SCHEDULE}" (${env.CRON_TIMEZONE})`
  );
  return activeTask;
}

export function stopScheduler(): void {
  if (activeTask) {
    activeTask.stop();
    activeTask = null;
  }
}
